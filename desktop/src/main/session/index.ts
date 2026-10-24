import { TypedEmitter } from '../typed-emitter.js';

// Current desktop session. Stub seam from Phase 0 fix-up; Agent A (A1) owns the session manager
// and calls setActiveSession() on start/stop.

export interface ActiveSession {
  id: string;
  startedAt: number;
  assessmentMode: boolean;
  goalId?: string;
}

let active: ActiveSession | null = null;

export const sessionEvents = new TypedEmitter<{ change: [session: ActiveSession | null] }>();

export function getActiveSession(): ActiveSession | null {
  return active;
}

export function setActiveSession(session: ActiveSession | null): void {
  active = session;
  sessionEvents.emit('change', session);
}
