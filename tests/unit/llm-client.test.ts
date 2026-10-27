import { describe, expect, it, vi } from 'vitest';
import { LlmClient, type ModelSettings } from '@/src/llm/client';
import { obj, str } from '@/src/llm/validate';

const settings: ModelSettings = { baseUrl: 'https://api.example.com/v1/', model: 'm1', apiKey: 'sk-secret', embeddingModel: 'e1' };

function fakeFetch(status: number, body: unknown) {
  return vi.fn(async (_url: string | URL | Request, _init?: RequestInit) =>
    new Response(typeof body === 'string' ? body : JSON.stringify(body), { status }),
  );
}

const reply = (content: string) => ({ choices: [{ message: { content } }] });

describe('LlmClient', () => {
  it('refuses to exist without base URL, model and key', () => {
    expect(() => new LlmClient({ ...settings, apiKey: '' })).toThrow('Model is not configured');
  });

  it('posts an OpenAI-compatible chat request', async () => {
    const f = fakeFetch(200, reply(' hello '));
    expect(await new LlmClient(settings, f).chat([{ role: 'user', content: 'hi' }])).toBe('hello');
    const [url, init] = f.mock.calls[0]!;
    expect(url).toBe('https://api.example.com/v1/chat/completions');
    expect(init!.headers).toMatchObject({ authorization: 'Bearer sk-secret' });
    expect(JSON.parse(init!.body as string)).toEqual({ model: 'm1', messages: [{ role: 'user', content: 'hi' }] });
  });

  it('surfaces the provider error message without leaking the key', async () => {
    const f = fakeFetch(401, { error: { message: 'Incorrect API key provided' } });
    const err: unknown = await new LlmClient(settings, f).chat([]).then(
      () => null,
      (e: unknown) => e,
    );
    expect((err as Error).message).toBe('HTTP 401: Incorrect API key provided');
    expect((err as Error).message).not.toContain('sk-secret');
  });

  it('keeps non-JSON error bodies', async () => {
    await expect(new LlmClient(settings, fakeFetch(502, 'Bad gateway')).chat([])).rejects.toThrow('HTTP 502: Bad gateway');
  });

  it('parses JSON replies, tolerating a code fence, and validates shape', async () => {
    const client = new LlmClient(settings, fakeFetch(200, reply('```json\n{"a":"x"}\n```')));
    expect(await client.json([], (v) => str(obj(v), 'a'))).toBe('x');
    const bad = new LlmClient(settings, fakeFetch(200, reply('not json')));
    await expect(bad.json([], (v) => v)).rejects.toThrow('Model did not return JSON');
    const wrong = new LlmClient(settings, fakeFetch(200, reply('{"b":1}')));
    await expect(wrong.json([], (v) => str(obj(v), 'a'))).rejects.toThrow('Expected non-empty string "a"');
  });

  it('embeds in input order', async () => {
    const f = fakeFetch(200, { data: [{ index: 1, embedding: [2] }, { index: 0, embedding: [1] }] });
    expect(await new LlmClient(settings, f).embed(['a', 'b'])).toEqual([[1], [2]]);
    expect(JSON.parse(f.mock.calls[0]![1]!.body as string)).toEqual({ model: 'e1', input: ['a', 'b'] });
  });

  it('refuses to embed without an embedding model', async () => {
    await expect(new LlmClient({ ...settings, embeddingModel: '' }).embed(['a'])).rejects.toThrow('Embedding model is not configured');
  });
});
