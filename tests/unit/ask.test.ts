import { describe, expect, it } from 'vitest';
import { answerHtml, answerStatement } from '@/src/capture/answer-html';
import { askPrompt } from '@/src/llm/prompts';
import { LlmClient, LlmError } from '@/src/llm/client';

const settings = { baseUrl: 'https://llm.test/v1', model: 'm', apiKey: 'k', embeddingModel: '' };

/** A fetch answering with these server-sent chunks, keeping the request body. */
function sse(chunks: string[], status = 200) {
  const bodies: unknown[] = [];
  const fetchFn = (async (_url: string, init: RequestInit) => {
    bodies.push(JSON.parse(init.body as string));
    if (status !== 200) return new Response(JSON.stringify({ error: { message: 'Bad key' } }), { status });
    const stream = new ReadableStream<Uint8Array>({
      start(c) {
        for (const chunk of chunks) c.enqueue(new TextEncoder().encode(chunk));
        c.close();
      },
    });
    return new Response(stream, { status: 200, headers: { 'content-type': 'text/event-stream' } });
  }) as typeof fetch;
  return { fetchFn, bodies };
}

const event = (content: string) => `data: ${JSON.stringify({ choices: [{ delta: { content } }] })}\n\n`;

describe('streaming a chat answer', () => {
  it('yields each delta in order, across chunk boundaries, until [DONE]', async () => {
    const whole = event('Hello') + event(', world') + 'data: [DONE]\n\n' + event('ignored');
    const { fetchFn, bodies } = sse([whole.slice(0, 7), whole.slice(7, 40), whole.slice(40)]);
    const out: string[] = [];
    for await (const d of new LlmClient(settings, fetchFn).stream([{ role: 'user', content: 'hi' }])) out.push(d);
    expect(out).toEqual(['Hello', ', world']);
    expect(bodies[0]).toMatchObject({ model: 'm', stream: true });
  });

  it('surfaces the provider error and malformed events', async () => {
    const drain = async (client: LlmClient) => {
      for await (const _ of client.stream([])) void _;
    };
    await expect(drain(new LlmClient(settings, sse([], 401).fetchFn))).rejects.toThrow('HTTP 401: Bad key');
    await expect(drain(new LlmClient(settings, sse(['data: {oops\n\n']).fetchFn))).rejects.toThrow(LlmError);
    await expect(drain(new LlmClient(settings, sse([`data: ${JSON.stringify({ error: { message: 'quota' } })}\n\n`]).fetchFn))).rejects.toThrow('quota');
  });
});

describe('the ask prompt', () => {
  it('puts the selection and its context before the first question, and replays earlier turns', () => {
    const m = askPrompt({
      lang: 'zh',
      selection: '幂指函数 $y = u(x)^{v(x)}$',
      before: '七、对数求导法 适用于',
      after: '或连乘连除形式',
      pageTitle: '求导',
      turns: [{ question: '什么是幂指函数？', answer: '底和指数都含 x 的函数。' }],
      question: '为什么要取对数？',
    });
    expect(m.map((x) => x.role)).toEqual(['system', 'user', 'assistant', 'user']);
    expect(m[0]!.content).toMatch(/^\[task:ask\]\n.*用中文回答/s);
    expect(m[1]!.content).toBe('选中的内容:\n幂指函数 $y = u(x)^{v(x)}$\n\n上下文: …七、对数求导法 适用于 [SELECTED] 或连乘连除形式…\n\n页面: 求导\n\n什么是幂指函数？');
    expect(m[3]!.content).toBe('为什么要取对数？');
    expect(askPrompt({ lang: 'en', selection: 's', before: '', after: '', pageTitle: '', turns: [], question: 'q' })[0]!.content).toContain('Answer in English.');
  });
});

describe('the answer as the window shows it', () => {
  it('escapes text, keeps a little Markdown, and typesets formulas as MathML', () => {
    const html = answerHtml('**Short:** use `ln` <b>.\nSo $x^2$ grows.\n\n$$\n\\frac{a}{b}\n$$\n\n- one\n- two *each*');
    expect(html).toContain('<p><b>Short:</b> use <code>ln</code> &lt;b&gt;.<br>So <span class="katex"><math');
    expect(html).toContain('<math xmlns="http://www.w3.org/1998/Math/MathML" display="block">');
    expect(html).toContain('<ul><li>one</li><li>two <i>each</i></li></ul>');
    expect(html).not.toContain('<b>.</b>');
  });

  it('shows an unfinished formula as its source while it streams', () => {
    expect(answerHtml('so $x^')).toBe('<p>so $x^</p>');
    expect(answerHtml('a $$\n\\frac{1}')).toBe('<p>a $$\n\\frac{1}</p>');
  });

  it('becomes one line with $…$ formulas for a statement', () => {
    expect(answerStatement('**Yes.** Take logs:\n\n$$\nln y = v ln u\n$$\n\n- then differentiate')).toBe('Yes. Take logs: $ln y = v ln u$ then differentiate');
    expect(answerStatement('Use \\(x^2\\) and `code`.')).toBe('Use $x^2$ and code.');
  });
});
