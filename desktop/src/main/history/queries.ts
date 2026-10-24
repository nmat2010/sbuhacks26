import type Database from 'better-sqlite3';
import type { HistoryData, HistorySession } from '../../common/ipc-sensing.js';
import type { RuleLists } from '../rules/matcher.js';
import { intervalsFromEvents, type AppEventRow } from './categories.js';

// History queries (SPEC Phase 8): per session, time per category (work / AI tools / distraction /
// idle), nudge count, hint count, and the deepest escalation level and hint level. Totals are
// derived from the same raw rows, so they always match app_events.

export interface HistoryOptions {
  now: number;
  lists: RuleLists;
  /** Newest first; default 100. */
  limit?: number;
  /** Only sessions that started at or after this time. */
  sinceTs?: number;
}

interface SessionRow {
  id: string;
  device: 'desktop' | 'webapp';
  started_at: number;
  ended_at: number | null;
  label: string | null;
  assessment_mode: number | null;
}

const emptySeconds = () => ({ work: 0, ai_tool: 0, distraction: 0, idle: 0 });

export function getHistory(db: Database.Database, opts: HistoryOptions): HistoryData {
  const rows = db
    .prepare(
      `SELECT id, device, started_at, ended_at, label, assessment_mode FROM sessions
       WHERE started_at >= ? ORDER BY started_at DESC LIMIT ?`
    )
    .all(opts.sinceTs ?? 0, opts.limit ?? 100) as SessionRow[];

  const events = db.prepare('SELECT ts, app_name, window_title, url_domain, is_idle FROM app_events WHERE session_id = ? ORDER BY ts, id');
  const hidden = db.prepare("SELECT type, ts FROM webapp_activity WHERE session_id = ? AND type IN ('tab_hidden', 'tab_visible') ORDER BY ts, id");
  const nudges = db.prepare('SELECT COUNT(*) AS n FROM nudges WHERE session_id = ?');
  const hints = db.prepare('SELECT COUNT(*) AS n, MAX(hint_level) AS deepest FROM hint_requests WHERE session_id = ?');
  const levels = db.prepare(
    `SELECT MAX(CAST(json_extract(payload_json, '$.level') AS INTEGER)) AS deepest
     FROM events WHERE type = 'stuck.level' AND device = ? AND ts >= ? AND ts <= ?`
  );

  const sessions: HistorySession[] = rows.map((s) => {
    const end = s.ended_at ?? opts.now;
    const seconds = emptySeconds();

    if (s.device === 'desktop') {
      for (const iv of intervalsFromEvents(events.all(s.id) as AppEventRow[], end, opts.lists)) {
        if (iv.category === 'paused') continue;
        seconds[iv.category] += (Math.min(iv.end, end) - iv.start) / 1000;
      }
    } else {
      // Web: the notebook is work; hidden-tab time is the away time
      let away = 0;
      let hiddenSince: number | null = null;
      for (const a of hidden.all(s.id) as { type: string; ts: number }[]) {
        if (a.type === 'tab_hidden' && hiddenSince === null) hiddenSince = a.ts;
        else if (a.type === 'tab_visible' && hiddenSince !== null) {
          away += Math.max(0, Math.min(a.ts, end) - hiddenSince);
          hiddenSince = null;
        }
      }
      if (hiddenSince !== null) away += Math.max(0, end - hiddenSince);
      const total = Math.max(0, end - s.started_at);
      seconds.idle = away / 1000;
      seconds.work = Math.max(0, total - away) / 1000;
    }

    const hintRow = hints.get(s.id) as { n: number; deepest: number | null };
    const level = levels.get(s.device, s.started_at, end) as { deepest: number | null };
    return {
      id: s.id,
      device: s.device,
      startedAt: s.started_at,
      endedAt: s.ended_at,
      label: s.label,
      assessmentMode: !!s.assessment_mode,
      seconds,
      nudgeCount: (nudges.get(s.id) as { n: number }).n,
      hintCount: hintRow.n,
      deepestHintLevel: hintRow.deepest ?? 0,
      deepestEscalationLevel: level.deepest ?? 0
    };
  });

  const totals = emptySeconds();
  let nudgeCount = 0;
  let hintCount = 0;
  for (const s of sessions) {
    for (const k of Object.keys(totals) as (keyof typeof totals)[]) totals[k] += s.seconds[k];
    nudgeCount += s.nudgeCount;
    hintCount += s.hintCount;
  }
  return { sessions, totals: { seconds: totals, nudgeCount, hintCount } };
}
