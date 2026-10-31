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

/**
 * What the mock "knows" about prerequisites, per domain, and which words in a
 * question point to which concept. Enough structure for diagnosis tests:
 * transpose, multiplication order and trace all rest on "Matrix operation rules".
 */
const MOCK_GRAPH: Record<string, [string, string][]> = {
  'Linear algebra': [
    ['Matrix basics', 'Matrix operation rules'],
    ['Matrix operation rules', 'Transpose properties'],
    ['Matrix operation rules', 'Matrix multiplication order'],
    ['Matrix operation rules', 'Trace properties'],
  ],
  'Matrix calculus': [
    ['Derivative basics', 'Layout conventions'],
    ['Layout conventions', 'Matrix derivatives'],
  ],
};
const MOCK_TAGS: [RegExp, string, string][] = [
  [/transpose|转置/i, 'Linear algebra', 'Transpose properties'],
  [/multipl|乘法/i, 'Linear algebra', 'Matrix multiplication order'],
  [/trace|迹/i, 'Linear algebra', 'Trace properties'],
  [/derivative|gradient|求导|梯度/i, 'Matrix calculus', 'Matrix derivatives'],
  [/layout|布局/i, 'Matrix calculus', 'Layout conventions'],
];

function tagReply(user: string): string {
  const tags = [...user.matchAll(/^\[(\d+)\] (.*)$/gm)].map(([, n, text]) => {
    const hits = MOCK_TAGS.filter(([re]) => re.test(text!));
    return { ask: Number(n), domain: hits[0]?.[1] ?? '', concepts: [...new Set(hits.filter((h) => h[1] === hits[0]![1]).map((h) => h[2]))] };
  });
  return JSON.stringify({ tags });
}

function prereqReply(user: string): string {
  const domain = between(user, 'Domain:');
  const existing = new Set(between(user, 'Existing concepts:').split('; ').filter(Boolean));
  const required = between(user, 'Required concepts:').split('; ').filter(Boolean);
  const graph = MOCK_GRAPH[domain] ?? [];
  const names = [...new Set([...graph.flat(), ...required])];
  const concepts = names.filter((n) => !existing.has(n));
  // Unknown required concepts hang under the domain's first concept.
  const extra = required.filter((r) => !graph.flat().includes(r) && graph.length).map((r) => [graph[0]![0], r] as [string, string]);
  const edges = [...graph, ...extra].map(([from, to]) => ({ from, to }));
  return JSON.stringify({ concepts, edges: existing.size ? edges.filter((e) => concepts.includes(e.to)) : edges });
}

function chatReply(task: string, user: string): string {
  switch (task) {
    case 'ping':
      return 'OK';
    case 'tag':
      return tagReply(user);
    case 'prereq':
      return prereqReply(user);
    case 'circling':
      return JSON.stringify(/derivative|求导|dimension|维度/i.test(user) ? { domain: 'Matrix calculus', concept: 'Layout conventions' } : { domain: '', concept: '' });
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
