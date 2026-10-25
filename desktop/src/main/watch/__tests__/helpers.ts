import type { Observation } from '../types.js';

export const obs = (over: Partial<Observation> = {}): Observation => ({
  activity: 'reading_paper',
  mode: 'learning',
  subject: 'modified transformer attention',
  source: { kind: 'paper', title: 'Niranjan et al. 2026', locator: '§3.2' },
  summary: 'Reading section 3.2 about the modified attention block.',
  key_points: ['Attention scores are gated by a learned sparsity mask'],
  stuck: { likely: false, confidence: 0, reason: null },
  answer_checks: [],
  ...over
});
