import { UserError } from '@/src/errors';
/** Model connection the user configures: any OpenAI-compatible endpoint. */
export interface ModelSettings {
  baseUrl: string; // e.g. https://api.openai.com/v1
  model: string;
  apiKey: string;
  embeddingModel: string; // empty disables embedding-based features
}

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export class LlmError extends Error {
  override name = 'LlmError';
}

type Fetch = typeof fetch;

const endpoint = (base: string, path: string) => `${base.replace(/\/+$/, '')}/${path}`;

/** Thin client for `/chat/completions` and `/embeddings`. Errors are thrown as-is for the UI to show. */
export class LlmClient {
  constructor(
    private readonly settings: ModelSettings,
    private readonly fetchFn: Fetch = (...args) => fetch(...args),
  ) {
    if (!settings.baseUrl || !settings.model || !settings.apiKey) throw new UserError('error.modelNotConfigured');
  }

  private async request(path: string, body: object, signal?: AbortSignal): Promise<Response> {
    const res = await this.fetchFn(endpoint(this.settings.baseUrl, path), {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${this.settings.apiKey}` },
      body: JSON.stringify(body),
      ...(signal ? { signal } : {}),
    });
    if (!res.ok) {
      const text = await res.text();
      let detail = text.slice(0, 300);
      try {
        detail = (JSON.parse(text) as { error?: { message?: string } }).error?.message ?? detail;
      } catch {
        // Not JSON: keep the raw text.
      }
      throw new LlmError(`HTTP ${res.status}: ${detail}`);
    }
    return res;
  }

  private async post(path: string, body: object): Promise<unknown> {
    return JSON.parse(await (await this.request(path, body)).text()) as unknown;
  }

  /** A chat answer as it is written: the text of each server-sent delta, in order. */
  async *stream(messages: ChatMessage[], signal?: AbortSignal): AsyncGenerator<string> {
    const res = await this.request('chat/completions', { model: this.settings.model, messages, stream: true }, signal);
    if (!res.body) throw new LlmError('Response has no body');
    const reader = res.body.pipeThrough(new TextDecoderStream()).getReader();
    let buffer = '';
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += value;
      const lines = buffer.split('\n');
      buffer = lines.pop()!;
      for (const line of lines) {
        const data = /^data:\s?(.*)$/.exec(line.trim())?.[1];
        if (data === undefined || data === '') continue;
        if (data === '[DONE]') return;
        let event: { choices?: { delta?: { content?: unknown } }[]; error?: { message?: string } };
        try {
          event = JSON.parse(data) as typeof event;
        } catch {
          throw new LlmError(`Unexpected stream event: ${data.slice(0, 200)}`);
        }
        if (event.error) throw new LlmError(event.error.message ?? 'Stream error');
        const delta = event.choices?.[0]?.delta?.content;
        if (typeof delta === 'string' && delta) yield delta;
      }
    }
  }

  async chat(messages: ChatMessage[]): Promise<string> {
    const data = (await this.post('chat/completions', { model: this.settings.model, messages })) as {
      choices?: { message?: { content?: unknown } }[];
    };
    const content = data.choices?.[0]?.message?.content;
    if (typeof content !== 'string') throw new LlmError('Response has no message content');
    return content.trim();
  }

  /** Chat that must return one JSON object; `parse` validates its shape and throws on mismatch. */
  async json<T>(messages: ChatMessage[], parse: (value: unknown) => T): Promise<T> {
    const reply = await this.chat(messages);
    const body = reply.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
    let value: unknown;
    try {
      value = JSON.parse(body);
    } catch {
      throw new LlmError(`Model did not return JSON: ${reply.slice(0, 200)}`);
    }
    return parse(value);
  }

  async embed(texts: string[]): Promise<number[][]> {
    if (!this.settings.embeddingModel) throw new LlmError('Embedding model is not configured');
    const data = (await this.post('embeddings', { model: this.settings.embeddingModel, input: texts })) as {
      data?: { index: number; embedding: number[] }[];
    };
    if (!Array.isArray(data.data) || data.data.length !== texts.length) throw new LlmError('Unexpected embeddings response');
    return [...data.data].sort((a, b) => a.index - b.index).map((d) => d.embedding);
  }
}
