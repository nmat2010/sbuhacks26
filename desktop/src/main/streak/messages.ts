import type { NudgeInput } from '@wolfie/shared';

// Streak nudges (SPEC Phase 9). PLACEHOLDER COPY for Thu to edit: the tone should be warm and
// never guilt-trip, especially after a reset. `{current}`, `{minutes}`, `{needed}`, `{freezes}`
// are filled in. Keep texts short; spokenText is read aloud in voice mode.

export const STREAK_COPY = {
  celebrate: [
    "That's {minutes} focused minutes today. Your streak is {current}!",
    'Nice work. Today counts, and your streak is now {current}.',
    "You showed up and focused. That's day {current} in a row."
  ],
  milestone: {
    3: "Three days in a row! That's a habit starting to form.",
    7: 'A whole week! Seven days of showing up. I earned a streak freeze for you too.',
    14: "Two weeks in a row. That's real consistency.",
    30: "Thirty days! A full month of showing up. I'm proud of you.",
    60: 'Sixty days. This is part of who you are now.',
    100: 'One hundred days in a row. That is remarkable.'
  } as Record<number, string>,
  freeze: [
    'You missed a day, but a streak freeze covered it. Your streak is safe at {current}. {freezes} left.',
    'A streak freeze kept your {current}-day streak alive. Want to get back to it today?'
  ],
  reset: [
    "Fresh start today. Streaks come and go; what matters is that you're back. Ready for a short session?",
    "No worries about the streak. Every day is a new chance to begin again. I'm here when you are.",
    "A new streak starts with one focused session. No pressure, just whenever you're ready."
  ],
  reminder: [
    'A quick {needed}-minute session tonight keeps your {current}-day streak going.',
    "Evening check-in: you're {needed} focused minutes from keeping your {current}-day streak. Up for it?"
  ]
};

export type StreakNudgeKind = 'celebrate' | 'milestone' | 'freeze' | 'reset' | 'reminder';

export interface StreakContext {
  current: number;
  minutes?: number;
  needed?: number;
  freezes?: number;
}

const fill = (template: string, ctx: StreakContext): string =>
  template
    .replaceAll('{current}', String(ctx.current))
    .replaceAll('{minutes}', String(ctx.minutes ?? 0))
    .replaceAll('{needed}', String(ctx.needed ?? 0))
    .replaceAll('{freezes}', String(ctx.freezes ?? 0));

export function streakNudge(kind: StreakNudgeKind, ctx: StreakContext, rng: () => number = Math.random): NudgeInput {
  let text: string;
  if (kind === 'milestone') {
    text = STREAK_COPY.milestone[ctx.current] ?? fill(STREAK_COPY.celebrate[0], ctx);
  } else {
    const pool = STREAK_COPY[kind];
    text = fill(pool[Math.min(pool.length - 1, Math.floor(rng() * pool.length))], ctx);
  }
  return { kind: 'streak', level: 1, text, spokenText: text, priority: kind === 'reset' ? 3 : 4 };
}
