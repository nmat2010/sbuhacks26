import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type Database from 'better-sqlite3';
import { DATA_TABLES, openDatabase, setDatabaseForTesting } from '../db/index.js';
import { getSetting, setSetting } from '../settings.js';
import { logEvent } from '../events.js';
import { SettingsDefaults, SettingsKeys } from '@wolfie/shared';

let db: Database.Database;

beforeEach(() => {
  db = openDatabase(':memory:');
  setDatabaseForTesting(db);
});

afterEach(() => {
  setDatabaseForTesting(null);
  db.close();
});

describe('database', () => {
  it('creates every table and applies all migrations', () => {
    const tables = (db.prepare("SELECT name FROM sqlite_master WHERE type = 'table'").all() as { name: string }[]).map(
      (r) => r.name
    );
    for (const t of DATA_TABLES) expect(tables).toContain(t);
    const migrations = db.prepare('SELECT name FROM migrations ORDER BY id').all() as { name: string }[];
    expect(migrations.map((m) => m.name).filter((n) => /^0\d\d_/.test(n))).toEqual([
      '001_initial_schema',
      '002_nudges_uid_nullable_session'
    ]);
  });

  it('allows nudges without a session and stores the uid', () => {
    db.prepare(
      "INSERT INTO nudges (uid, session_id, ts, device, kind, level, payload_json) VALUES ('n1', NULL, 1, 'desktop', 'streak', 1, '{}')"
    ).run();
    db.prepare("UPDATE nudges SET user_response = 'ok' WHERE uid = 'n1'").run();
    expect(db.prepare("SELECT user_response FROM nudges WHERE uid = 'n1'").get()).toEqual({ user_response: 'ok' });
  });

  it('rejects the old ipad device name', () => {
    expect(() =>
      db.prepare("INSERT INTO events (ts, device, type) VALUES (1, 'ipad', 'x')").run()
    ).toThrow();
  });
});

describe('settings', () => {
  it('returns defaults, then stored values', () => {
    expect(getSetting(SettingsKeys.NUDGE_MAX_PER_HOUR)).toBe(SettingsDefaults['nudge.max_per_hour']);
    setSetting(SettingsKeys.NUDGE_MAX_PER_HOUR, 3);
    expect(getSetting(SettingsKeys.NUDGE_MAX_PER_HOUR)).toBe(3);
    setSetting(SettingsKeys.NUDGE_MAX_PER_HOUR, 4);
    expect(getSetting(SettingsKeys.NUDGE_MAX_PER_HOUR)).toBe(4);
  });

  it('does not let callers mutate the defaults', () => {
    getSetting(SettingsKeys.EXCLUDED_DOMAINS).push('evil.com');
    expect(getSetting(SettingsKeys.EXCLUDED_DOMAINS)).not.toContain('evil.com');
  });
});

describe('logEvent', () => {
  it('appends to the events table', () => {
    logEvent('session.start', { id: 's1' }, { ts: 42 });
    expect(db.prepare('SELECT ts, device, type, payload_json FROM events').get()).toEqual({
      ts: 42,
      device: 'desktop',
      type: 'session.start',
      payload_json: '{"id":"s1"}'
    });
  });
});
