import { HINT_LEVEL_KEYS, type HintContext, type HintResponse } from '@wolfie/shared';

// Rule-based generic ladder (SPEC 4f), used when the model cannot be reached after one retry.
// It never claims to have understood the problem, and the response is flagged `offline: true`
// so the UI can label it "offline hints".

export const OFFLINE_LABEL = 'offline hints';

export function offlineLadder(context: Pick<HintContext, 'pageSummary'>): HintResponse {
  const pageError = context.pageSummary?.errorMessages?.[0]?.replace(/\s+/g, ' ').trim().slice(0, 120);
  return {
    what_i_see:
      "I can't reach my hint service right now, so these are offline hints: general steps that help with most problems.",
    hint_levels: {
      nudge: 'Try restating the problem in your own words. What is it actually asking you to find?',
      hint: pageError
        ? `The page says: "${pageError}". What do you think that is pointing at? Then list what you know and what you still need.`
        : 'List what you know and what you still need. Which piece of information have you not used yet?',
      explanation:
        'Most problems get easier when you split them into smaller parts. Name the goal, the givens, and the idea or rule that connects them. The gap between what you have and what you need is where to focus.',
      analogous_example:
        'Try a smaller or simpler version of the same problem, with easy numbers or a shorter input. Work that one all the way through, then notice which steps carry over to yours.',
      direct_step:
        'Write down the very next small step on your own, even if you are not sure it is right. Then check it against what the problem asks and adjust.'
    },
    offline: true
  };
}

/** A follow-up answer when offline: the ladder text for the level being asked about. */
export function offlineFollowupText(context: Pick<HintContext, 'pageSummary'>, level: number): string {
  const ladder = offlineLadder(context);
  const key = HINT_LEVEL_KEYS[Math.min(5, Math.max(1, level)) - 1];
  return `I'm offline right now, but here is a general hint. ${ladder.hint_levels[key]}`;
}
