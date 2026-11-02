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

/** Words in a question that point to a topic title (besides the title itself). */
const MOCK_TAGS: [RegExp, string][] = [
  [/transpose|转置/i, '转置'],
  [/multipl|乘法/i, '矩阵乘法'],
  [/trace|迹/i, '迹'],
  [/inverse|逆/i, '逆矩阵'],
];
/** Prerequisites between topic titles the mock knows. */
const MOCK_PREREQS: [string, string][] = [
  ['矩阵乘法', '转置'],
  ['矩阵乘法', '逆矩阵'],
  ['转置', '特征值与特征向量'],
];

const list = (text: string, header: string) =>
  [...(text.split(`${header}:\n`)[1] ?? '').matchAll(/^\[(\d+)\] (.*)$/gm)].map(([, n, t]) => ({ n: Number(n), text: t!, last: t!.split(' › ').at(-1)! }));

function tagReply(user: string): string {
  const topics = list(user, 'Topics');
  const tags = list(user.split('\n\nTopics:')[0]!, 'Questions').map((q) => {
    const titles = new Set([...MOCK_TAGS.filter(([re]) => re.test(q.text)).map(([, t]) => t), ...topics.filter((t) => q.text.includes(t.last)).map((t) => t.last)]);
    return { ask: q.n, sections: topics.filter((t) => titles.has(t.last)).map((t) => t.n).slice(0, 3) };
  });
  return JSON.stringify({ tags });
}

function prereqReply(user: string): string {
  const topics = list(user, 'Topics');
  const n = (title: string) => topics.find((t) => t.last === title)?.n;
  return JSON.stringify({ edges: MOCK_PREREQS.map(([a, b]) => ({ from: n(a), to: n(b) })).filter((e) => e.from && e.to) });
}

function fillReply(user: string): string {
  const topic = between(user, 'Topic:').split(' › ').at(-1)!;
  if (topic === '转置') {
    return JSON.stringify({
      items: [
        { type: 'formula', text: '(AB)^T = B^T A^T' },
        { type: 'formula', text: '(A+B)^T = A^T + B^T' },
        { type: 'formula', text: '(A^T)^T = A' },
        { type: 'statement', text: 'A 与 A^T 的秩相同。' },
      ],
    });
  }
  return JSON.stringify({ items: [{ type: 'statement', text: `${topic}的定义。` }] });
}

/** Where the mock files a note, by words in it: first match wins. */
const MOCK_PLACES: [RegExp, string, string[]][] = [
  [/attention|softmax/i, '深度学习', ['注意力机制']],
  [/\^T|\^\{T\}|\\top|transpose|转置/i, '线性代数', ['矩阵', '转置']],
  [/\\det|determinant|行列式/i, '线性代数', ['行列式']],
];

/** The prompt in either language: "Note (formula): …" or "笔记 (公式): …", and "Map: …" / "导图: …". */
function placeReply(user: string): string {
  const m = /^(?:Note|笔记) \((formula|text|公式|文字)\): (.*)$/m.exec(user);
  const [type, text] = [m?.[1] ?? 'formula', m?.[2] ?? ''];
  const unnamed = /^(?:Map|导图): (?:\(unnamed\)|（未命名）)$/m.test(user);
  // The mock's place for the note: the map name it would give, and the path below the map.
  const [, mapName, path] = MOCK_PLACES.find(([re]) => re.test(text)) ?? [null, '线性代数', ['其他']];
  // A statement keeps its first sentence.
  const statement = type === 'text' || type === '文字' ? (text.split(/(?<=[.。])\s*/)[0] ?? text) : '';
  return JSON.stringify({ path, statement, mapName: unnamed ? mapName : '' });
}

const MOCK_OUTLINE = [
  { title: '向量与向量空间', children: [] },
  { title: '矩阵', children: [{ title: '矩阵乘法', children: [] }, { title: '转置', children: [] }, { title: '逆矩阵', children: [] }, { title: '秩', children: [] }] },
  { title: '行列式', children: [] },
  { title: '线性方程组', children: [] },
  { title: '特征值与特征向量', children: [] },
  { title: '二次型', children: [] },
];

/** A pasted table of contents: each unindented line a chapter, indented lines its topics; else the standard outline. */
function outlineReply(user: string): string {
  const toc = user.split('Table of contents:\n')[1];
  if (!toc && /^Subject: 深度学习$/m.test(user)) {
    return JSON.stringify({ outline: ['神经网络', '注意力机制', '优化', '正则化'].map((title) => ({ title, children: [] })) });
  }
  if (!toc) return JSON.stringify({ outline: MOCK_OUTLINE });
  const outline: { title: string; children: { title: string; children: [] }[] }[] = [];
  for (const line of toc.split('\n').filter((l) => l.trim())) {
    const title = line.trim().replace(/^[\d.]+\s*/, '');
    if (/^\s/.test(line) && outline.length) outline.at(-1)!.children.push({ title, children: [] });
    else outline.push({ title, children: [] });
  }
  return JSON.stringify({ outline });
}

export function chatReply(task: string, user: string): string {
  switch (task) {
    case 'ping':
      return 'OK';
    case 'tag':
      return tagReply(user);
    case 'prereq':
      return prereqReply(user);
    case 'outline':
      return outlineReply(user);
    case 'place':
      return placeReply(user);
    case 'fill':
      return fillReply(user);
    case 'quiz':
      return JSON.stringify({ question: '(AB)^T 等于什么？' });
    case 'judge':
      return JSON.stringify(/B\^?T\s*A\^?T|BᵀAᵀ/.test(between(user, 'Answer:')) ? { correct: true, feedback: '对，顺序反过来。' } : { correct: false, feedback: '顺序要反过来：BᵀAᵀ。' });
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
