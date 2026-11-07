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
  body: { model: string; messages?: { role: string; content: string }[]; input?: string[]; stream?: boolean };
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

/** Words in a question that point to a topic title (besides the title itself). */
const MOCK_TOPICS: [RegExp, string][] = [
  [/transpose|转置/i, '转置'],
  [/multipl|乘法/i, '矩阵乘法'],
  [/trace|迹/i, '迹'],
  [/inverse|逆/i, '逆矩阵'],
];

/** Numbered lines "[n] text" under a header, in either language. */
const list = (text: string, headers: string[]) => {
  const part = text.split(new RegExp(`^(?:${headers.join('|')}):\\n`, 'm'))[1]?.split('\n\n')[0] ?? '';
  return [...part.matchAll(/^\[(\d+)\] (.*)$/gm)].map(([, n, t]) => ({ n: Number(n), text: t!, last: t!.split(' › ').at(-1)! }));
};

/** A short report that counts the questions it read; it tries a script, which the page must drop. */
function reportReply(user: string): string {
  const count = (user.match(/^- \[/gm) ?? []).length;
  return [
    '## 概况',
    '',
    `你在这张导图里问了 ${count} 个问题，集中在 **转置**。`,
    '',
    '## 接下来',
    '',
    '- 先手算一遍 $(AB)^T = B^T A^T$。',
    '- 再看 [逆矩阵](https://zh.wikipedia.org/wiki/逆矩阵)。',
    '',
    '<script>alert(1)</script><p onclick="alert(2)">不打分。</p>',
  ].join('\n');
}

/** Stuck when 3 or more questions are about the same topic (the most specific title first): circling there. */
function stuckReply(user: string): string {
  const asks = list(user, ['Questions', '提问']);
  const topics = list(user, ['Topics', '知识点']).sort((a, b) => b.last.length - a.last.length);
  for (const t of topics) {
    const about = asks.filter((q) => q.text.includes(t.last) || MOCK_TOPICS.some(([re, title]) => title === t.last && re.test(q.text)));
    if (about.length >= 3) {
      return JSON.stringify({
        stuck: true,
        kind: 'circling',
        section: t.n,
        explanation: `最近 ${about.length} 个问题都在问「${t.last}」。先把它的定义弄清楚，后面会容易很多。`,
        question: `用一个具体的例子，一步步讲清楚「${t.last}」是怎么算的。`,
        evidence: about.map((q) => q.n),
      });
    }
  }
  return JSON.stringify({ stuck: false });
}

/** Where the mock files a note, by words in it: first match wins. */
const MOCK_PLACES: [RegExp, string, string[]][] = [
  [/attention|softmax/i, '深度学习', ['注意力机制']],
  [/\^T|\^\{T\}|\\top|transpose|转置/i, '线性代数', ['矩阵', '转置']],
  [/\\det|determinant|行列式/i, '线性代数', ['行列式']],
];

/** The prompt in either language: "Note (formula): …" or "笔记 (公式): …", and "Map: …" / "导图: …". */
function placeReply(user: string): string {
  const m = /^(?:Note|笔记) \((formula|text|quote|公式|文字|原文)\): (.*)$/m.exec(user);
  const [type, text] = [m?.[1] ?? 'formula', m?.[2] ?? ''];
  const unnamed = /^(?:Map|导图): (?:\(unnamed\)|（未命名）)$/m.test(user);
  // The mock's place for the note: the map name it would give, and the path below the map.
  const [, mapName, path] = MOCK_PLACES.find(([re]) => re.test(text)) ?? [null, '线性代数', ['其他']];
  // A statement keeps its first sentence; with a request, the whole note as written.
  const request = /^(?:Request|要求): (.*)$/m.exec(user)?.[1];
  const whole = user.split(/\n\n(?:Request|要求): /)[0]!.replace(/^(?:Note|笔记) \([^)]*\): /, '');
  const statement = type === 'text' || type === '文字' ? (request ? whole : (text.split(/(?<=[.。])\s*/)[0] ?? text)) : '';
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
  const toc = user.split(/(?:Table of contents|教材目录):\n/)[1];
  if (!toc && /^(?:Map|导图名称): 深度学习$/m.test(user)) {
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

/** A short answer about the selection, echoing the question and how many came before it (follow-ups see the earlier turns). */
function askReply(user: string, earlier: number): string {
  const selected = /^(?:Selected|选中的内容):\n(.*)$/m.exec(user)?.[1] ?? '';
  const question = user.trim().split('\n').at(-1)!;
  return `About “${selected}”: ${question}\n\nThe scaling keeps $QK^\\top$ small: divide by $\\sqrt{d_k}$. (turn ${earlier + 1})`;
}

export function chatReply(task: string, user: string): string {
  switch (task) {
    case 'ping':
      return 'OK';
    case 'stuck':
      return stuckReply(user);
    case 'report':
      return reportReply(user);
    case 'outline':
      return outlineReply(user);
    case 'place':
      return placeReply(user);
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
    if (task === 'ask') {
      // The floating window streams: the answer goes out in small server-sent pieces.
      const last = body.messages!.filter((m) => m.role === 'user').at(-1)!.content;
      const first = body.messages!.find((m) => m.role === 'user')!.content;
      const answer = askReply(`${first}\n${last}`, body.messages!.filter((m) => m.role === 'assistant').length);
      if (!body.stream) return send(200, { choices: [{ message: { role: 'assistant', content: answer } }] });
      res.writeHead(200, { 'content-type': 'text/event-stream' });
      for (const piece of answer.match(/[\s\S]{1,12}/g)!) {
        res.write(`data: ${JSON.stringify({ choices: [{ delta: { content: piece } }] })}\n\n`);
        await new Promise((r) => setTimeout(r, last.includes('SLOW') ? 200 : 10));
      }
      return res.end('data: [DONE]\n\n');
    }
    send(200, { choices: [{ message: { role: 'assistant', content: chatReply(task, user) } }] });
  });
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
  return {
    url: `http://127.0.0.1:${(server.address() as AddressInfo).port}/v1`,
    requests,
    close: () => new Promise((r) => server.close(() => r())),
  };
}
