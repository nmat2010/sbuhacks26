import type { NudgeInput } from '@wolfie/shared';
import type { RuleKind } from './matcher.js';

// Warm, teacher-voiced message pools for AI-tool and distraction warnings (SPEC Phase 3).
// Thu reviews the tone; `{name}` is the rule's name (e.g. "YouTube"). Edit freely.

export const RULE_ACTIONS = {
  break: 'taking_break',
  need: 'need_for_task',
  ignore: 'ignore_session'
} as const;
export type RuleAction = 'break' | 'need' | 'ignore';

export const MESSAGE_POOLS: Record<RuleKind, string[]> = {
  ai_tool: [
    "I see {name} is open. Is it helping with the task, or would trying the next step on your own be worth a shot first?",
    "Quick check-in: {name} can be great for checking your thinking. Have you given the problem a go yourself yet?",
    "Hey, {name} is up. If you're using it to learn, wonderful. If you're about to paste an answer, maybe try one more pass first?",
    "Looks like {name}. No judgment, I just want your own understanding to grow. Is this for the task?"
  ],
  distraction: [
    "{name} caught your eye. Totally human. Want to take a proper break, or get back to it?",
    "Hey, I noticed {name}. A short break is fine, just tell me and I'll stay quiet for a bit.",
    "{name} is calling! If you need a breather, take one on purpose. Otherwise let's get back to it together.",
    "Looks like {name} is open. Is this a planned break, or did it sneak up on you?"
  ]
};

export function ruleButtons(): NonNullable<NudgeInput['buttons']> {
  return [
    { label: 'Taking a break', action: RULE_ACTIONS.break, variant: 'secondary' },
    { label: 'I need this for the task', action: RULE_ACTIONS.need, variant: 'primary' },
    { label: 'Ignore for this session', action: RULE_ACTIONS.ignore, variant: 'secondary' }
  ];
}

/**
 * Picks a message, never the same one twice in a row for a kind. `rng` returns [0, 1).
 * `lastIndex` is the previously used index for this kind, if any.
 */
export function pickMessage(kind: RuleKind, name: string, rng: () => number, lastIndex: number | null): { text: string; index: number } {
  const pool = MESSAGE_POOLS[kind];
  let index = Math.min(pool.length - 1, Math.floor(rng() * pool.length));
  if (pool.length > 1 && index === lastIndex) index = (index + 1) % pool.length;
  return { text: pool[index].replaceAll('{name}', name), index };
}

/**
 * Maps a nudge response (button action or a voice intent) to a rule answer. Accepts the button
 * actions and loose voice phrasing such as "taking a break", "I need this", "ignore".
 */
export function parseRuleAction(action: string): RuleAction | null {
  const a = action.toLowerCase().replace(/[^a-z]+/g, '_');
  if (a.includes('ignore')) return 'ignore';
  if (a.includes('need')) return 'need';
  if (a.includes('break')) return 'break';
  return null;
}
