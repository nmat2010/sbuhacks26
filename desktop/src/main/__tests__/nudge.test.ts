import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type Database from 'better-sqlite3';
import type { Nudge } from '@wolfie/shared';
import { openDatabase, setDatabaseForTesting } from '../db/index.js';
import { initNudgeQueue, resetNudgeQueueForTesting } from '../nudge/index.js';
import { setSetting } from '../settings.js';
import { setActiveSession } from '../session/index.js';

let db: Database.Database;

beforeEach(() => {
  db = openDatabase(':memory:');
  setDatabaseForTesting(db);
});

afterEach(() => {
  resetNudgeQueueForTesting();
  setActiveSession(null);
  setDatabaseForTesting(null);
  db.close();
});

const offer = { kind: 'stuck', level: 3, text: 'Want a hint?' } as const;

describe('NudgeQueue', () => {
  it('assigns ids, emits them, and logs shown nudges with the active session', () => {
    db.prepare("INSERT INTO sessions (id, device, started_at) VALUES ('s1', 'desktop', 0)").run();
    setActiveSession({ id: 's1', startedAt: 0, assessmentMode: false });
    const queue = initNudgeQueue();
    const shown: Nudge[] = [];
    queue.on('show', (n: Nudge) => shown.push(n));

    const id = queue.push(offer);
    expect(id).toBeTruthy();
    expect(shown[0].id).toBe(id);
    expect(db.prepare('SELECT uid, session_id, kind, level FROM nudges').get()).toEqual({
      uid: id,
      session_id: 's1',
      kind: 'stuck',
      level: 3
    });
  });

  it('logs responses to nudges.user_response and events', () => {
    const queue = initNudgeQueue();
    const id = queue.push(offer)!;
    queue.respond({ id, action: 'decline', via: 'button' });
    expect(db.prepare('SELECT user_response FROM nudges WHERE uid = ?').get(id)).toEqual({ user_response: 'decline' });
    expect(db.prepare("SELECT COUNT(*) AS n FROM events WHERE type = 'nudge.answered'").get()).toEqual({ n: 1 });
  });

  it('enforces the per-kind cooldown but lets user-initiated nudges through', () => {
    const queue = initNudgeQueue();
    expect(queue.push(offer)).toBeTruthy();
    expect(queue.push(offer)).toBeNull();
    expect(queue.push({ ...offer, level: 1, text: 'Hint 2' }, { userInitiated: true })).toBeTruthy();
  });

  it('reads the hourly cap from settings', () => {
    setSetting('nudge.max_per_hour', 2);
    setSetting('nudge.cooldown_minutes', { distraction: 0, ai_tool: 0, stuck: 0, streak: 0, other: 0 });
    const queue = initNudgeQueue();
    const results = Array.from({ length: 10 }, (_, i) => queue.push({ kind: 'other', level: 1, text: `n${i}` }));
    expect(results.filter(Boolean)).toHaveLength(2);
  });

  it('drops everything while snoozed or paused; pause also blocks user-initiated', () => {
    const queue = initNudgeQueue();
    queue.snooze();
    expect(queue.push(offer)).toBeNull();
    expect(queue.push(offer, { userInitiated: true })).toBeTruthy();
    queue.pause();
    expect(queue.push(offer, { userInitiated: true })).toBeNull();
  });
});
