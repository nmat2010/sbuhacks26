import type { StruggleSignal } from './signals.js';

// Escalation engine (SPEC 4c), shared by the desktop and the web app so both behave identically.
//
// computeLevel is pure: callers pass the currently active signals (already filtered to their
// detection windows) and the engine state; it returns the level to display, 0..4.
// applyEscalationEvent is the matching pure reducer for what happened (a level was shown, the
// user accepted/declined, etc.). Snooze and pause are owned by the NudgeQueue / pause toggle
// and passed in as flags.
//
//   0 nothing, 1 glance, 2 "?" over Wolfie, 3 bubble "Want a hint?", 4 spoken offer (voice only)

export const ESCALATION_TIMING = {
  stepCooldownMs: 45_000,
  level4AfterUnansweredMs: 60_000,
  declineCooldownMs: 3 * 60_000,
  declinePenaltyMs: 10 * 60_000,
  recentInputMs: 5_000
} as const;

export interface EscalationState {
  now: number;
  voiceMode: boolean;
  paused: boolean;
  snoozed: boolean;
  /** Level currently displayed (0 if none). */
  lastLevel: number;
  /** When the displayed level was last raised; null if never. */
  lastStepAt: number | null;
  /** When level 3 was shown and is still unanswered; null otherwise. */
  level3ShownAt: number | null;
  /** End of the post-decline cooldown. */
  declineCooldownUntil: number | null;
  /** While now < this, the target level is lowered by one. */
  declinePenaltyUntil: number | null;
  /** Problems the user said "I'm good" to; offers (level 3+) stay suppressed for them. */
  imGoodProblemIds: string[];
  /** Problem on screen now, if known. */
  currentProblemId: string | null;
  /** Last keyboard / mouse / pen input. */
  lastInputAt: number | null;
}

export type EscalationEvent =
  | { type: 'shown'; level: number; at: number }
  | { type: 'accepted'; at: number }
  | { type: 'declined'; at: number }
  | { type: 'im_good'; at: number; problemId: string | null }
  | { type: 'input'; at: number }
  | { type: 'problem_changed'; at: number; problemId: string | null };

export function initialEscalationState(now: number, voiceMode = false): EscalationState {
  return {
    now,
    voiceMode,
    paused: false,
    snoozed: false,
    lastLevel: 0,
    lastStepAt: null,
    level3ShownAt: null,
    declineCooldownUntil: null,
    declinePenaltyUntil: null,
    imGoodProblemIds: [],
    currentProblemId: null,
    lastInputAt: null
  };
}

/** The highest level the signals justify, before timing rules. */
export function targetLevel(signals: StruggleSignal[]): number {
  if (signals.length === 0) return 0;
  if (signals.some((s) => s.strength === 'strong')) return 3;
  const weakTypes = new Set(signals.filter((s) => s.strength === 'weak').map((s) => s.type));
  return weakTypes.size >= 2 ? 3 : 2;
}

export function computeLevel(signals: StruggleSignal[], state: EscalationState): number {
  const t = ESCALATION_TIMING;
  const { now } = state;

  if (state.paused || state.snoozed) return 0;
  if (state.declineCooldownUntil !== null && now < state.declineCooldownUntil) return 0;

  let target = targetLevel(signals);
  if (target === 0) return 0;

  // Level 4: level 3 shown and left unanswered for 60 s, voice mode only.
  if (
    target === 3 &&
    state.voiceMode &&
    state.lastLevel >= 3 &&
    state.level3ShownAt !== null &&
    now - state.level3ShownAt >= t.level4AfterUnansweredMs
  ) {
    target = 4;
  }

  if (state.declinePenaltyUntil !== null && now < state.declinePenaltyUntil) {
    target = Math.max(0, target - 1);
  }

  // "I'm good" suppresses offers (3+) for that problem for the rest of the session.
  if (state.currentProblemId !== null && state.imGoodProblemIds.includes(state.currentProblemId)) {
    target = Math.min(target, 2);
  }

  if (!state.voiceMode) target = Math.min(target, 3);

  if (target <= state.lastLevel) return target;

  // Escalate one step at a time, at most every 45 s, and never right after the user typed/drew.
  if (state.lastInputAt !== null && now - state.lastInputAt < t.recentInputMs) {
    return state.lastLevel;
  }
  if (state.lastStepAt !== null && now - state.lastStepAt < t.stepCooldownMs) {
    return state.lastLevel;
  }
  return state.lastLevel + 1;
}

export function applyEscalationEvent(state: EscalationState, event: EscalationEvent): EscalationState {
  const t = ESCALATION_TIMING;
  switch (event.type) {
    case 'shown': {
      const raised = event.level > state.lastLevel;
      return {
        ...state,
        lastLevel: event.level,
        lastStepAt: raised ? event.at : state.lastStepAt,
        // Level 4 is measured from when level 3 first appeared, so keep that time while at 3+.
        level3ShownAt:
          event.level < 3 ? null : state.lastLevel >= 3 ? state.level3ShownAt : event.at
      };
    }
    case 'accepted':
      return { ...state, lastLevel: 0, lastStepAt: event.at, level3ShownAt: null };
    case 'declined':
      return {
        ...state,
        lastLevel: 0,
        lastStepAt: event.at,
        level3ShownAt: null,
        declineCooldownUntil: event.at + t.declineCooldownMs,
        declinePenaltyUntil: event.at + t.declinePenaltyMs
      };
    case 'im_good':
      return {
        ...state,
        lastLevel: 0,
        lastStepAt: event.at,
        level3ShownAt: null,
        imGoodProblemIds:
          event.problemId && !state.imGoodProblemIds.includes(event.problemId)
            ? [...state.imGoodProblemIds, event.problemId]
            : state.imGoodProblemIds
      };
    case 'input':
      return { ...state, lastInputAt: event.at };
    case 'problem_changed':
      return { ...state, currentProblemId: event.problemId, lastLevel: 0, lastStepAt: null, level3ShownAt: null };
  }
}
