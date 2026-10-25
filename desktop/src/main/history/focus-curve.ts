import type Database from 'better-sqlite3';
import type { RuleLists } from '../rules/matcher.js';
import { categorizeEvent, type AppEventRow, type TimeCategory } from './categories.js';

// The focus curve: how focus moves through a study session, from the recorded app activity.
// Answers: how long is a usual session, at what minute do you usually jump to a distracting (or
// AI) site and which one, and how focus rises, peaks and drops across the minutes of a session.
// Until there are enough recorded sessions, a sample curve is returned (marked sample).

export const BUCKET_MINUTES = 5;
/** Sessions shorter than this (minutes of activity) don't tell much about focus over time. */
const MIN_SESSION_MINUTES = 5;
/** Fewer recorded sessions than this: show the sample curve. */
export const MIN_SESSIONS = 3;
const WINDOW_DAYS = 30;

export interface Drift {
  /** Minutes into the session when it started. */
  minute: number;
  /** The site or app ("youtube.com", "ChatGPT"). */
  site: string;
  kind: 'distraction' | 'ai_tool';
  /** How long it lasted. */
  minutes: number;
}

export interface FocusCurve {
  /** No (or too few) recorded sessions: example numbers so the chart can be seen. */
  sample: boolean;
  /** Sessions the curve is built from. */
  sessions: number;
  avgSessionMinutes: number;
  bucketMinutes: number;
  /** One point per bucket, up to the average session length. Shares are 0-100. */
  points: Array<{ minute: number; focus: number; distraction: number }>;
  /**
   * When in a session you usually leave for distracting or AI sites: the 5-minute stretch with
   * the most drifting across sessions, how many sessions drifted then, and where to.
   */
  usualDrift: { minute: number; sessionsWithDrift: number; topSites: string[] } | null;
  peak: { fromMinute: number; toMinute: number; focus: number } | null;
  /** Focus lost (points) from the peak to the stretch where you usually drift. */
  dropAfterDrift: number | null;
}

interface SessionRow {
  id: string;
  started_at: number;
  ended_at: number | null;
}

interface Slice {
  start: number;
  end: number;
  category: TimeCategory;
  site: string;
}

/** A session's activity as time slices with the site or app of each. */
function slices(events: AppEventRow[], sessionEnd: number, lists: RuleLists): Slice[] {
  const out: Slice[] = [];
  for (let i = 0; i < events.length; i++) {
    const start = events[i].ts;
    const end = i + 1 < events.length ? events[i + 1].ts : sessionEnd;
    if (end <= start) continue;
    const site = (events[i].url_domain || events[i].app_name).replace(/^www\./, '');
    out.push({ start, end, category: categorizeEvent(events[i], lists), site });
  }
  return out;
}

const eventsOf = (db: Database.Database, sessionId: string) =>
  db
    .prepare('SELECT ts, app_name, window_title, url_domain, is_idle FROM app_events WHERE session_id = ? ORDER BY ts, id')
    .all(sessionId) as AppEventRow[];

/** Every time a session left for a distracting or AI site (back-to-back slices on one site merged). */
export function sessionDrifts(db: Database.Database, sessionId: string, lists: RuleLists, now = Date.now()): Drift[] {
  const s = db.prepare('SELECT id, started_at, ended_at FROM sessions WHERE id = ?').get(sessionId) as SessionRow | undefined;
  if (!s) return [];
  const out: Drift[] = [];
  for (const sl of slices(eventsOf(db, s.id), s.ended_at ?? now, lists)) {
    if (sl.category !== 'distraction' && sl.category !== 'ai_tool') continue;
    const last = out.at(-1);
    const minute = (sl.start - s.started_at) / 60_000;
    if (last && last.site === sl.site && minute - (last.minute + last.minutes) < 0.5) {
      last.minutes = Math.round((last.minutes + (sl.end - sl.start) / 60_000) * 10) / 10;
      continue;
    }
    out.push({ minute: Math.round(minute), site: sl.site, kind: sl.category, minutes: Math.round(((sl.end - sl.start) / 60_000) * 10) / 10 });
  }
  return out;
}


export function getFocusCurve(db: Database.Database, lists: RuleLists, now = Date.now()): FocusCurve {
  const rows = db
    .prepare("SELECT id, started_at, ended_at FROM sessions WHERE device = 'desktop' AND ended_at IS NOT NULL AND started_at >= ? ORDER BY started_at")
    .all(now - WINDOW_DAYS * 86_400_000) as SessionRow[];

  const studied: Array<{ length: number; slices: Slice[]; start: number }> = [];
  for (const s of rows) {
    const sl = slices(eventsOf(db, s.id), s.ended_at!, lists).filter((x) => x.category !== 'paused');
    const length = sl.reduce((n, x) => n + (x.end - x.start), 0) / 60_000;
    if (length >= MIN_SESSION_MINUTES) studied.push({ length, slices: sl, start: s.started_at });
  }
  if (studied.length < MIN_SESSIONS) return SAMPLE_CURVE;

  const avg = studied.reduce((n, s) => n + s.length, 0) / studied.length;
  const buckets = Math.max(1, Math.ceil(avg / BUCKET_MINUTES));
  const acc = Array.from({ length: buckets }, () => ({ work: 0, drift: 0, total: 0, sessions: new Set<number>(), sites: new Map<string, number>() }));

  for (const [index, s] of studied.entries()) {
    for (const sl of s.slices) {
      const isDrift = sl.category === 'distraction' || sl.category === 'ai_tool';
      // Spread the slice over the minute buckets it covers (session time, not clock time)
      let t = sl.start;
      while (t < sl.end) {
        const b = Math.floor((t - s.start) / (BUCKET_MINUTES * 60_000));
        if (b >= buckets) break;
        const next = Math.min(sl.end, s.start + (b + 1) * BUCKET_MINUTES * 60_000);
        acc[b].total += next - t;
        if (sl.category === 'work') acc[b].work += next - t;
        if (isDrift) {
          acc[b].drift += next - t;
          acc[b].sessions.add(index);
          acc[b].sites.set(sl.site, (acc[b].sites.get(sl.site) ?? 0) + (next - t));
        }
        t = next;
      }
    }
  }

  const points = acc.map((a, i) => ({
    minute: i * BUCKET_MINUTES,
    focus: a.total ? Math.round((a.work / a.total) * 100) : 0,
    distraction: a.total ? Math.round((a.drift / a.total) * 100) : 0
  }));
  const peakIndex = points.reduce((best, p, i) => (p.focus > points[best].focus ? i : best), 0);
  // When you usually drift: the stretch of session time with the most drifting across sessions
  // (a median of first drifts can land between two habits, at a time nobody drifts)
  const driftIndex = acc.reduce((best, a, i) => (a.drift > acc[best].drift ? i : best), 0);
  const d = acc[driftIndex];
  const usualDrift = d.drift
    ? {
        minute: driftIndex * BUCKET_MINUTES,
        sessionsWithDrift: d.sessions.size,
        topSites: [...d.sites.entries()].sort((a, b) => b[1] - a[1]).slice(0, 3).map(([site]) => site)
      }
    : null;
  const atDrift = usualDrift ? points[driftIndex] : null;

  return {
    sample: false,
    sessions: studied.length,
    avgSessionMinutes: Math.round(avg),
    bucketMinutes: BUCKET_MINUTES,
    points,
    usualDrift,
    peak: { fromMinute: points[peakIndex].minute, toMinute: points[peakIndex].minute + BUCKET_MINUTES, focus: points[peakIndex].focus },
    dropAfterDrift: atDrift ? Math.max(0, points[peakIndex].focus - atDrift.focus) : null
  };
}

/**
 * Example until enough sessions are recorded: a 50-minute session that warms up, peaks 10-15 min
 * in, drifts to YouTube around minute 27, dips, recovers a little, and fades near the end.
 */
export const SAMPLE_CURVE: FocusCurve = {
  sample: true,
  sessions: 8,
  avgSessionMinutes: 50,
  bucketMinutes: BUCKET_MINUTES,
  points: [72, 86, 91, 87, 78, 57, 62, 70, 64, 52].map((focus, i) => ({
    minute: i * BUCKET_MINUTES,
    focus,
    distraction: [4, 2, 1, 3, 9, 31, 24, 13, 19, 30][i]
  })),
  usualDrift: { minute: 25, sessionsWithDrift: 6, topSites: ['youtube.com', 'reddit.com'] },
  peak: { fromMinute: 10, toMinute: 15, focus: 91 },
  dropAfterDrift: 34
};
