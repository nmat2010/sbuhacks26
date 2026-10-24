import type { MascotStateType } from '@wolfie/shared';
import { TypedEmitter } from '../typed-emitter.js';

// Sprite state for the overlay that is not a bubble: escalation levels 1-2 (glance,
// question-mark) and paused (sleeping). main.ts forwards changes on the 'overlay-state' channel.
// These bypass the NudgeQueue, which only governs bubbles.

let current: MascotStateType = 'idle';

export const overlayStateEvents = new TypedEmitter<{ change: [state: MascotStateType] }>();

export function setMascotState(state: MascotStateType): void {
  if (state === current) return;
  current = state;
  overlayStateEvents.emit('change', state);
}

export function getMascotState(): MascotStateType {
  return current;
}
