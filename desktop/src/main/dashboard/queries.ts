import { randomUUID } from 'crypto';
import type Database from 'better-sqlite3';
import type {
  DashMaterial,
  DashPracticeItem,
  DashPrefs,
  DashProblem,
  DashProblemInput,
  DashSession,
  DashSummary,
  DashTimeFilter,
  DashTopicScore
} from '../../common/ipc-dashboard.js';
import type { RuleLists } from '../rules/matcher.js';
import { intervalsFromEvents, type AppEventRow } from '../history/categories.js';

// Dashboard data (reports, topic scores, streak grid, productivity curve, prefs). Everything is
// derived from the sessions / app_events rows plus the problem_attempts table below.

const DAY_MS = 86_400_000;
const WEAK_MAX = 4;
const STRONG_MIN = 7;

export function ensureDashboardSchema(db: Database.Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS dash_session_meta (
      session_id TEXT PRIMARY KEY,
      planned_minutes INTEGER,
      studying TEXT,
      course TEXT,
      topics_json TEXT
    );
    CREATE TABLE IF NOT EXISTS problem_attempts (
      id TEXT PRIMARY KEY,
      session_id TEXT NOT NULL,
      title TEXT NOT NULL,
      topic TEXT NOT NULL,
      started_at INTEGER NOT NULL,
      minutes REAL NOT NULL DEFAULT 0,
      outcome TEXT NOT NULL CHECK(outcome IN ('solved', 'hinted', 'stuck')),
      hints_used INTEGER NOT NULL DEFAULT 0,
      attempt_written_first INTEGER NOT NULL DEFAULT 1,
      ai_unlocked INTEGER NOT NULL DEFAULT 0,
      note TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_problem_attempts_session ON problem_attempts(session_id);
  `);
}

export const DEFAULT_PREFS: DashPrefs = {
  powers: { overlay: true, screenRecording: false, voice: false },
  reports: { recordProblems: true, showProductivityCurve: true, weeklyReport: false },
  independence: { attemptLength: 20, unlockMinutes: 15, aiShareCap: 0.2, tryFirstMinutes: 10 },
  appearance: { pixelScale: 2, reduceMotion: false, soundEffects: true },
  brightspaceSyncedAt: null,
  semester: null
};

const PREFS_KEY = 'dash.prefs';

export function readPrefs(db: Database.Database): DashPrefs {
  const row = db.prepare('SELECT value_json FROM settings WHERE key = ?').get(PREFS_KEY) as { value_json: string } | undefined;
  let stored: Partial<DashPrefs> = {};
  try {
    if (row) stored = JSON.parse(row.value_json);
  } catch {
    stored = {};
  }
  return {
    powers: { ...DEFAULT_PREFS.powers, ...stored.powers },
    reports: { ...DEFAULT_PREFS.reports, ...stored.reports },
    independence: { ...DEFAULT_PREFS.independence, ...stored.independence },
    appearance: { ...DEFAULT_PREFS.appearance, ...stored.appearance },
    brightspaceSyncedAt: stored.brightspaceSyncedAt ?? null,
    semester: stored.semester ?? null
  };
}

export function writePrefs(db: Database.Database, prefs: DashPrefs): void {
  db.prepare(
    'INSERT INTO settings (key, value_json) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value_json = excluded.value_json'
  ).run(PREFS_KEY, JSON.stringify(prefs));
}

/** Keeps only known fields and sane ranges, so a bad renderer payload cannot corrupt prefs. */
export function mergePrefs(current: DashPrefs, updates: Partial<DashPrefs>): DashPrefs {
  const bool = (v: unknown, fallback: boolean) => (typeof v === 'boolean' ? v : fallback);
  const num = (v: unknown, fallback: number, min: number, max: number) =>
    typeof v === 'number' && Number.isFinite(v) ? Math.min(max, Math.max(min, v)) : fallback;
  const p = updates.powers ?? {};
  const r = updates.reports ?? {};
  const i = updates.independence ?? {};
  const a = updates.appearance ?? {};
  const scale = num((a as { pixelScale?: number }).pixelScale, current.appearance.pixelScale, 1, 3);
  return {
    powers: {
      overlay: bool((p as DashPrefs['powers']).overlay, current.powers.overlay),
      screenRecording: bool((p as DashPrefs['powers']).screenRecording, current.powers.screenRecording),
      voice: bool((p as DashPrefs['powers']).voice, current.powers.voice)
    },
    reports: {
      recordProblems: bool((r as DashPrefs['reports']).recordProblems, current.reports.recordProblems),
      showProductivityCurve: bool((r as DashPrefs['reports']).showProductivityCurve, current.reports.showProductivityCurve),
      weeklyReport: bool((r as DashPrefs['reports']).weeklyReport, current.reports.weeklyReport)
    },
    independence: {
      attemptLength: Math.round(num((i as DashPrefs['independence']).attemptLength, current.independence.attemptLength, 0, 500)),
      unlockMinutes: Math.round(num((i as DashPrefs['independence']).unlockMinutes, current.independence.unlockMinutes, 0, 240)),
      aiShareCap: num((i as DashPrefs['independence']).aiShareCap, current.independence.aiShareCap, 0, 1),
      tryFirstMinutes: Math.round(num((i as DashPrefs['independence']).tryFirstMinutes, current.independence.tryFirstMinutes, 0, 240))
    },
    appearance: {
      pixelScale: Math.round(scale) as 1 | 2 | 3,
      reduceMotion: bool((a as DashPrefs['appearance']).reduceMotion, current.appearance.reduceMotion),
      soundEffects: bool((a as DashPrefs['appearance']).soundEffects, current.appearance.soundEffects)
    },
    brightspaceSyncedAt:
      updates.brightspaceSyncedAt !== undefined ? updates.brightspaceSyncedAt : current.brightspaceSyncedAt,
    semester:
      updates.semester !== undefined ? (updates.semester?.trim().slice(0, 40) || null) : current.semester
  };
}

// ---- helpers --------------------------------------------------------------------------------

export function slugTopic(text: string): string {
  return text
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60);
}

export function topicName(id: string): string {
  const spaced = id.replace(/-/g, ' ').trim();
  return spaced ? spaced.charAt(0).toUpperCase() + spaced.slice(1) : id;
}

const TOPIC_KEYWORDS: Array<[RegExp, string]> = [
  [/dynamic\s*programming|\bdp\b|memoi[sz]ation/i, 'dynamic-programming'],
  [/graph|bfs|dfs|traversal|shortest path|dijkstra/i, 'graph-traversal'],
  [/greedy/i, 'greedy-algorithms'],
  [/phasor/i, 'phasors'],
  [/vector field/i, 'vector-fields'],
  [/line integral/i, 'line-integrals'],
  [/double integral|multiple integral/i, 'double-integrals'],
  [/op-?amp|operational amplifier/i, 'op-amp-circuits'],
  [/recurs/i, 'recursion'],
  [/sort/i, 'sorting'],
  [/hash/i, 'hash-tables'],
  [/tree/i, 'trees'],
  [/probab/i, 'probability'],
  [/fourier|laplace/i, 'transforms']
];

export function detectTopic(text: string): string | null {
  for (const [re, id] of TOPIC_KEYWORDS) if (re.test(text)) return id;
  return null;
}

const iso = (ms: number) => new Date(ms).toISOString();

interface SessionRow {
  id: string;
  device: 'desktop' | 'webapp';
  started_at: number;
  ended_at: number | null;
  label: string | null;
}

interface ProblemRow {
  id: string;
  session_id: string;
  title: string;
  topic: string;
  started_at: number;
  minutes: number;
  outcome: 'solved' | 'hinted' | 'stuck';
  hints_used: number;
  attempt_written_first: number;
  ai_unlocked: number;
  note: string | null;
}

const isUnaided = (p: Pick<ProblemRow, 'outcome' | 'ai_unlocked' | 'hints_used'>) =>
  p.outcome === 'solved' && !p.ai_unlocked && p.hints_used === 0;

function toProblem(r: ProblemRow): DashProblem {
  return {
    id: r.id,
    sessionId: r.session_id,
    title: r.title,
    topic: r.topic,
    startedAt: iso(r.started_at),
    minutes: Math.round(r.minutes),
    outcome: r.outcome,
    hintsUsed: r.hints_used,
    attemptWrittenFirst: !!r.attempt_written_first,
    aiUnlocked: !!r.ai_unlocked,
    note: r.note ?? undefined
  };
}

/** Focus score 0-100: share of the session spent in work (not idle, AI tools or distractions). */
function focusScoreFor(db: Database.Database, s: SessionRow, now: number, lists: RuleLists): number | null {
  if (s.device !== 'desktop') return null;
  const rows = db
    .prepare('SELECT ts, app_name, window_title, url_domain, is_idle FROM app_events WHERE session_id = ? ORDER BY ts, id')
    .all(s.id) as AppEventRow[];
  if (rows.length === 0) return null;
  const end = s.ended_at ?? now;
  let work = 0;
  let total = 0;
  for (const iv of intervalsFromEvents(rows, end, lists)) {
    if (iv.category === 'paused') continue;
    const ms = Math.min(iv.end, end) - iv.start;
    total += ms;
    if (iv.category === 'work') work += ms;
  }
  return total > 0 ? Math.round((work / total) * 100) : null;
}

function sinceFor(filter: DashTimeFilter, now: number): number {
  if (filter === 'week') return now - 7 * DAY_MS;
  if (filter === 'month') return now - 30 * DAY_MS;
  return 0;
}

// ---- sessions & problems --------------------------------------------------------------------

export function getSessions(db: Database.Database, filter: DashTimeFilter, now: number, lists: RuleLists): DashSession[] {
  const rows = db
    .prepare('SELECT id, device, started_at, ended_at, label FROM sessions WHERE started_at >= ? ORDER BY started_at DESC LIMIT 200')
    .all(sinceFor(filter, now)) as SessionRow[];
  const meta = db.prepare('SELECT planned_minutes, studying, course, topics_json FROM dash_session_meta WHERE session_id = ?');
  const probs = db.prepare('SELECT * FROM problem_attempts WHERE session_id = ?');
  const hintCount = db.prepare('SELECT COUNT(*) AS n FROM hint_requests WHERE session_id = ?');

  return rows.map((s) => {
    const m = meta.get(s.id) as
      | { planned_minutes: number | null; studying: string | null; course: string | null; topics_json: string | null }
      | undefined;
    const problems = probs.all(s.id) as ProblemRow[];
    const topics = new Set<string>();
    try {
      for (const t of JSON.parse(m?.topics_json ?? '[]') as string[]) topics.add(t);
    } catch {
      // ignore bad json
    }
    for (const p of problems) topics.add(p.topic);
    const studying = m?.studying || s.label || 'Study session';
    if (topics.size === 0) topics.add(detectTopic(studying) ?? slugTopic(studying));
    const end = s.ended_at ?? now;
    const hintReqs = (hintCount.get(s.id) as { n: number }).n;
    return {
      id: s.id,
      startedAt: iso(s.started_at),
      endedAt: s.ended_at ? iso(s.ended_at) : null,
      plannedMinutes: m?.planned_minutes ?? 25,
      course: m?.course ?? null,
      studying,
      topics: [...topics].filter(Boolean),
      focusScore: focusScoreFor(db, s, now, lists),
      solvedUnaided: problems.filter(isUnaided).length,
      totalProblems: problems.length,
      minutes: Math.max(0, Math.round((end - s.started_at) / 60_000)),
      aiUnlocks: problems.filter((p) => p.ai_unlocked).length,
      hints: problems.reduce((n, p) => n + p.hints_used, 0) + hintReqs
    };
  });
}

export function getSessionProblems(db: Database.Database, sessionId: string): DashProblem[] {
  const rows = db
    .prepare('SELECT * FROM problem_attempts WHERE session_id = ? ORDER BY started_at ASC')
    .all(sessionId) as ProblemRow[];
  return rows.map(toProblem);
}

export function logProblem(
  db: Database.Database,
  input: DashProblemInput,
  activeSessionId: string | null,
  now: number
): { ok: true; id: string } | { ok: false; error: string } {
  const sessionId = input.sessionId ?? activeSessionId;
  if (!sessionId) return { ok: false, error: 'Start a session first, then log a problem.' };
  const title = input.title?.trim();
  if (!title) return { ok: false, error: 'Give the problem a title.' };
  if (!['solved', 'hinted', 'stuck'].includes(input.outcome)) return { ok: false, error: 'Pick an outcome.' };
  const topic = slugTopic(input.topic || '') || detectTopic(title) || 'general';
  const minutes = Number.isFinite(input.minutes) ? Math.max(0, Math.min(600, input.minutes)) : 0;
  const hints = input.outcome === 'hinted' ? Math.max(1, input.hintsUsed ?? 1) : Math.max(0, input.hintsUsed ?? 0);
  const id = randomUUID();
  db.prepare(
    `INSERT INTO problem_attempts (id, session_id, title, topic, started_at, minutes, outcome, hints_used, attempt_written_first, ai_unlocked, note)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    id,
    sessionId,
    title.slice(0, 200),
    topic,
    now - Math.round(minutes * 60_000),
    minutes,
    input.outcome,
    hints,
    input.attemptWrittenFirst === false ? 0 : 1,
    input.aiUnlocked ? 1 : 0,
    input.note?.trim().slice(0, 300) || null
  );
  return { ok: true, id };
}

// ---- topic scores ---------------------------------------------------------------------------

function scoreOf(rows: ProblemRow[], at: number): number {
  let weighted = 0;
  let weights = 0;
  for (const p of rows) {
    const ageDays = Math.max(0, (at - p.started_at) / DAY_MS);
    const w = Math.pow(0.5, ageDays / 14); // recent sessions count more
    weights += w;
    if (isUnaided(p)) weighted += w;
  }
  return weights > 0 ? Math.round((weighted / weights) * 10) : 0;
}

export function bandOf(score10: number): DashTopicScore['band'] {
  return score10 <= WEAK_MAX ? 'weak' : score10 >= STRONG_MIN ? 'strong' : 'getting-there';
}

export function getTopicScores(
  db: Database.Database,
  now: number,
  topicCourses: Map<string, string>,
  courseFilter?: string
): DashTopicScore[] {
  const rows = db
    .prepare('SELECT * FROM problem_attempts WHERE started_at >= ? ORDER BY started_at ASC')
    .all(now - 120 * DAY_MS) as ProblemRow[];
  const byTopic = new Map<string, ProblemRow[]>();
  for (const r of rows) byTopic.set(r.topic, [...(byTopic.get(r.topic) ?? []), r]);

  const out: DashTopicScore[] = [];
  for (const [topic, list] of byTopic) {
    const score10 = scoreOf(list, now);
    const older = list.filter((p) => p.started_at < now - 14 * DAY_MS);
    const change = older.length > 0 ? Math.sign(score10 - scoreOf(older, now - 14 * DAY_MS)) : 0;
    const stall = [...list].reverse().find((p) => p.outcome !== 'solved' && p.note)?.note ?? undefined;
    out.push({
      topic,
      name: topicName(topic),
      course: topicCourses.get(topic) ?? null,
      score10,
      band: bandOf(score10),
      unaidedSolved: list.filter(isUnaided).length,
      attempted: list.length,
      changeVsTwoWeeks: change,
      usualStall: stall
    });
  }
  const filtered = courseFilter ? out.filter((t) => t.course === courseFilter) : out;
  return filtered.sort((a, b) => a.score10 - b.score10 || b.attempted - a.attempted);
}

export function getPracticePlan(db: Database.Database, topicId: string): DashPracticeItem[] {
  const missed = db
    .prepare(
      "SELECT title, minutes FROM problem_attempts WHERE topic = ? AND outcome != 'solved' ORDER BY started_at DESC LIMIT 2"
    )
    .all(topicId) as Array<{ title: string; minutes: number }>;
  const plan: DashPracticeItem[] = [{ title: `Sketch the approach to ${topicName(topicId).toLowerCase()} on paper`, estimatedMin: 5 }];
  for (const m of missed) plan.push({ title: `Redo: ${m.title}`, estimatedMin: Math.max(10, Math.min(30, Math.round(m.minutes) || 15)) });
  plan.push({ title: `One new ${topicName(topicId).toLowerCase()} problem, no AI`, estimatedMin: 20 });
  return plan;
}

// ---- dashboard summary ----------------------------------------------------------------------

function localDay(ms: number): string {
  const d = new Date(ms);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export function getSummary(
  db: Database.Database,
  now: number,
  lists: RuleLists,
  prefs: DashPrefs,
  topicCourses: Map<string, string>
): DashSummary {
  const sessions = getSessions(db, 'all', now, lists);
  const latest = sessions[0] ?? null;
  const latestProblems = latest ? getSessionProblems(db, latest.id) : [];
  const scores = getTopicScores(db, now, topicCourses);
  const weak = scores.find((t) => t.band === 'weak');

  // 14-day grid, oldest first
  const sinceTs = now - 14 * DAY_MS; // rates and the curve use the last 14 days
  const todayKey = localDay(now);
  const gridSince = now - 21 * DAY_MS;
  const recent = sessions.filter((s) => new Date(s.startedAt).getTime() >= gridSince);
  const problemRows = db.prepare('SELECT * FROM problem_attempts WHERE started_at >= ?').all(gridSince) as ProblemRow[];
  const sessionDay = new Map<string, string>();
  for (const s of recent) sessionDay.set(s.id, localDay(new Date(s.startedAt).getTime()));
  const aiByDay = new Map<string, { ai: number; total: number }>();
  const eventsStmt = db.prepare('SELECT ts, app_name, window_title, url_domain, is_idle FROM app_events WHERE session_id = ? ORDER BY ts, id');
  const hourly = Array.from({ length: 18 }, () => ({ work: 0, total: 0 }));
  for (const s of recent) {
    const row = db.prepare('SELECT device, started_at, ended_at, label, id FROM sessions WHERE id = ?').get(s.id) as SessionRow;
    if (row.device !== 'desktop') continue;
    const end = row.ended_at ?? now;
    const day = sessionDay.get(s.id)!;
    for (const iv of intervalsFromEvents(eventsStmt.all(s.id) as AppEventRow[], end, lists)) {
      if (iv.category === 'paused') continue;
      const stop = Math.min(iv.end, end);
      const entry = aiByDay.get(day) ?? { ai: 0, total: 0 };
      entry.total += stop - iv.start;
      if (iv.category === 'ai_tool') entry.ai += stop - iv.start;
      aiByDay.set(day, entry);
      // spread the interval over hour-of-day buckets 6..23 (last 14 days only)
      if (iv.start < sinceTs) continue;
      let t = iv.start;
      while (t < stop) {
        const d = new Date(t);
        const next = Math.min(stop, new Date(d.getFullYear(), d.getMonth(), d.getDate(), d.getHours() + 1).getTime());
        const h = d.getHours();
        if (h >= 6 && h <= 23) {
          hourly[h - 6].total += next - t;
          if (iv.category === 'work') hourly[h - 6].work += next - t;
        }
        t = next;
      }
    }
  }
  const badProblemDays = new Set<string>();
  for (const p of problemRows) {
    if (p.ai_unlocked && !p.attempt_written_first) badProblemDays.add(localDay(p.started_at));
  }
  const sessionDays = new Set(sessionDay.values());

  // Two calendar weeks, Monday first, so the grid columns line up with M T W T F S S
  const days: DashSummary['streak']['days'] = [];
  const nowDate = new Date(now);
  const sinceMonday = (nowDate.getDay() + 6) % 7;
  for (let i = 0; i < 14; i++) {
    const at = new Date(nowDate.getFullYear(), nowDate.getMonth(), nowDate.getDate() - sinceMonday - 7 + i, 12).getTime();
    const key = localDay(at);
    if (key === todayKey) {
      days.push({ date: key, status: 'open' });
    } else if (key > todayKey || !sessionDays.has(key)) {
      days.push({ date: key, status: 'no-session' });
    } else {
      const share = aiByDay.get(key);
      const overCap = share && share.total > 0 && share.ai / share.total > prefs.independence.aiShareCap;
      days.push({ date: key, status: badProblemDays.has(key) || overCap ? 'leaned-on-ai' : 'clean' });
    }
  }
  let current = 0;
  let best = 0;
  let run = 0;
  for (const d of days) {
    if (d.status === 'clean') {
      run += 1;
      best = Math.max(best, run);
    } else if (d.date < todayKey) run = 0;
  }
  for (let i = days.length - 1; i >= 0; i--) {
    if (days[i].date >= todayKey) continue;
    if (days[i].status === 'clean') current += 1;
    else break;
  }

  const recentProblems = problemRows.filter((p) => p.started_at >= sinceTs);
  const withUnlock = recentProblems.filter((p) => p.ai_unlocked);
  const triedFirstRate = withUnlock.length > 0 ? withUnlock.filter((p) => p.attempt_written_first).length / withUnlock.length : 1;
  const totalMs = [...aiByDay.values()].reduce((n, v) => n + v.total, 0);
  const aiMs = [...aiByDay.values()].reduce((n, v) => n + v.ai, 0);
  const aiShareOfTime = totalMs > 0 ? aiMs / totalMs : 0;
  const solvedUnaidedRate = recentProblems.length > 0 ? recentProblems.filter(isUnaided).length / recentProblems.length : 0;

  const allProblems = db.prepare('SELECT outcome, ai_unlocked, hints_used, minutes FROM problem_attempts').all() as ProblemRow[];
  const totalMinutes = sessions.reduce((n, s) => n + s.minutes, 0);
  const xpTotal = allProblems.filter(isUnaided).length * 20 + totalMinutes;
  const longest = Math.max(best, current);

  const senseiSays = weak
    ? `${weak.name} keeps tripping you up. Try the next problem on paper before you open any AI. I'll hold the gate.`
    : latest
      ? 'Nice work so far. Keep writing an attempt before you open any AI and the streak grows itself.'
      : 'Start a session and log the problems you work. I will learn where you shine and where you stall.';

  return {
    streak: { current, best: longest, days, triedFirstRate, aiShareOfTime, solvedUnaidedRate },
    hourlyFocus: hourly.map((h, i) => ({ hour: i + 6, score: h.total > 0 ? Math.round((h.work / h.total) * 100) : 0 })),
    latestSession: latest,
    latestProblems,
    suggestedTopic: weak?.name ?? null,
    topics: scores,
    aiShareCap: prefs.independence.aiShareCap,
    showProductivityCurve: prefs.reports.showProductivityCurve,
    activeSessionId: sessions.find((s) => s.endedAt === null)?.id ?? null,
    senseiSays,
    level: Math.floor(xpTotal / 500) + 1,
    xp: { current: xpTotal % 500, max: 500 }
  };
}

// ---- Brightspace material ---------------------------------------------------------------------

export function topicCoursesFrom(materials: DashMaterial[]): Map<string, string> {
  const m = new Map<string, string>();
  for (const it of materials) if (it.topic && !m.has(it.topic)) m.set(it.topic, it.course);
  return m;
}
