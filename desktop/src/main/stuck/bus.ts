import type { HintTriggerType, StruggleSignal } from '@wolfie/shared';
import { TypedEmitter } from '../typed-emitter.js';

// Seam between signal producers (Agent A: extension signals, desktop monitor signals) and the
// escalation engine (Agent B). Producers emit; the engine wrapper in stuck/engine.ts subscribes.
export const stuckBus = new TypedEmitter<{
  signal: [signal: StruggleSignal];
  /** Any keyboard/mouse input on the work window; drives the 5 s no-offer guard. */
  input: [at: number];
  /** Manual entry points (SPEC 4d): hotkey, mascot click, "I'm stuck". */
  'help-requested': [trigger: HintTriggerType];
  'problem-changed': [problemId: string | null];
}>();
