import { randomUUID } from 'crypto';
import { TypedEmitter } from '../typed-emitter.js';

// Current desktop session and pause state. Agent A (A1) owns this module: persist sessions,
// log session.start/end, auto-start, and propagate pause to the NudgeQueue, the mic and the
// extension. The menu and IPC in main.ts already call startSession/stopSession/setPaused.

export interface ActiveSession {
  id: string;
  startedAt: number;
  assessmentMode: boolean;
  goalId?: string;
}

let active: ActiveSession | null = null;
let paused = false;

export const sessionEvents = new TypedEmitter<{
  change: [session: ActiveSession | null];
  pause: [paused: boolean];
}>();

export function getActiveSession(): ActiveSession | null {
  return active;
}

export function setActiveSession(session: ActiveSession | null): void {
  active = session;
  sessionEvents.emit('change', session);
}

/** Stub: A1 adds the sessions row and logEvent('session.start'). */
export function startSession(opts: { assessmentMode?: boolean; goalId?: string } = {}): ActiveSession {
  if (active) return active;
  const session = { id: randomUUID(), startedAt: Date.now(), assessmentMode: opts.assessmentMode ?? false, goalId: opts.goalId };
  setActiveSession(session);
  return session;
}

/** Stub: A1 sets ended_at and logEvent('session.end'). */
export function stopSession(): void {
  if (active) setActiveSession(null);
}

export function isPaused(): boolean {
  return paused;
}

/** main.ts maps this to the NudgeQueue and the sleeping sprite; A1 adds mic and extension. */
export function setPaused(value: boolean): void {
  if (value === paused) return;
  paused = value;
  sessionEvents.emit('pause', value);
}
