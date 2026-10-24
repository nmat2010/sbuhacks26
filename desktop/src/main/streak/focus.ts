import type Database from 'better-sqlite3';
import { intervalsFromEvents, type AppEventRow } from '../history/categories.js';
import type { RuleLists } from '../rules/matcher.js';
import { splitByLocalDate } from './calendar.js';

// Focused minutes per local date, both devices combined, work category only (SPEC Phase 9).
//   desktop sessions: app_events intervals in the work category (idle, AI tools, distractions and
//                     paused time are excluded); a running session counts up to `now`
//   web sessions:     the session's length minus time the tab was hidden; only ended sessions
//                     count (a late-synced one changes past days, which the engine recalculates)
// A session's dates use the zone it ran in (a_session_tz) so a later zone change cannot move it.

export interface FocusOptions {
  now: number;
  /** Zone for sessions without a recorded one (web sessions, old data). */
  defaultTz: string;
  lists: RuleLists;
  /** Ignore sessions that ended before this time (keeps the replay bounded). */
  sinceTs?: number;
}

interface SessionRow {
  id: string;
  device: 'desktop' | 'webapp';
  started_at: number;
  ended_at: number | null;
  tz: string | null;
}

export function focusMinutesByDate(db: Database.Database, opts: FocusOptions): Map<string, number> {
  const ms = new Map<string, number>();
  const add = (start: number, end: number, tz: string) => {
    if (end <= start) return;
    for (const slice of splitByLocalDate(start, end, tz)) ms.set(slice.date, (ms.get(slice.date) ?? 0) + slice.ms);
  };

  const sessions = db
    .prepare(
      `SELECT s.id, s.device, s.started_at, s.ended_at, z.tz
       FROM sessions s LEFT JOIN a_session_tz z ON z.session_id = s.id
       WHERE s.ended_at IS NULL OR s.ended_at >= ?`
    )
    .all(opts.sinceTs ?? 0) as SessionRow[];

  const events = db.prepare('SELECT ts, app_name, window_title, url_domain, is_idle FROM app_events WHERE session_id = ? ORDER BY ts, id');
  const hidden = db.prepare(
    "SELECT type, ts FROM webapp_activity WHERE session_id = ? AND type IN ('tab_hidden', 'tab_visible') ORDER BY ts, id"
  );

  for (const s of sessions) {
    const tz = s.tz ?? opts.defaultTz;
    if (s.device === 'desktop') {
      const end = s.ended_at ?? opts.now;
      const rows = events.all(s.id) as AppEventRow[];
      for (const iv of intervalsFromEvents(rows, end, opts.lists)) {
        if (iv.category === 'work') add(iv.start, Math.min(iv.end, end), tz);
      }
    } else if (s.ended_at !== null) {
      // Focused = session length minus hidden-tab stretches
      let cursor = s.started_at;
      let hiddenSince: number | null = null;
      for (const a of hidden.all(s.id) as { type: string; ts: number }[]) {
        if (a.type === 'tab_hidden' && hiddenSince === null) {
          add(cursor, Math.min(a.ts, s.ended_at), tz);
          hiddenSince = a.ts;
        } else if (a.type === 'tab_visible' && hiddenSince !== null) {
          cursor = Math.max(a.ts, cursor);
          hiddenSince = null;
        }
      }
      if (hiddenSince === null) add(cursor, s.ended_at, tz);
    }
  }

  const minutes = new Map<string, number>();
  for (const [date, total] of ms) minutes.set(date, total / 60_000);
  return minutes;
}
