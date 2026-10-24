import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type Database from 'better-sqlite3';
import { openDatabase, setDatabaseForTesting } from '../../db/index.js';
import { setSetting } from '../../settings.js';
import {
  closeOrphanedSessions,
  getActiveSession,
  isMicAllowed,
  sessionEvents,
  setActiveSession,
  setAssessmentMode,
  setPaused,
  startSession,
  stopSession
} from '../index.js';

let db: Database.Database;

beforeEach(() => {
  db = openDatabase(':memory:');
  setDatabaseForTesting(db);
});

afterEach(() => {
  setPaused(false);
  setActiveSession(null);
  sessionEvents.removeAllListeners();
  setDatabaseForTesting(null);
  db.close();
});

const eventTypes = () => (db.prepare('SELECT type FROM events ORDER BY id').all() as { type: string }[]).map((e) => e.type);

describe('sessions', () => {
  it('persists a sessions row and logs session.start / session.end', () => {
    const s = startSession({ assessmentMode: true });
    expect(db.prepare('SELECT device, assessment_mode, ended_at FROM sessions WHERE id = ?').get(s.id)).toEqual({
      device: 'desktop',
      assessment_mode: 1,
      ended_at: null
    });
    stopSession();
    const row = db.prepare('SELECT started_at, ended_at FROM sessions WHERE id = ?').get(s.id) as {
      started_at: number;
      ended_at: number;
    };
    expect(row.ended_at).toBeGreaterThanOrEqual(row.started_at);
    expect(eventTypes()).toEqual(['session.start', 'session.end']);
    expect(getActiveSession()).toBeNull();
  });

  it('is idempotent while a session is active and emits change', () => {
    const changes: (string | null)[] = [];
    sessionEvents.on('change', (s) => changes.push(s?.id ?? null));
    const a = startSession();
    const b = startSession();
    expect(b).toBe(a);
    stopSession();
    stopSession();
    expect(changes).toEqual([a.id, null]);
    expect(db.prepare('SELECT COUNT(*) AS n FROM sessions').get()).toEqual({ n: 1 });
  });

  it('toggles assessment mode in place without a change event', () => {
    const s = startSession();
    let changes = 0;
    sessionEvents.on('change', () => changes++);
    setAssessmentMode(true);
    expect(getActiveSession()).toBe(s);
    expect(s.assessmentMode).toBe(true);
    expect(db.prepare('SELECT assessment_mode FROM sessions WHERE id = ?').get(s.id)).toEqual({ assessment_mode: 1 });
    expect(changes).toBe(0);
  });

  it('mic is allowed only in an active, unpaused session with voice on', () => {
    expect(isMicAllowed()).toBe(false);
    setSetting('voice.enabled', true);
    expect(isMicAllowed()).toBe(false); // no session
    startSession();
    expect(isMicAllowed()).toBe(true);
    setPaused(true);
    expect(isMicAllowed()).toBe(false);
    setPaused(false);
    setSetting('voice.enabled', false);
    expect(isMicAllowed()).toBe(false);
  });

  it('closes sessions a previous run left open, at their last activity', () => {
    db.prepare("INSERT INTO sessions (id, device, started_at) VALUES ('old', 'desktop', 100)").run();
    db.prepare("INSERT INTO app_events (session_id, ts, app_name) VALUES ('old', 500, 'Xcode')").run();
    db.prepare("INSERT INTO sessions (id, device, started_at) VALUES ('web', 'webapp', 100)").run();
    expect(closeOrphanedSessions(db)).toBe(1);
    expect(db.prepare("SELECT ended_at FROM sessions WHERE id = 'old'").get()).toEqual({ ended_at: 500 });
    expect(db.prepare("SELECT ended_at FROM sessions WHERE id = 'web'").get()).toEqual({ ended_at: null });
  });
});
