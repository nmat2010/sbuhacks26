import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type Database from 'better-sqlite3';
import { SettingsDefaults } from '@wolfie/shared';
import { openDatabase } from '../../db/index.js';
import { getFocusCurve, sessionDrifts, SAMPLE_CURVE } from '../focus-curve.js';

const lists = { aiTools: SettingsDefaults['monitored.ai_tools'], distractions: SettingsDefaults['monitored.distractions'] };
const MIN = 60_000;
const NOW = 100 * 86_400_000;
let db: Database.Database;

beforeEach(() => {
  db = openDatabase(':memory:');
});
afterEach(() => {
  db.close();
});

/**
 * A session from a timeline of [minute, app, domain]: each row lasts until the next, the last
 * until `length` minutes. Chrome rows with a domain are browsing that site.
 */
function session(id: string, startMin: number, length: number, rows: Array<[number, string, string | null]>) {
  const start = NOW - 5 * 86_400_000 + startMin * MIN;
  db.prepare("INSERT INTO sessions (id, device, started_at, ended_at) VALUES (?, 'desktop', ?, ?)").run(id, start, start + length * MIN);
  const insert = db.prepare('INSERT INTO app_events (session_id, ts, app_name, window_title, url_domain, is_idle) VALUES (?, ?, ?, ?, ?, 0)');
  for (const [minute, app, domain] of rows) insert.run(id, start + minute * MIN, app, null, domain);
}

describe('focus curve', () => {
  it('too few recorded sessions: the sample curve', () => {
    session('s1', 0, 40, [[0, 'Code', null]]);
    expect(getFocusCurve(db, lists, NOW)).toBe(SAMPLE_CURVE);
  });

  it('answers from the record: average length, when you usually drift and where, focus over the session', () => {
    // Three 40-minute sessions: focused work, then YouTube around minute 20-25, then back to work
    session('a', 0, 40, [[0, 'Code', null], [20, 'Google Chrome', 'youtube.com'], [26, 'Code', null]]);
    session('b', 1000, 40, [[0, 'Code', null], [25, 'Google Chrome', 'youtube.com'], [30, 'Code', null]]);
    session('c', 2000, 40, [[0, 'Code', null], [22, 'Google Chrome', 'reddit.com'], [24, 'Code', null]]);
    const curve = getFocusCurve(db, lists, NOW);
    expect(curve).toMatchObject({ sample: false, sessions: 3, avgSessionMinutes: 40, bucketMinutes: 5 });
    expect(curve.points).toHaveLength(8);
    expect(curve.firstDrift).toEqual({ minute: 22, sessionsWithDrift: 3, topSites: ['youtube.com', 'reddit.com'] });
    // Full focus early, the dip where the drifts happen
    expect(curve.points[0]).toMatchObject({ minute: 0, focus: 100, distraction: 0 });
    expect(curve.points[4].focus).toBeLessThan(100);
    expect(curve.points[4].distraction).toBeGreaterThan(0);
    expect(curve.peak).toEqual({ fromMinute: 0, toMinute: 5, focus: 100 });
    expect(curve.dropAfterDrift).toBe(100 - curve.points[4].focus);
  });

  it("a session's drifts: when, where, how long (one site's back-to-back rows merged)", () => {
    session('d', 0, 30, [
      [0, 'Code', null],
      [12, 'Google Chrome', 'youtube.com'],
      [14, 'Google Chrome', 'youtube.com'],
      [16, 'Code', null],
      [25, 'ChatGPT', null]
    ]);
    expect(sessionDrifts(db, 'd', lists, NOW)).toEqual([
      { minute: 12, site: 'youtube.com', kind: 'distraction', minutes: 4 },
      { minute: 25, site: 'ChatGPT', kind: 'ai_tool', minutes: 5 }
    ]);
  });
});
