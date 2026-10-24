import type Database from 'better-sqlite3';
import type { SessionEnd, SessionStart, WebappActivity } from '@wolfie/shared';
import type { SyncMessageOf } from '@wolfie/shared';

// Persistence for what web app messages carry (A8). Plain functions over a database handle so
// they are testable without a socket. Everything here is idempotent: replaying a message must
// leave the same rows.

const SEEN_TTL_MS = 30 * 24 * 60 * 60 * 1000;

/** Marks a message id as applied. Returns false if it had been seen before. */
export function markSeen(db: Database.Database, deviceId: string, messageId: string, now: number): boolean {
  const result = db
    .prepare('INSERT OR IGNORE INTO a_sync_seen (id, device_id, seen_at) VALUES (?, ?, ?)')
    .run(`${deviceId}:${messageId}`, deviceId, now);
  return result.changes === 1;
}

export function hasSeen(db: Database.Database, deviceId: string, messageId: string): boolean {
  return !!db.prepare('SELECT 1 FROM a_sync_seen WHERE id = ?').get(`${deviceId}:${messageId}`);
}

/** Drops dedupe ids older than 30 days (clients never replay that far back). */
export function pruneSeen(db: Database.Database, now: number): number {
  return db.prepare('DELETE FROM a_sync_seen WHERE seen_at < ?').run(now - SEEN_TTL_MS).changes;
}

export function upsertWebSession(db: Database.Database, p: SessionStart): void {
  db.prepare(
    `INSERT INTO sessions (id, device, started_at, goal_id, label, assessment_mode)
     VALUES (?, 'webapp', ?, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET started_at = excluded.started_at, goal_id = excluded.goal_id,
       label = excluded.label, assessment_mode = excluded.assessment_mode`
  ).run(p.sessionId, p.startedAt, p.goalId ?? null, p.label ?? null, p.assessmentMode ? 1 : 0);
}

/** Ends a web session; creates it if its session.start never arrived. Returns the start time. */
export function endWebSession(db: Database.Database, p: SessionEnd): number {
  const row = db.prepare("SELECT started_at FROM sessions WHERE id = ? AND device = 'webapp'").get(p.sessionId) as
    | { started_at: number }
    | undefined;
  if (!row) {
    db.prepare("INSERT INTO sessions (id, device, started_at, ended_at) VALUES (?, 'webapp', ?, ?)").run(
      p.sessionId,
      p.endedAt,
      p.endedAt
    );
    return p.endedAt;
  }
  db.prepare('UPDATE sessions SET ended_at = ? WHERE id = ?').run(p.endedAt, p.sessionId);
  return row.started_at;
}

/** Inserts a batch of canvas/visibility activity; makes a bare session row if none exists yet. */
export function insertActivities(db: Database.Database, batch: WebappActivity): number {
  if (batch.activities.length === 0) return 0;
  const exists = db.prepare('SELECT 1 FROM sessions WHERE id = ?').get(batch.sessionId);
  if (!exists) {
    const first = Math.min(...batch.activities.map((a) => a.ts));
    db.prepare("INSERT INTO sessions (id, device, started_at) VALUES (?, 'webapp', ?)").run(batch.sessionId, first);
  }
  const stmt = db.prepare('INSERT INTO webapp_activity (session_id, ts, type, meta_json) VALUES (?, ?, ?, ?)');
  for (const a of batch.activities) stmt.run(batch.sessionId, a.ts, a.type, a.meta ? JSON.stringify(a.meta) : null);
  return batch.activities.length;
}

export function insertNudgeLog(db: Database.Database, p: SyncMessageOf<'nudge.log'>['payload']): void {
  const sessionExists = p.sessionId ? !!db.prepare('SELECT 1 FROM sessions WHERE id = ?').get(p.sessionId) : false;
  db.prepare(
    "INSERT INTO nudges (uid, session_id, ts, device, kind, level, payload_json, user_response) VALUES (NULL, ?, ?, 'webapp', ?, ?, ?, ?)"
  ).run(sessionExists ? p.sessionId : null, p.ts, p.kind, p.level, JSON.stringify({ text: p.text }), p.userResponse ?? null);
}
