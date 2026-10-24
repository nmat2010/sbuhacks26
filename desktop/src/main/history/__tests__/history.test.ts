import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type Database from 'better-sqlite3';
import { SettingsDefaults } from '@wolfie/shared';
import { DATA_TABLES, openDatabase, setDatabaseForTesting } from '../../db/index.js';
import { getSetting, setSetting } from '../../settings.js';
import { PAUSED_APP } from '../../monitor/monitor.js';
import { buildExport, clearAllData } from '../data-controls.js';
import { getHistory } from '../queries.js';
import { keyPresent, readPublicSettings, validateSetting, writePublicSetting } from '../settings-api.js';
import { categorizeEvent } from '../categories.js';
import { seedDesktopSession, seedWebSession } from '../../streak/__tests__/helpers.js';

const lists = { aiTools: SettingsDefaults['monitored.ai_tools'], distractions: SettingsDefaults['monitored.distractions'] };
const MIN = 60_000;
const T0 = 1_800_000_000_000;

let db: Database.Database;

beforeEach(() => {
  db = openDatabase(':memory:');
  setDatabaseForTesting(db);
});

afterEach(() => {
  setDatabaseForTesting(null);
  db.close();
});

/** Independent reference: time per category straight from the raw rows, with the category known by construction. */
function rawTotals(sessionIds: string[], endOf: (id: string) => number): Record<string, number> {
  const out: Record<string, number> = { work: 0, ai_tool: 0, distraction: 0, idle: 0, paused: 0 };
  for (const id of sessionIds) {
    const rows = db.prepare('SELECT ts, app_name, url_domain, is_idle FROM app_events WHERE session_id = ? ORDER BY ts, id').all(id) as {
      ts: number;
      app_name: string;
      url_domain: string | null;
      is_idle: number;
    }[];
    rows.forEach((r, i) => {
      const end = rows[i + 1]?.ts ?? endOf(id);
      const secs = (end - r.ts) / 1000;
      let cat = 'work';
      if (r.app_name === PAUSED_APP) cat = 'paused';
      else if (r.is_idle) cat = 'idle';
      else if (r.url_domain === 'youtube.com' || r.app_name === 'Steam') cat = 'distraction';
      else if (r.url_domain === 'claude.ai') cat = 'ai_tool';
      out[cat] += secs;
    });
  }
  return out;
}

function seedSessions() {
  const a = seedDesktopSession(db, {
    id: 'a',
    start: T0,
    end: T0 + 90 * MIN,
    events: [
      { at: T0 }, // Xcode, work 20 min
      { at: T0 + 20 * MIN, app: 'Google Chrome', domain: 'youtube.com' }, // distraction 5
      { at: T0 + 25 * MIN, app: 'Google Chrome', domain: 'claude.ai' }, // AI 15
      { at: T0 + 40 * MIN, app: 'Google Chrome', domain: 'docs.google.com' }, // work 20
      { at: T0 + 60 * MIN, app: 'Google Chrome', domain: 'docs.google.com', idle: true }, // idle 10
      { at: T0 + 70 * MIN, app: PAUSED_APP }, // paused 10
      { at: T0 + 80 * MIN, app: 'Steam' } // distraction 10 (to the session end)
    ]
  });
  const b = seedDesktopSession(db, {
    id: 'b',
    start: T0 + 3 * 60 * MIN,
    end: T0 + 3 * 60 * MIN + 30 * MIN,
    events: [{ at: T0 + 3 * 60 * MIN }, { at: T0 + 3 * 60 * MIN + 10 * MIN, idle: true }]
  });
  return { a, b };
}

describe('History', () => {
  it("totals match the raw app_events (and paused time is never counted)", () => {
    const { a, b } = seedSessions();
    const end: Record<string, number> = { a: T0 + 90 * MIN, b: T0 + 3 * 60 * MIN + 30 * MIN };
    const raw = rawTotals([a, b], (id) => end[id]);

    const h = getHistory(db, { now: T0 + 10 * 60 * MIN, lists });
    expect(h.totals.seconds).toEqual({ work: raw.work, ai_tool: raw.ai_tool, distraction: raw.distraction, idle: raw.idle });
    expect(raw.work).toBe((20 + 20 + 10) * 60);
    expect(raw.paused).toBe(10 * 60);

    const sa = h.sessions.find((s) => s.id === 'a')!;
    expect(sa.seconds).toEqual({ work: 40 * 60, ai_tool: 15 * 60, distraction: 15 * 60, idle: 10 * 60 });
    const sum = Object.values(sa.seconds).reduce((x, y) => x + y, 0);
    expect(sum + 10 * 60 /* paused */).toBe(90 * 60); // session length = categories + paused time
  });

  it('lists sessions newest first and honors limit and sinceTs', () => {
    seedSessions();
    const all = getHistory(db, { now: T0 + 10 * 60 * MIN, lists });
    expect(all.sessions.map((s) => s.id)).toEqual(['b', 'a']);
    expect(getHistory(db, { now: T0 + 10 * 60 * MIN, lists, limit: 1 }).sessions.map((s) => s.id)).toEqual(['b']);
    expect(getHistory(db, { now: T0 + 10 * 60 * MIN, lists, sinceTs: T0 + 60 * MIN }).sessions.map((s) => s.id)).toEqual(['b']);
  });

  it('counts nudges, hints, deepest hint level and deepest escalation level per session', () => {
    seedSessions();
    const nudge = db.prepare("INSERT INTO nudges (uid, session_id, ts, device, kind, level, payload_json) VALUES (?, ?, ?, 'desktop', 'stuck', 3, '{}')");
    nudge.run('n1', 'a', T0 + MIN);
    nudge.run('n2', 'a', T0 + 2 * MIN);
    nudge.run('n3', 'b', T0 + 3 * 60 * MIN + MIN);
    const hint = db.prepare("INSERT INTO hint_requests (session_id, ts, device, source, trigger, hint_level, hint_text) VALUES (?, ?, 'desktop', 'page', 'auto', ?, 'x')");
    hint.run('a', T0 + 3 * MIN, 1);
    hint.run('a', T0 + 4 * MIN, 2);
    hint.run('a', T0 + 5 * MIN, 4);
    const ev = db.prepare("INSERT INTO events (ts, device, type, payload_json) VALUES (?, 'desktop', 'stuck.level', ?)");
    ev.run(T0 + 6 * MIN, JSON.stringify({ level: 2 }));
    ev.run(T0 + 7 * MIN, JSON.stringify({ level: 3 }));
    ev.run(T0 + 8 * MIN, JSON.stringify({ level: 1 }));
    ev.run(T0 + 3 * 60 * MIN + 5 * MIN, JSON.stringify({ level: 1 }));
    // Another device's event inside the same time range must not leak in
    db.prepare("INSERT INTO events (ts, device, type, payload_json) VALUES (?, 'webapp', 'stuck.level', ?)").run(T0 + 9 * MIN, JSON.stringify({ level: 4 }));

    const h = getHistory(db, { now: T0 + 10 * 60 * MIN, lists });
    const a = h.sessions.find((s) => s.id === 'a')!;
    const b = h.sessions.find((s) => s.id === 'b')!;
    expect([a.nudgeCount, a.hintCount, a.deepestHintLevel, a.deepestEscalationLevel]).toEqual([2, 3, 4, 3]);
    expect([b.nudgeCount, b.hintCount, b.deepestHintLevel, b.deepestEscalationLevel]).toEqual([1, 0, 0, 1]);
    expect(h.totals).toMatchObject({ nudgeCount: 3, hintCount: 3 });
  });

  it('web sessions: work is the session length minus hidden-tab time, which shows as idle', () => {
    seedWebSession(db, { id: 'w', start: T0, end: T0 + 60 * MIN, hidden: [[T0 + 10 * MIN, T0 + 25 * MIN]] });
    const s = getHistory(db, { now: T0 + 2 * 60 * MIN, lists }).sessions[0];
    expect(s).toMatchObject({ device: 'webapp', seconds: { work: 45 * 60, idle: 15 * 60, ai_tool: 0, distraction: 0 } });
  });

  it('a running session counts up to now', () => {
    seedDesktopSession(db, { id: 'live', start: T0, end: null, events: [{ at: T0 }] });
    const s = getHistory(db, { now: T0 + 12 * MIN, lists }).sessions[0];
    expect(s.endedAt).toBeNull();
    expect(s.seconds.work).toBe(12 * 60);
  });

  it('categorizes events the same way the rules do', () => {
    const ev = (over: Partial<Parameters<typeof categorizeEvent>[0]>) => categorizeEvent({ ts: 0, app_name: 'Xcode', window_title: null, url_domain: null, is_idle: 0, ...over }, lists);
    expect(ev({})).toBe('work');
    expect(ev({ is_idle: 1 })).toBe('idle');
    expect(ev({ app_name: PAUSED_APP })).toBe('paused');
    expect(ev({ app_name: 'Google Chrome', url_domain: 'chatgpt.com' })).toBe('ai_tool');
    expect(ev({ app_name: 'Google Chrome', window_title: 'Funny cats - YouTube' })).toBe('distraction');
    expect(ev({ app_name: 'Steam' })).toBe('distraction');
  });
});

describe('settings access', () => {
  it('reads every setting except pairing secrets', () => {
    const s = readPublicSettings(getSetting) as unknown as Record<string, unknown>;
    expect(s['monitored.excluded_domains']).toEqual(SettingsDefaults['monitored.excluded_domains']);
    expect(Object.keys(s).some((k) => k.startsWith('pairing.'))).toBe(false);
    expect(Object.keys(s).length).toBe(Object.keys(SettingsDefaults).filter((k) => !k.startsWith('pairing.')).length);
  });

  it('writes valid values and normalizes domains and rule lists', () => {
    expect(writePublicSetting('monitored.excluded_domains', ['  HTTPS://www.Chase.com/ ', 'chase.com', 'bank.example'], setSetting)).toEqual({
      success: true,
      value: ['chase.com', 'bank.example']
    });
    expect(getSetting('monitored.excluded_domains')).toEqual(['chase.com', 'bank.example']);

    const r = writePublicSetting('monitored.distractions', [{ name: ' Twitch ', domains: ['Twitch.TV'], appNames: [' Twitch '], enabled: true }], setSetting);
    expect(r.success).toBe(true);
    expect(getSetting('monitored.distractions')).toEqual([{ name: 'Twitch', domains: ['twitch.tv'], appNames: ['Twitch'], enabled: true }]);

    expect(writePublicSetting('streak.reminder_time', '21:30', setSetting).success).toBe(true);
    expect(writePublicSetting('voice.enabled', true, setSetting).success).toBe(true);
    expect(writePublicSetting('session.auto_start_app', null, setSetting).success).toBe(true);
    expect(getSetting('voice.enabled')).toBe(true);
  });

  it('rejects unknown keys, wrong shapes and out-of-range values, and stores nothing', () => {
    const before = db.prepare('SELECT COUNT(*) AS n FROM settings').get();
    const bad: [unknown, unknown][] = [
      ['no.such.key', 1],
      ['voice.enabled', 'yes'],
      ['nudge.max_per_hour', -3],
      ['nudge.max_per_hour', 100_000],
      ['streak.reminder_time', '25:99'],
      ['monitored.ai_tools', [{ name: 'x' }]],
      ['monitored.excluded_domains', 'chase.com'],
      ['stuck.thresholds', { wrongAnswerCount: 2 }],
      ['voice.stt_provider', 'whisper'],
      ['nudge.cooldown_minutes', { stuck: 3 }],
      [42, 'x']
    ];
    for (const [k, v] of bad) expect(writePublicSetting(k, v, setSetting).success, String(k)).toBe(false);
    expect(db.prepare('SELECT COUNT(*) AS n FROM settings').get()).toEqual(before);
  });

  it('keeps pairing settings off limits', () => {
    for (const k of ['pairing.extension_token', 'pairing.webapp_devices', 'pairing.extension_id']) {
      expect(validateSetting(k, 'x')).toMatchObject({ ok: false, error: expect.stringMatching(/Pairing/) });
    }
    expect(getSetting('pairing.extension_token')).toBeNull();
  });

  it('detects real API keys but not template placeholders', () => {
    expect(keyPresent('AIzaSyReal')).toBe(true);
    expect(keyPresent(undefined)).toBe(false);
    expect(keyPresent('')).toBe(false);
    expect(keyPresent('your_gemini_api_key_here')).toBe(false);
  });
});

describe('data controls', () => {
  /** One row in every table, including child tables, so foreign keys are exercised. */
  function seedEverything(): void {
    db.exec(`
      INSERT INTO sessions (id, device, started_at, ended_at) VALUES ('s1', 'desktop', 1, 2), ('w1', 'webapp', 1, 2);
      INSERT INTO app_events (session_id, ts, app_name) VALUES ('s1', 1, 'Xcode');
      INSERT INTO web_signals (session_id, ts, type, strength) VALUES ('s1', 1, 'wrong_answer_loop', 'strong');
      INSERT INTO nudges (uid, session_id, ts, device, kind, level, payload_json) VALUES ('n1', 's1', 1, 'desktop', 'stuck', 3, '{}');
      INSERT INTO goals (id, title, type) VALUES ('g1', 'Lab', 'research');
      INSERT INTO plan_items (id, goal_id, title) VALUES ('p1', 'g1', 'Read');
      INSERT INTO papers (id, goal_id, title, url_or_path, added_at) VALUES ('pa1', 'g1', 'Paper', 'x', 1);
      INSERT INTO paper_questions (paper_id, question, answer, input_mode, ts) VALUES ('pa1', 'q', 'a', 'text', 1);
      INSERT INTO hint_requests (session_id, ts, device, source, trigger, image_path, hint_level, hint_text) VALUES ('s1', 1, 'desktop', 'screen', 'auto', '/tmp/img1.png', 1, 'x');
      INSERT INTO hint_requests (session_id, ts, device, source, trigger, hint_level, hint_text) VALUES ('s1', 2, 'desktop', 'page', 'auto', 2, 'y');
      INSERT INTO webapp_activity (session_id, ts, type) VALUES ('w1', 1, 'canvas_stroke');
      INSERT INTO streak_days (local_date, qualified, focus_minutes) VALUES ('2026-10-01', 1, 30);
      INSERT INTO events (ts, device, type) VALUES (1, 'desktop', 'session.start');
      INSERT INTO a_sync_seen (id, device_id, seen_at) VALUES ('d:1', 'd', 1);
      INSERT INTO a_session_tz (session_id, tz) VALUES ('s1', 'America/New_York');
    `);
    db.prepare("UPDATE streak_state SET current = 5, longest = 9, freezes_available = 2, last_freeze_grant = '2026-10-01' WHERE id = 1").run();
    setSetting('voice.enabled', true);
    setSetting('pairing.extension_token', 'ABCD-EFGH-JKLM');
    setSetting('pairing.webapp_devices', [{ deviceId: 'd', name: 'iPad', secret: 'TOPSECRET', pairedAt: 1 }]);
  }

  const count = (t: string) => (db.prepare(`SELECT COUNT(*) AS n FROM ${t}`).get() as { n: number }).n;

  it('seeding really fills every table (so the clear test means something)', () => {
    seedEverything();
    for (const t of DATA_TABLES) expect(count(t), t).toBeGreaterThan(0);
  });

  it('clear leaves every table empty except the re-seeded streak row, and deletes stored images', () => {
    seedEverything();
    const deleted: string[] = [];
    const result = clearAllData(db, DATA_TABLES, { deleteFile: (p) => deleted.push(p) });
    for (const t of DATA_TABLES) {
      if (t === 'streak_state') continue;
      expect(count(t), t).toBe(0);
    }
    expect(db.prepare('SELECT * FROM streak_state').all()).toEqual([
      { id: 1, current: 0, longest: 0, freezes_available: 0, last_freeze_grant: null }
    ]);
    expect(deleted).toEqual(['/tmp/img1.png']);
    expect(result.tablesCleared.length).toBe(DATA_TABLES.length);
    expect(db.pragma('foreign_keys', { simple: true })).toBe(1); // foreign keys are back on
  });

  it('can keep the settings (and with them the pairings)', () => {
    seedEverything();
    clearAllData(db, DATA_TABLES, { keepSettings: true });
    expect(count('settings')).toBe(3);
    expect(count('sessions')).toBe(0);
  });

  it('export covers every table and leaves out pairing secrets', () => {
    seedEverything();
    const out = buildExport(db, DATA_TABLES, 123);
    expect(out).toMatchObject({ app: 'wolfie-sensei', version: 1, exportedAt: 123 });
    expect(Object.keys(out.tables).sort()).toEqual([...DATA_TABLES].sort());
    expect(out.tables.sessions).toHaveLength(2);
    expect(out.tables.app_events).toHaveLength(1);
    const blob = JSON.stringify(out);
    expect(blob).not.toContain('TOPSECRET');
    expect(blob).not.toContain('ABCD-EFGH-JKLM');
    expect(out.tables.settings).toEqual([{ key: 'voice.enabled', value_json: 'true' }]);
    expect(() => JSON.parse(blob)).not.toThrow();
  });

  it('refuses table names that are not plain identifiers', () => {
    expect(() => buildExport(db, ['sessions; DROP TABLE sessions'], 1)).toThrow(/unsafe/);
    expect(() => clearAllData(db, ['x y'])).toThrow(/unsafe/);
  });
});
