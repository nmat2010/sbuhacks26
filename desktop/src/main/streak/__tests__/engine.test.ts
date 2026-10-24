import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type Database from 'better-sqlite3';
import { SettingsDefaults, type NudgeInput, type StreakSnapshotType } from '@wolfie/shared';
import { openDatabase } from '../../db/index.js';
import { logEvent } from '../../events.js';
import { PAUSED_APP } from '../../monitor/monitor.js';
import { StreakEngine } from '../engine.js';
import { focusMinutesByDate } from '../focus.js';
import { DAY, HOUR, MIN, seedDesktopSession, seedWebSession, workSession, zoned } from './helpers.js';

const NY = 'America/New_York';
const TOKYO = 'Asia/Tokyo';
const lists = { aiTools: SettingsDefaults['monitored.ai_tools'], distractions: SettingsDefaults['monitored.distractions'] };

let db: Database.Database;
let now: number;
let tz: string;
let pushed: NudgeInput[];
let pushResult: boolean;
let changes: StreakSnapshotType[];
let qualifying: number;
let reminderOn: boolean;
let reminderTime: string;
let engine: StreakEngine;

/** A day-start-relative local time, e.g. at('2026-10-24T09:00') */
const at = (local: string, zone = NY) => zoned(local, zone);

function makeEngine(): StreakEngine {
  return new StreakEngine({
    db: () => db,
    now: () => now,
    getTimeZone: () => tz,
    qualifyingMinutes: () => qualifying,
    reminderEnabled: () => reminderOn,
    reminderTime: () => reminderTime,
    getLists: () => lists,
    push: (n) => {
      pushed.push(n);
      return pushResult ? `n${pushed.length}` : null;
    },
    logEvent: (type, payload, opts) => logEvent(type, payload, opts),
    onChange: (s) => changes.push(s),
    random: () => 0
  });
}

beforeEach(() => {
  db = openDatabase(':memory:');
  now = at('2026-10-24T10:00');
  tz = NY;
  pushed = [];
  pushResult = true;
  changes = [];
  qualifying = 20;
  reminderOn = true;
  reminderTime = '20:00';
  engine = makeEngine();
});

afterEach(() => {
  db.close();
});

const texts = () => pushed.map((n) => n.text);
const eventCount = (type: string) => (db.prepare('SELECT COUNT(*) AS n FROM events WHERE type = ?').get(type) as { n: number }).n;
const state = () => db.prepare('SELECT current, longest, freezes_available FROM streak_state WHERE id = 1').get();

/** One 25-minute work session on the given local day at 09:00. */
const dayWork = (date: string, minutes = 25, zone = NY) => workSession(db, at(`${date}T09:00`, zone), minutes, zone);
const week = (from: string, n: number) => {
  for (let i = 0; i < n; i++) {
    const d = new Date(Date.UTC(+from.slice(0, 4), +from.slice(5, 7) - 1, +from.slice(8, 10) + i)).toISOString().slice(0, 10);
    dayWork(d);
  }
};

describe('focus minutes', () => {
  it('counts only work time: idle, AI tools, distractions and paused time are excluded', () => {
    const start = at('2026-10-24T09:00');
    seedDesktopSession(db, {
      start,
      end: start + 100 * MIN,
      events: [
        { at: start }, // Xcode work 10 min
        { at: start + 10 * MIN, app: 'Google Chrome', domain: 'youtube.com' }, // distraction 10
        { at: start + 20 * MIN, app: 'Google Chrome', domain: 'claude.ai' }, // AI tool 10
        { at: start + 30 * MIN, app: 'Google Chrome', domain: 'docs.google.com' }, // work 20
        { at: start + 50 * MIN, app: 'Google Chrome', domain: 'docs.google.com', idle: true }, // idle 10
        { at: start + 60 * MIN, app: PAUSED_APP }, // paused 20
        { at: start + 80 * MIN, app: 'Notes' } // work 20 (to session end)
      ]
    });
    const m = focusMinutesByDate(db, { now, defaultTz: NY, lists });
    expect([...m]).toEqual([['2026-10-24', 50]]);
  });

  it('splits a session that crosses midnight, in the zone it ran in', () => {
    workSession(db, at('2026-10-24T23:30'), 60, NY);
    const m = focusMinutesByDate(db, { now, defaultTz: NY, lists });
    expect([...m]).toEqual([
      ['2026-10-24', 30],
      ['2026-10-25', 30]
    ]);
  });

  it('DST spring forward and fall back: minutes follow real elapsed time', () => {
    workSession(db, at('2026-03-07T23:00'), 5 * 60); // 23:00 -> 04:00 EDT, skipping 02:00-03:00
    workSession(db, at('2026-10-31T22:00'), 5 * 60); // 22:00 EDT -> 03:00 EST over the repeated hour
    const m = focusMinutesByDate(db, { now, defaultTz: NY, lists });
    expect(m.get('2026-03-07')).toBe(60);
    expect(m.get('2026-03-08')).toBe(240);
    expect(m.get('2026-10-31')).toBe(120);
    expect(m.get('2026-11-01')).toBe(180);
  });

  it('a zone change later does not move sessions that already happened', () => {
    workSession(db, at('2026-10-24T22:00', NY), 30, NY); // 22:00-22:30 in New York = 11:00 the next morning in Tokyo
    const asRecorded = focusMinutesByDate(db, { now, defaultTz: TOKYO, lists });
    expect([...asRecorded]).toEqual([['2026-10-24', 30]]);
    // A session without a recorded zone (web, old data) uses the current one
    seedDesktopSession(db, { start: at('2026-10-24T22:00', NY), end: at('2026-10-24T22:30', NY), events: [{ at: at('2026-10-24T22:00', NY) }] });
    expect(focusMinutesByDate(db, { now, defaultTz: TOKYO, lists }).get('2026-10-25')).toBe(30);
  });

  it('web sessions: length minus hidden-tab time; unfinished ones do not count until they end', () => {
    const start = at('2026-10-24T14:00');
    seedWebSession(db, { start, end: start + 60 * MIN, hidden: [[start + 10 * MIN, start + 25 * MIN]] });
    seedWebSession(db, { start: start + 2 * HOUR, end: null });
    const m = focusMinutesByDate(db, { now, defaultTz: NY, lists });
    expect([...m]).toEqual([['2026-10-24', 45]]);
  });

  it('a running desktop session counts up to now', () => {
    now = at('2026-10-24T09:30');
    seedDesktopSession(db, { start: at('2026-10-24T09:00'), end: null, events: [{ at: at('2026-10-24T09:00') }] });
    expect(focusMinutesByDate(db, { now, defaultTz: NY, lists }).get('2026-10-24')).toBe(30);
  });
});

describe('StreakEngine: today, persistence and celebration', () => {
  it('finishing a 20-minute session celebrates once and updates the streak', () => {
    now = at('2026-10-24T09:15');
    seedDesktopSession(db, { start: at('2026-10-24T09:00'), end: null, events: [{ at: at('2026-10-24T09:00') }] });
    expect(engine.tick()).toMatchObject({ current: 0, todayQualified: false, todayMinutes: 15 });
    expect(pushed).toEqual([]);

    now = at('2026-10-24T09:21');
    const s = engine.tick();
    expect(s).toMatchObject({ current: 1, longest: 1, todayQualified: true, todayMinutes: 21 });
    expect(pushed).toHaveLength(1);
    expect(pushed[0]).toMatchObject({ kind: 'streak', spokenText: pushed[0].text });
    expect(pushed[0].text).toContain('21 focused minutes');

    now = at('2026-10-24T09:25');
    engine.tick();
    engine.tick();
    expect(pushed).toHaveLength(1); // once
    expect(eventCount('streak.qualified')).toBe(1);
    expect(state()).toEqual({ current: 1, longest: 1, freezes_available: 0 });
    expect(db.prepare('SELECT local_date, qualified, focus_minutes FROM streak_days').all()).toEqual([
      { local_date: '2026-10-24', qualified: 1, focus_minutes: 25 }
    ]);
    expect(changes.length).toBeGreaterThanOrEqual(2); // 15 min and 21 min snapshots differ
  });

  it('retries the celebration if the queue dropped it, and marks it done only when shown', () => {
    dayWork('2026-10-24');
    pushResult = false;
    engine.tick();
    engine.tick();
    expect(pushed.length).toBe(2); // tried again
    pushResult = true;
    engine.tick();
    engine.tick();
    expect(pushed.length).toBe(3); // shown once, then never again
  });

  it('uses the milestone message at 3, 7, ... days', () => {
    week('2026-10-22', 3);
    engine.tick();
    expect(texts()).toEqual(["Three days in a row! That's a habit starting to form."]);
  });

  it('a late-synced web session on a past day repairs the streak', () => {
    week('2026-10-20', 2); // 20th and 21st
    // 22nd: nothing yet. 23rd and 24th (today): work
    dayWork('2026-10-23');
    dayWork('2026-10-24');
    expect(engine.tick()).toMatchObject({ current: 2, longest: 2 }); // streak broke on the 22nd, 23rd+24th = 2
    expect(eventCount('streak.reset')).toBe(1);

    // The iPad syncs a session from the 22nd, done offline
    const start = at('2026-10-22T19:00');
    seedWebSession(db, { start, end: start + 30 * MIN });
    const fixed = engine.recalculate();
    expect(fixed).toMatchObject({ current: 5, longest: 5 });
    expect(changes.at(-1)).toMatchObject({ current: 5 });
  });

  it('combines desktop and web minutes for one day', () => {
    dayWork('2026-10-24', 12);
    const start = at('2026-10-24T16:00');
    seedWebSession(db, { start, end: start + 10 * MIN });
    expect(engine.recalculate()).toMatchObject({ todayMinutes: 22, todayQualified: true });
  });

  it('keeps the longest streak even after a reset', () => {
    week('2026-10-10', 5);
    engine.recalculate();
    now = at('2026-10-24T10:00'); // nothing since the 14th
    const s = engine.recalculate();
    expect(s).toMatchObject({ current: 0, longest: 5 });
    expect(state()).toMatchObject({ longest: 5 });
  });

  it('timezone change: days keep their recorded date and the streak carries on', () => {
    dayWork('2026-10-22', 25, NY);
    dayWork('2026-10-23', 25, NY);
    tz = TOKYO; // moved; it is now 24 Oct in Tokyo
    now = at('2026-10-24T09:30', TOKYO);
    seedDesktopSession(db, { start: at('2026-10-24T09:00', TOKYO), end: at('2026-10-24T09:25', TOKYO), events: [{ at: at('2026-10-24T09:00', TOKYO) }], tz: TOKYO });
    expect(engine.recalculate()).toMatchObject({ current: 3, todayQualified: true });
  });

  it('DST: a session across the changeover counts for the days it touched', () => {
    tz = NY;
    now = at('2026-03-08T12:00');
    workSession(db, at('2026-03-07T23:50'), 30, NY); // 10 min on the 7th, 20 on the 8th
    dayWork('2026-03-06');
    const s = engine.recalculate();
    // 6th qualifies (25), 7th has only 10 minutes (missed), 8th (today) has 20 so it qualifies
    expect(s).toMatchObject({ current: 1, todayQualified: true, todayMinutes: 20 });
    expect(eventCount('streak.reset')).toBe(1);
  });
});

describe('StreakEngine: freezes and resets', () => {
  it('a freeze covers a missed day and Wolfie says so once', () => {
    week('2026-10-16', 7); // 16..22 -> a freeze is earned on the 22nd
    dayWork('2026-10-24'); // the 23rd was missed
    now = at('2026-10-24T09:40');
    const s = engine.recalculate();
    expect(s).toMatchObject({ current: 8, freezesAvailable: 0 });
    expect(eventCount('streak.frozen')).toBe(1);
    expect(texts().some((t) => /freeze/i.test(t))).toBe(true);
    const n = pushed.length;
    engine.recalculate();
    expect(pushed.length).toBe(n);
  });

  it('a reset gets one kind message, never a guilt trip', () => {
    week('2026-10-18', 3); // 18..20, then nothing on the 21st, 22nd, 23rd
    const s = engine.recalculate();
    expect(s).toMatchObject({ current: 0, longest: 3 });
    const resetMsgs = pushed.filter((n) => /fresh start|no worries|new streak/i.test(n.text));
    expect(resetMsgs).toHaveLength(1);
    expect(resetMsgs[0].text).not.toMatch(/lost|failed|broke|disappoint/i);
    engine.recalculate();
    expect(pushed.filter((n) => /fresh start|no worries|new streak/i.test(n.text))).toHaveLength(1);
    expect(eventCount('streak.reset')).toBe(1);
  });

  it('does not announce resets from old history', () => {
    week('2026-09-01', 3); // reset long ago
    engine.recalculate();
    expect(pushed).toEqual([]);
    expect(eventCount('streak.reset')).toBe(1); // still recorded
  });
});

describe('StreakEngine: evening reminder', () => {
  beforeEach(() => {
    week('2026-10-22', 2); // 22nd, 23rd -> a 2-day streak at stake on the 24th
  });

  it('fires once after the reminder time when a streak is at stake and today has not qualified', () => {
    now = at('2026-10-24T19:59');
    engine.tick();
    expect(pushed).toEqual([]);
    now = at('2026-10-24T20:00');
    engine.tick();
    expect(pushed).toHaveLength(1);
    expect(pushed[0].text).toContain('2-day streak');
    expect(pushed[0].text).toContain('20-minute');
    now = at('2026-10-24T21:00');
    engine.tick();
    expect(pushed).toHaveLength(1);
    now = at('2026-10-25T20:30'); // the next day: the streak is already gone by then, so no reminder
    engine.tick();
    expect(pushed.filter((n) => /streak/.test(n.text) && /minute/.test(n.text) && /evening|quick/i.test(n.text))).toHaveLength(1);
  });

  it('asks only for the minutes still missing', () => {
    now = at('2026-10-24T20:00');
    workSession(db, at('2026-10-24T18:00'), 12);
    engine.tick();
    expect(pushed[0].text).toMatch(/\b8\b/);
  });

  it('stays quiet when today qualified, with no streak at stake, or when switched off', () => {
    now = at('2026-10-24T20:30');
    dayWork('2026-10-24');
    engine.tick();
    expect(pushed.filter((n) => /session tonight|check-in/i.test(n.text))).toEqual([]);

    db.prepare('DELETE FROM streak_days').run();
    db.prepare('DELETE FROM app_events').run();
    db.prepare('DELETE FROM sessions').run();
    pushed = [];
    engine = makeEngine();
    engine.tick();
    expect(pushed).toEqual([]); // nothing at stake

    week('2026-10-22', 2);
    reminderOn = false;
    engine = makeEngine();
    engine.tick();
    expect(pushed).toEqual([]);
  });

  it('honors a custom reminder time and tries again if the queue dropped it', () => {
    reminderTime = '18:30';
    now = at('2026-10-24T18:29');
    engine.tick();
    expect(pushed).toEqual([]);
    now = at('2026-10-24T18:31');
    pushResult = false;
    engine.tick();
    expect(pushed).toHaveLength(1);
    pushResult = true;
    now = at('2026-10-24T18:32');
    engine.tick();
    expect(pushed).toHaveLength(2); // retried and shown
    now = at('2026-10-24T18:33');
    engine.tick();
    expect(pushed).toHaveLength(2);
  });

  it('uses the local clock of the current zone', () => {
    const instant = at('2026-10-24T20:05', TOKYO); // 07:05 the same morning in New York
    now = instant;
    tz = NY;
    engine.tick();
    expect(pushed).toEqual([]); // 07:05 local: too early

    tz = TOKYO;
    engine = makeEngine();
    engine.tick();
    expect(pushed).toHaveLength(1); // 20:05 local; the two seeded days still count (their dates were recorded in New York)
    expect(pushed[0].text).toContain('2-day streak');
  });
});

describe('StreakEngine: snapshot for the web app and UI', () => {
  it('returns the shape of streak.snapshot with a weekly calendar', () => {
    week('2026-10-22', 2);
    now = at('2026-10-24T10:00');
    const s = engine.getStreak();
    expect(s).toMatchObject({ current: 2, longest: 2, freezesAvailable: 0, todayQualified: false, todayMinutes: 0 });
    expect(s.week).toHaveLength(7);
    expect(s.week.at(-1)).toEqual({ localDate: '2026-10-24', status: 'pending' });
    expect(s.week.at(-2)).toEqual({ localDate: '2026-10-23', status: 'filled' });
  });

  it('is idempotent: recalculating twice changes nothing', () => {
    week('2026-10-22', 2);
    const a = engine.recalculate();
    const rows = db.prepare('SELECT * FROM streak_days ORDER BY local_date').all();
    const b = engine.recalculate();
    expect(b).toEqual(a);
    expect(db.prepare('SELECT * FROM streak_days ORDER BY local_date').all()).toEqual(rows);
    expect(DAY).toBeGreaterThan(0);
  });
});
