import { describe, expect, it } from 'vitest';
import { detectSignals } from '@/src/graph/signals';
import { rankRootCauses, type WeightedSymptom } from '@/src/graph/rootcause';

const DAY = 24 * 60 * 60 * 1000;
const NOW = 100 * DAY;
// basics → rules → { transpose, product, trace, derivatives → chain }
const edges = [
  { from: 'basics', to: 'rules' },
  { from: 'rules', to: 'transpose' },
  { from: 'rules', to: 'product' },
  { from: 'rules', to: 'trace' },
  { from: 'rules', to: 'derivatives' },
  { from: 'derivatives', to: 'chain' },
];
const conceptIds = ['basics', 'rules', 'transpose', 'product', 'trace', 'derivatives', 'chain'];

/** A synthetic question history whose root cause is known. Circling roots are given as the model would name them. */
interface Scenario {
  name: string;
  asks: [conversation: string, concept: string][];
  circling?: { conceptId: string; asks: number }[];
  root: string;
}

const SCENARIOS: Scenario[] = [
  {
    name: 'transpose, product order and trace keep coming back: the shared rules are the gap',
    asks: [['c1', 'transpose'], ['c2', 'transpose'], ['c3', 'transpose'], ['c1', 'product'], ['c2', 'product'], ['c4', 'product'], ['c3', 'trace'], ['c4', 'trace'], ['c5', 'trace']],
    root: 'rules',
  },
  {
    name: 'asking basic operation rules while doing the chain rule',
    asks: [['c1', 'chain'], ['c1', 'rules'], ['c2', 'chain'], ['c2', 'rules'], ['c3', 'chain'], ['c3', 'rules']],
    root: 'rules',
  },
  {
    name: 'one concept asked again and again, with unrelated one-offs',
    asks: [['c1', 'trace'], ['c2', 'trace'], ['c3', 'trace'], ['c4', 'transpose'], ['c5', 'chain']],
    root: 'trace',
  },
  {
    name: 'circling in derivative questions, which the model traces to derivatives',
    asks: [['c1', 'chain'], ['c2', 'transpose']],
    circling: [{ conceptId: 'derivatives', asks: 4 }],
    root: 'derivatives',
  },
  {
    name: 'repeats on the chain rule and on derivatives: derivatives explain both and are more specific than the rules',
    asks: [['c1', 'chain'], ['c2', 'chain'], ['c3', 'chain'], ['c1', 'derivatives'], ['c4', 'derivatives'], ['c5', 'derivatives']],
    root: 'derivatives',
  },
  {
    name: 'repeats on two siblings plus a downshift to the rules',
    asks: [['c1', 'transpose'], ['c2', 'transpose'], ['c3', 'transpose'], ['c4', 'product'], ['c5', 'product'], ['c6', 'product'], ['c7', 'chain'], ['c7', 'rules']],
    root: 'rules',
  },
];

function rank(s: Scenario) {
  const asks = s.asks.map(([conversationUrl], i) => ({ id: `a${i}`, conversationUrl, sentAt: NOW - DAY + i }));
  const tags = s.asks.map(([, conceptId], i) => ({ askId: `a${i}`, conceptId }));
  const { symptoms } = detectSignals({ asks, tags, conceptIds, edges, now: NOW });
  const circling: WeightedSymptom[] = (s.circling ?? []).map((c, i) => ({
    conceptId: c.conceptId,
    signals: {},
    askIds: Array.from({ length: c.asks }, (_, j) => `circ${i}-${j}`),
    circling: c.asks,
  }));
  return rankRootCauses([...symptoms, ...circling], conceptIds, edges).map((c) => c.conceptId);
}

describe('root cause ranking on synthetic histories with a known root', () => {
  it.each(SCENARIOS)('$name', (s) => {
    expect(rank(s).slice(0, 3)).toContain(s.root);
  });

  it('baseline: the known root is first in every scenario (top-1 rate 1.0, top-3 rate 1.0)', () => {
    const top1 = SCENARIOS.filter((s) => rank(s)[0] === s.root).length / SCENARIOS.length;
    expect(top1).toBe(1);
  });

  it('a single weak symptom is not a candidate', () => {
    expect(rank({ name: '', asks: [['c1', 'transpose']], root: '' })).toEqual([]);
  });
});
