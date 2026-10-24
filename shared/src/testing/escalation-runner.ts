import {
  applyEscalationEvent,
  computeLevel,
  initialEscalationState,
  type EscalationEvent,
  type EscalationState
} from '../schemas/escalation.js';
import type { StruggleSignal } from '../schemas/signals.js';

export interface EscalationStep {
  at: number;
  signals?: string[];
  events?: Array<'accepted' | 'declined' | 'im_good' | 'input'>;
  paused?: boolean;
  snoozed?: boolean;
  problemId?: string;
}

export interface EscalationScenario {
  name: string;
  voiceMode: boolean;
  steps: EscalationStep[];
  expected: number[];
}

export interface EscalationFixture {
  signals: Record<string, StruggleSignal>;
  scenarios: EscalationScenario[];
}

/** Runs one scenario from shared/src/fixtures/escalation.json; returns the level after each step. */
export function runEscalationScenario(fixture: EscalationFixture, scenario: EscalationScenario): number[] {
  let state: EscalationState = initialEscalationState(scenario.steps[0]?.at ?? 0, scenario.voiceMode);
  let active: StruggleSignal[] = [];
  const levels: number[] = [];

  for (const step of scenario.steps) {
    state = { ...state, now: step.at };
    if (step.paused !== undefined) state = { ...state, paused: step.paused };
    if (step.snoozed !== undefined) state = { ...state, snoozed: step.snoozed };
    if (step.problemId !== undefined && step.problemId !== state.currentProblemId) {
      state = applyEscalationEvent(state, { type: 'problem_changed', at: step.at, problemId: step.problemId });
    }
    for (const type of step.events ?? []) {
      const event: EscalationEvent =
        type === 'im_good'
          ? { type, at: step.at, problemId: state.currentProblemId }
          : { type, at: step.at };
      state = applyEscalationEvent(state, event);
    }
    if (step.signals) {
      active = step.signals.map((key) => {
        const signal = fixture.signals[key];
        if (!signal) throw new Error(`Unknown signal key ${key} in ${scenario.name}`);
        return signal;
      });
    }

    const level = computeLevel(active, state);
    state = applyEscalationEvent(state, { type: 'shown', level, at: step.at });
    levels.push(level);
  }
  return levels;
}
