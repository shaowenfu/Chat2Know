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
    if (!settings.baseUrl || !settings.model || !settings.apiKey) throw new LlmError('Model is not configured');
  }

  private async post(path: string, body: object): Promise<unknown> {
    const res = await this.fetchFn(endpoint(this.settings.baseUrl, path), {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${this.settings.apiKey}` },
      body: JSON.stringify(body),
    });
    const text = await res.text();
    if (!res.ok) {
      let detail = text.slice(0, 300);
      try {
        detail = (JSON.parse(text) as { error?: { message?: string } }).error?.message ?? detail;
      } catch {
        // Not JSON: keep the raw text.
      }
      throw new LlmError(`HTTP ${res.status}: ${detail}`);
    }
    return JSON.parse(text) as unknown;
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
