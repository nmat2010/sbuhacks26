import { randomUUID } from 'crypto';
import type Database from 'better-sqlite3';
import { TypedEmitter } from '../typed-emitter.js';
import { getDatabase } from '../db/index.js';
import { logEvent } from '../events.js';
import { getSetting } from '../settings.js';

// Current desktop session and pause state (Agent A, A1). startSession/stopSession persist the
// `sessions` row and log session.start/end; main.ts's menu already calls them. Web app sessions
// are created by the sync server (A8), not here. Pause propagation: the NudgeQueue and sleeping
// sprite are wired in main.ts; the extension (desk.state) and the mic flag derive from
// sessionEvents + isMicAllowed() in sensing/.

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

/** Sets the in-memory session only (no DB row). Prefer startSession/stopSession. */
export function setActiveSession(session: ActiveSession | null): void {
  active = session;
  sessionEvents.emit('change', session);
}

export function startSession(opts: { assessmentMode?: boolean; goalId?: string; label?: string } = {}): ActiveSession {
  if (active) return active;
  const session: ActiveSession = {
    id: randomUUID(),
    startedAt: Date.now(),
    assessmentMode: opts.assessmentMode ?? false,
    goalId: opts.goalId
  };
  try {
    getDatabase()
      .prepare(
        'INSERT INTO sessions (id, device, started_at, goal_id, label, assessment_mode) VALUES (?, ?, ?, ?, ?, ?)'
      )
      .run(session.id, 'desktop', session.startedAt, session.goalId ?? null, opts.label ?? null, session.assessmentMode ? 1 : 0);
    logEvent('session.start', { sessionId: session.id, assessmentMode: session.assessmentMode }, { ts: session.startedAt });
  } catch (error) {
    console.error('[session] failed to persist session start:', error);
  }
  setActiveSession(session);
  return session;
}

export function stopSession(): void {
  const session = active;
  if (!session) return;
  const endedAt = Date.now();
  try {
    getDatabase().prepare('UPDATE sessions SET ended_at = ? WHERE id = ?').run(endedAt, session.id);
    logEvent('session.end', { sessionId: session.id, durationMs: endedAt - session.startedAt }, { ts: endedAt });
  } catch (error) {
    console.error('[session] failed to persist session end:', error);
  }
  setActiveSession(null);
}

/**
 * Toggle "This is graded work" for the running session. Mutates in place and does not emit
 * 'change' (listeners reset their state on change); readers call getActiveSession() per request.
 */
export function setAssessmentMode(value: boolean): void {
  if (!active || active.assessmentMode === value) return;
  active.assessmentMode = value;
  try {
    getDatabase().prepare('UPDATE sessions SET assessment_mode = ? WHERE id = ?').run(value ? 1 : 0, active.id);
  } catch (error) {
    console.error('[session] failed to persist assessment mode:', error);
  }
}

export function isPaused(): boolean {
  return paused;
}

/** main.ts maps this to the NudgeQueue and the sleeping sprite. */
export function setPaused(value: boolean): void {
  if (value === paused) return;
  paused = value;
  sessionEvents.emit('pause', value);
}

/** SPEC 7: the mic may be live only during an active session, unpaused, with voice mode on. */
export function isMicAllowed(): boolean {
  let voice = false;
  try {
    voice = getSetting('voice.enabled');
  } catch {
    voice = false;
  }
  return active !== null && !paused && voice;
}

/**
 * Crash recovery: desktop sessions left open by a previous run get ended at their last recorded
 * activity (or their start). Returns how many were closed.
 */
export function closeOrphanedSessions(db: Database.Database = getDatabase()): number {
  const rows = db
    .prepare("SELECT id, started_at FROM sessions WHERE device = 'desktop' AND ended_at IS NULL")
    .all() as { id: string; started_at: number }[];
  for (const row of rows) {
    const last = db.prepare('SELECT MAX(ts) AS ts FROM app_events WHERE session_id = ?').get(row.id) as {
      ts: number | null;
    };
    const endedAt = Math.max(row.started_at, last.ts ?? 0);
    db.prepare('UPDATE sessions SET ended_at = ? WHERE id = ?').run(endedAt, row.id);
    logEvent('session.end', { sessionId: row.id, recovered: true }, { ts: endedAt, db });
  }
  return rows.length;
}
