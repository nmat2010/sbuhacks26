import { HINT_LEVEL_KEYS, type HintLevelKey, type HintResponse } from '@wolfie/shared';
import { splitSentences } from '../voice/text.js';

// Ladder word limits (SPEC 4e): levels 1-2 stay under ~40 words, levels 3-5 under ~90.
export const WORD_LIMITS: Record<HintLevelKey, number> = {
  nudge: 40,
  hint: 40,
  explanation: 90,
  analogous_example: 90,
  direct_step: 90
};

export function wordLimitForLevel(level: number): number {
  return level <= 2 ? 40 : 90;
}

function countWords(text: string): number {
  return text.trim().split(/\s+/).filter(Boolean).length;
}

/** Cuts to `max` words, preferring to end on a whole sentence. */
export function limitWords(text: string, max: number): string {
  const clean = text.replace(/\s+/g, ' ').trim();
  if (countWords(clean) <= max) return clean;

  let kept = '';
  for (const sentence of splitSentences(clean)) {
    const next = kept ? `${kept} ${sentence}` : sentence;
    if (countWords(next) > max) break;
    kept = next;
  }
  if (kept) return kept;

  const words = clean.split(' ').slice(0, max).join(' ');
  return `${words.replace(/[,;:\s]+$/, '')}...`;
}

/** Applies the word limits to a whole ladder. */
export function limitLadder(levels: HintResponse['hint_levels']): HintResponse['hint_levels'] {
  const out = { ...levels };
  for (const key of HINT_LEVEL_KEYS) out[key] = limitWords(levels[key], WORD_LIMITS[key]);
  return out;
}
