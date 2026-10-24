import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type Database from 'better-sqlite3';
import { openDatabase, setDatabaseForTesting } from '../../db/index.js';
import { getActiveSession, isPaused, setActiveSession, setPaused, startSession, stopSession } from '../../session/index.js';
import { Monitor, PAUSED_APP, type MonitorDeps } from '../monitor.js';
import { WindowSourceError, type WindowInfo, type WindowSource } from '../window-source.js';

let db: Database.Database;
let clock: number;
let front: WindowInfo | Error | null;
let idle: number;
let domain: string | null;
let titleRequests: boolean[];
let autoStartApp: string | null;
let captureTitles: boolean;

const source: WindowSource = {
  async getActiveWindow({ includeTitle }) {
    titleRequests.push(includeTitle);
    if (front instanceof Error) throw front;
    return front;
  }
};

function makeMonitor(overrides: Partial<MonitorDeps> = {}): Monitor {
  return new Monitor({
    source,
    db: () => db,
    now: () => clock,
    getSession: getActiveSession,
    isPaused,
    getIdleSeconds: () => idle,
    getDomain: () => domain,
    settings: {
      captureTitles: () => captureTitles,
      idleTimeoutSeconds: () => 60,
      autoStartApp: () => autoStartApp
    },
    startSession: () => void startSession(),
    ...overrides
  });
}

const win = (appName: string, windowTitle: string | null = null): WindowInfo => ({ appName, windowTitle });

const rows = () =>
  db
    .prepare('SELECT ts, app_name, window_title, url_domain, is_idle FROM app_events ORDER BY id')
    .all() as { ts: number; app_name: string; window_title: string | null; url_domain: string | null; is_idle: number }[];

beforeEach(() => {
  db = openDatabase(':memory:');
  setDatabaseForTesting(db);
  clock = 1_000_000;
  front = win('Xcode', 'main.swift');
  idle = 0;
  domain = null;
  titleRequests = [];
  autoStartApp = null;
  captureTitles = true;
});

afterEach(() => {
  setPaused(false);
  setActiveSession(null);
  setDatabaseForTesting(null);
  db.close();
});

describe('Monitor app_events', () => {
  it('turns a simulated window stream into change-only rows with domains and idle flags', async () => {
    startSession();
    const m = makeMonitor();
    const step = async (ms: number, w: WindowInfo, opts: { idle?: number; domain?: string | null } = {}) => {
      clock += ms;
      front = w;
      idle = opts.idle ?? 0;
      domain = opts.domain ?? null;
      await m.tick();
    };

    await m.tick(); // t0: Xcode
    await step(2000, win('Xcode', 'main.swift')); // unchanged: no row
    await step(2000, win('Xcode', 'App.swift')); // title change
    await step(2000, win('Google Chrome', 'Docs'), { domain: 'docs.google.com' });
    await step(2000, win('Google Chrome', 'Docs'), { domain: 'docs.google.com' }); // unchanged
    await step(2000, win('Google Chrome', 'YouTube'), { domain: 'youtube.com' }); // tab change
    await step(2000, win('Google Chrome', 'YouTube'), { domain: 'youtube.com', idle: 75 }); // went idle
    await step(2000, win('Google Chrome', 'YouTube'), { domain: 'youtube.com', idle: 80 }); // still idle
    await step(2000, win('Google Chrome', 'YouTube'), { domain: 'youtube.com', idle: 0 }); // back

    expect(rows().map((r) => [r.app_name, r.window_title, r.url_domain, r.is_idle])).toEqual([
      ['Xcode', 'main.swift', null, 0],
      ['Xcode', 'App.swift', null, 0],
      ['Google Chrome', 'Docs', 'docs.google.com', 0],
      ['Google Chrome', 'YouTube', 'youtube.com', 0],
      ['Google Chrome', 'YouTube', 'youtube.com', 1],
      ['Google Chrome', 'YouTube', 'youtube.com', 0]
    ]);
    expect(rows()[0].ts).toBe(1_000_000);
    expect(rows()[2].ts).toBe(1_006_000);
  });

  it('closes a gap between polls (the Mac slept) as idle instead of counting it as work', async () => {
    startSession();
    const m = makeMonitor();
    await m.tick();
    clock += 2000;
    await m.tick(); // normal poll: no row
    clock += 20 * 60_000; // lid closed for 20 minutes
    await m.tick();
    expect(rows().map((r) => [r.ts - 1_000_000, r.app_name, r.is_idle])).toEqual([
      [0, 'Xcode', 0],
      [3000, 'Xcode', 1], // idle starts just after the last poll that saw the user
      [2000 + 20 * 60_000, 'Xcode', 0]
    ]);
  });

  it('does not mistake a long pause for sleep', async () => {
    startSession();
    const m = makeMonitor();
    await m.tick();
    setPaused(true);
    await m.tick();
    clock += 60 * 60_000;
    setPaused(false);
    await m.tick();
    expect(rows().map((r) => [r.app_name, r.is_idle])).toEqual([
      ['Xcode', 0],
      [PAUSED_APP, 0],
      ['Xcode', 0]
    ]);
  });

  it('attaches a domain only while a browser is frontmost', async () => {
    startSession();
    const m = makeMonitor();
    domain = 'youtube.com';
    front = win('Notes', 'todo');
    await m.tick();
    expect(rows()[0].url_domain).toBeNull();
  });

  it('writes nothing without a session', async () => {
    const m = makeMonitor();
    await m.tick();
    expect(rows()).toEqual([]);
    expect(titleRequests).toEqual([]); // not even polling the window
  });

  it('stores app name only when title capture is off, and does not ask for titles', async () => {
    captureTitles = false;
    startSession();
    const m = makeMonitor();
    await m.tick();
    expect(rows()).toEqual([expect.objectContaining({ app_name: 'Xcode', window_title: null })]);
    expect(titleRequests).toEqual([false]);
  });

  it('writes a paused marker once, nothing while paused, and a fresh row after resume', async () => {
    startSession();
    const m = makeMonitor();
    await m.tick();
    setPaused(true);
    clock += 5000;
    await m.tick();
    clock += 5000;
    await m.tick();
    setPaused(false);
    clock += 5000;
    await m.tick();
    expect(rows().map((r) => r.app_name)).toEqual(['Xcode', PAUSED_APP, 'Xcode']);
  });

  it('starts fresh rows for a new session even if the window did not change', async () => {
    startSession();
    const m = makeMonitor();
    await m.tick();
    stopSession();
    await m.tick();
    startSession();
    await m.tick();
    const perSession = db.prepare('SELECT session_id, COUNT(*) AS n FROM app_events GROUP BY session_id').all();
    expect(perSession).toHaveLength(2);
  });

  it("skips Wolfie's own windows: no row, no foreground event, previous app keeps the time", async () => {
    startSession();
    const m = makeMonitor({ isSelf: (info) => info.pid === 4242 });
    const foreground: string[] = [];
    m.events.on('foreground', (snap) => foreground.push(snap.appName));
    front = { appName: 'Google Chrome', windowTitle: null, pid: 100 };
    await m.tick();
    clock += 2000;
    front = { appName: 'Electron', windowTitle: 'Wolfie Overlay', pid: 4242 };
    await m.tick();
    clock += 2000;
    front = { appName: 'Google Chrome', windowTitle: null, pid: 100 };
    await m.tick();
    expect(rows().map((r) => r.app_name)).toEqual(['Google Chrome']);
    expect(foreground).toEqual(['Google Chrome']);
  });

  it('a long stretch on Wolfie itself is not mistaken for sleep', async () => {
    startSession();
    const m = makeMonitor({ isSelf: (info) => info.pid === 4242 });
    front = win('Xcode');
    await m.tick();
    for (let i = 0; i < 30; i++) {
      clock += 2000;
      front = { appName: 'Electron', windowTitle: 'Wolfie Overlay', pid: 4242 };
      await m.tick();
    }
    clock += 2000;
    front = win('Xcode');
    await m.tick();
    expect(rows().map((r) => [r.app_name, r.is_idle])).toEqual([['Xcode', 0]]);
  });

  it('emits foreground only on change and tick every poll', async () => {
    startSession();
    const m = makeMonitor();
    let fg = 0;
    let ticks = 0;
    m.events.on('foreground', () => fg++);
    m.events.on('tick', () => ticks++);
    await m.tick();
    await m.tick();
    expect([fg, ticks]).toEqual([1, 2]);
  });

  it('a denied Automation permission is a status, not a crash', async () => {
    startSession();
    const m = makeMonitor();
    const seen: string[] = [];
    m.events.on('permission', (s) => seen.push(s));
    expect(m.getAutomationState()).toBe('unknown');
    front = new WindowSourceError('automation_denied', 'denied');
    await expect(m.tick()).resolves.toBeUndefined();
    expect(m.getAutomationState()).toBe('denied');
    expect(rows()).toEqual([]);
    front = win('Xcode');
    await m.tick();
    expect(m.getAutomationState()).toBe('granted');
    expect(seen).toEqual(['denied', 'granted']);
  });

  it('survives an unexpected source failure', async () => {
    startSession();
    const m = makeMonitor();
    front = new Error('boom');
    await expect(m.tick()).resolves.toBeUndefined();
    expect(rows()).toEqual([]);
  });

  it('does not write if the session ended while the window was being read', async () => {
    startSession();
    const slow: WindowSource = {
      async getActiveWindow() {
        stopSession();
        return win('Xcode');
      }
    };
    const m = makeMonitor({ source: slow });
    await m.tick();
    expect(rows()).toEqual([]);
  });
});

describe('Monitor auto-start', () => {
  it('starts a session when the study app comes to the front, but not again after a manual stop', async () => {
    autoStartApp = 'Notion';
    const m = makeMonitor();
    front = win('Safari');
    await m.tick();
    expect(getActiveSession()).toBeNull();

    front = win('Notion', 'Notes');
    await m.tick();
    expect(getActiveSession()).not.toBeNull();
    expect(rows().map((r) => r.app_name)).toEqual(['Notion']);

    stopSession();
    await m.tick(); // Notion still frontmost: must stay stopped
    expect(getActiveSession()).toBeNull();

    front = win('Safari');
    await m.tick();
    front = win('Notion');
    await m.tick();
    expect(getActiveSession()).not.toBeNull();
  });

  it('does not auto-start while paused', async () => {
    autoStartApp = 'Notion';
    setPaused(true);
    front = win('Notion');
    await makeMonitor().tick();
    expect(getActiveSession()).toBeNull();
  });
});
