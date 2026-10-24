import { TypedEmitter } from '../typed-emitter.js';
import type { VoiceIntent } from './intents.js';

/**
 * Every recognized local intent is announced here, so other modules can react without B knowing
 * about them. Agent A's rules module (A4) listens for 'taking_a_break' / 'need_this' / 'ignore' to
 * answer an open distraction or AI-tool nudge by voice (SPEC Phase 3); the nudge's own buttons
 * remain the source of truth for action strings.
 */
export const voiceBus = new TypedEmitter<{
  intent: [intent: VoiceIntent, transcript: string];
}>();
