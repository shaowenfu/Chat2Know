import { describe, expect, it } from 'vitest';
import { detectSignals, type SignalAsk } from '@/src/graph/signals';

const DAY = 24 * 60 * 60 * 1000;
const NOW = 100 * DAY;
// basics → rules → { transpose, product, trace }; rules → derivatives → chain rule
const edges = [
  { from: 'basics', to: 'rules' },
  { from: 'rules', to: 'transpose' },
  { from: 'rules', to: 'product' },
  { from: 'rules', to: 'trace' },
  { from: 'rules', to: 'derivatives' },
  { from: 'derivatives', to: 'chain' },
];
const conceptIds = ['basics', 'rules', 'transpose', 'product', 'trace', 'derivatives', 'chain'];

let n = 0;
function asks(list: [conversation: string, concept: string, daysAgo?: number, vector?: number[]][]) {
  const out: { asks: SignalAsk[]; tags: { askId: string; conceptId: string }[] } = { asks: [], tags: [] };
  for (const [conversation, concept, daysAgo = 1, vector] of list) {
    const id = `a${n++}`;
    out.asks.push({ id, conversationUrl: conversation, sentAt: NOW - daysAgo * DAY + n, ...(vector ? { vector } : {}) });
    if (concept) out.tags.push({ askId: id, conceptId: concept });
  }
  return out;
}

describe('detectSignals', () => {
  it('repeat: three questions about one concept across two conversations', () => {
    const data = asks([['c1', 'transpose'], ['c1', 'transpose'], ['c2', 'transpose'], ['c3', 'trace']]);
    const { symptoms } = detectSignals({ ...data, conceptIds, edges, now: NOW });
    expect(symptoms).toEqual([{ conceptId: 'transpose', signals: { repeat: 3 }, askIds: data.asks.slice(0, 3).map((a) => a.id) }]);
  });

  it('repeat needs more than one conversation and stays inside the window', () => {
    const one = asks([['c1', 'transpose'], ['c1', 'transpose'], ['c1', 'transpose']]);
    expect(detectSignals({ ...one, conceptIds, edges, now: NOW }).symptoms).toEqual([]);
    const old = asks([['c1', 'transpose', 20], ['c2', 'transpose', 20], ['c3', 'transpose']]);
    expect(detectSignals({ ...old, conceptIds, edges, now: NOW }).symptoms).toEqual([]);
  });

  it('downshift: asking about a prerequisite two levels below the conversation topic', () => {
    // chain rule is level 3, rules level 1, derivatives level 2.
    const data = asks([['c1', 'chain'], ['c1', 'rules'], ['c1', 'derivatives']]);
    const { symptoms } = detectSignals({ ...data, conceptIds, edges, now: NOW });
    expect(symptoms).toEqual([{ conceptId: 'rules', signals: { downshift: 1 }, askIds: [data.asks[1]!.id] }]);
  });

  it('circling: three or more similar questions in a row in one conversation', () => {
    const v = (x: number) => [1, x, 0];
    const data = asks([
      ['c1', '', 1, v(0.1)],
      ['c1', '', 1, v(0.2)],
      ['c1', '', 1, v(0.15)],
      ['c1', '', 1, [0, 0, 1]], // moved on
      ['c1', '', 1, v(0.1)],
      ['c2', '', 1, v(0.1)],
    ]);
    const { circling } = detectSignals({ ...data, conceptIds, edges, now: NOW });
    expect(circling).toEqual([{ conversationUrl: 'c1', askIds: data.asks.slice(0, 3).map((a) => a.id) }]);
  });

  it('no vectors, no circling', () => {
    const data = asks([['c1', 'transpose'], ['c1', 'transpose'], ['c1', 'transpose']]);
    expect(detectSignals({ ...data, conceptIds, edges, now: NOW }).circling).toEqual([]);
  });
});
