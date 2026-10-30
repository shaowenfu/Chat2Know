import { createServer, type IncomingMessage } from 'node:http';
import type { AddressInfo } from 'node:net';

/**
 * Deterministic OpenAI-compatible server for tests. Routes chat requests on the
 * `[task:<name>]` tag that every prompt carries. Accepts only `Bearer test-key`.
 */

export const MOCK_KEY = 'test-key';

export interface RecordedRequest {
  path: string;
  authorization: string | undefined;
  body: { model: string; messages?: { role: string; content: string }[]; input?: string[] };
}

export interface MockLlm {
  url: string;
  requests: RecordedRequest[];
  close(): Promise<void>;
}

const read = (req: IncomingMessage) =>
  new Promise<string>((resolve) => {
    let data = '';
    req.on('data', (c) => (data += c));
    req.on('end', () => resolve(data));
  });

function between(text: string, start: string, end = '\n'): string {
  const at = text.indexOf(start);
  if (at < 0) return '';
  const rest = text.slice(at + start.length);
  const stop = rest.indexOf(end);
  return (stop < 0 ? rest : rest.slice(0, stop)).trim();
}

function chatReply(task: string, user: string): string {
  switch (task) {
    case 'ping':
      return 'OK';
    case 'answer':
      return `Mock answer to: ${between(user, 'My question:')}`;
    case 'suggest': {
      const q = between(user, 'Question:');
      if (/internvl/i.test(q))
        return JSON.stringify({
          kind: 'instance',
          titles: ['Which concept is InternVL3.5 an example of?', 'What makes InternVL3.5 a VLM?', 'Where does InternVL3.5 fit?'],
          summary: 'InternVL3.5 is an example of a VLM.',
          concept: 'VLM',
        });
      if (/name|由来/i.test(q))
        return JSON.stringify({ kind: 'curiosity', titles: ['Why this name?', 'Name origin?', 'Who named it?'], summary: 'A naming detail.' });
      return JSON.stringify({
        kind: 'concept',
        titles: [`What parts make up ${q.replace(/\?$/, '')}?`, `Why does ${q.replace(/\?$/, '')} work?`, `When is ${q.replace(/\?$/, '')} used?`],
        summary: `Mock statement about ${q}`,
      });
    }
    case 'distill': {
      const first = user.split(/(?<=[.。!?])\s/)[0]!.slice(0, 120);
      return JSON.stringify({ titles: ['What is the key idea?', 'Why does it hold?', 'How is it applied?'], summary: `Distilled: ${first}` });
    }
    case 'problem':
      return `Problem: use this to solve a case. ${between(user, 'Knowledge question:')}`;
    case 'judgeApply':
    case 'judge': {
      // Pass when the learner's answer (or solution) shares a 4+ letter word with the expected answer.
      const words = (s: string) => new Set(s.toLowerCase().match(/[a-z]{4,}/g) ?? []);
      const apply = task === 'judgeApply';
      const expected = words(between(user, apply ? 'Knowledge it needs:\n' : 'Expected answer:\n', '\n\n'));
      const hit = [...words(between(user, apply ? "Learner's solution:\n" : "Learner's answer:\n", '\u0000'))].some((w) => expected.has(w));
      return JSON.stringify(hit ? { verdict: 'pass', feedback: 'Covers the key point.' } : { verdict: 'fail', feedback: 'Misses the key point.' });
    }
    case 'explain': {
      // A point passes when the explanation shares a 4+ letter word with its statement.
      const words = (s: string) => new Set(s.toLowerCase().match(/[a-z]{4,}/g) ?? []);
      const said = words(between(user, 'Explanation:\n', '\u0000'));
      const points = [...user.matchAll(/^\[(\d+)\] .*? — (.*)$/gm)].map(([, n, statement]) => {
        const hit = [...words(statement!)].some((w) => said.has(w));
        return { point: Number(n), verdict: hit ? 'pass' : 'fail', feedback: hit ? 'Explained.' : 'Missing.' };
      });
      return JSON.stringify({ feedback: 'Mock overall feedback.', points });
    }
    case 'oneMinute':
      return `In one minute: ${between(user, 'Topic:')} comes down to ${user.match(/^- /gm)?.length ?? 0} points.`;
    case 'organize': {
      // One card per substantial paragraph, quoting its first sentence verbatim.
      const cards = user
        .split(/\n\s*\n/)
        .map((p) => p.trim())
        .filter((p) => p.length > 40 && !p.startsWith('```') && !p.startsWith('|'))
        .slice(0, 5)
        .map((p) => {
          const first = p.split(/(?<=[.。!?！？])\s*/)[0]!;
          return { question: `What does this say: ${first.split(/\s+/).slice(0, 4).join(' ')}?`, summary: first, quote: first };
        });
      return JSON.stringify({ cards });
    }
    default:
      return `Unknown task ${task}`;
  }
}

/** Bag-of-words hashing into 64 dims: texts sharing words get similar vectors. */
export function mockEmbedding(text: string): number[] {
  const v = new Array<number>(64).fill(0);
  for (const word of text.toLowerCase().match(/[\p{L}\p{N}]+/gu) ?? []) {
    let h = 0;
    for (const ch of word) h = (h * 31 + ch.codePointAt(0)!) >>> 0;
    v[h % 64]! += 1;
  }
  const norm = Math.hypot(...v) || 1;
  return v.map((x) => x / norm);
}

export async function startMockLlm(): Promise<MockLlm> {
  const requests: RecordedRequest[] = [];
  const server = createServer(async (req, res) => {
    const body = JSON.parse((await read(req)) || '{}') as RecordedRequest['body'];
    const path = (req.url ?? '').replace(/^\/v1/, '');
    requests.push({ path, authorization: req.headers.authorization, body });
    const send = (status: number, payload: unknown) =>
      res.writeHead(status, { 'content-type': 'application/json' }).end(JSON.stringify(payload));

    if (req.headers.authorization !== `Bearer ${MOCK_KEY}`) return send(401, { error: { message: 'Invalid API key' } });
    if (path === '/embeddings') {
      return send(200, { data: (body.input ?? []).map((t, index) => ({ index, embedding: mockEmbedding(t) })) });
    }
    if (path !== '/chat/completions') return send(404, { error: { message: `No route ${path}` } });
    const systemMsg = body.messages?.find((m) => m.role === 'system')?.content ?? '';
    const user = body.messages?.filter((m) => m.role === 'user').map((m) => m.content).join('\n') ?? '';
    if (user.includes('FAIL_MODEL')) return send(500, { error: { message: 'Mock failure' } });
    const task = /\[task:(\w+)\]/.exec(systemMsg)?.[1] ?? 'ping';
    send(200, { choices: [{ message: { role: 'assistant', content: chatReply(task, user) } }] });
  });
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
  return {
    url: `http://127.0.0.1:${(server.address() as AddressInfo).port}/v1`,
    requests,
    close: () => new Promise((r) => server.close(() => r())),
  };
}
