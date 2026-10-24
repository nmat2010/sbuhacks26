import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type Database from 'better-sqlite3';
import type { StruggleSignal } from '@wolfie/shared';
import { openDatabase, setDatabaseForTesting } from '../../../db/index.js';
import type { ForegroundSnapshot } from '../../../monitor/monitor.js';
import { getActiveSession, isPaused, setActiveSession, setPaused, startSession } from '../../../session/index.js';
import { stuckBus } from '../../bus.js';
import { DesktopSignalDetector, windowKey, type SignalConfig, type WindowClass } from '../desktop-signals.js';
import { InputPoller } from '../input-poller.js';
import { sanitizeMetadata, SignalSink } from '../sink.js';

const cfg: SignalConfig = { contextSwitchCount: 3, contextSwitchWindowSec: 120, idleMinutes: 4, longProblemMinutes: 12 };

let now: number;
let emitted: StruggleSignal[];
let detector: DesktopSignalDetector;

const snap = (over: Partial<ForegroundSnapshot> = {}): ForegroundSnapshot => ({
  sessionId: 's1',
  ts: now,
  appName: 'Xcode',
  windowTitle: null,
  domain: null,
  isBrowser: false,
  isIdle: false,
  idleSeconds: 0,
  ...over
});
const code = () => snap();
const chrome = (domain: string, over: Partial<ForegroundSnapshot> = {}) => snap({ appName: 'Google Chrome', isBrowser: true, domain, ...over });

const classify = (s: ForegroundSnapshot): WindowClass => (s.domain === 'youtube.com' || s.domain === 'netflix.com' ? 'other' : 'work');

beforeEach(() => {
  now = 1_000_000;
  emitted = [];
  detector = new DesktopSignalDetector({ now: () => now, emit: (s) => emitted.push(s), getConfig: () => cfg, classify });
});

describe('context_switch_loop', () => {
  const go = (s: ForegroundSnapshot, dt = 10_000) => {
    now += dt;
    detector.handleForeground(s);
  };

  it('fires (weak) on the 3rd rapid switch between a work window and the same other window', () => {
    go(code(), 0);
    go(chrome('youtube.com'));
    go(code());
    expect(emitted).toEqual([]);
    go(chrome('youtube.com'));
    expect(emitted).toHaveLength(1);
    expect(emitted[0]).toMatchObject({ type: 'context_switch_loop', strength: 'weak', metadata: { switches: 3 } });
  });

  it('does not fire when slow, with a third window in the mix, or between two non-work windows', () => {
    go(code(), 0);
    for (const s of [chrome('youtube.com'), code(), chrome('youtube.com'), code()]) go(s, 50_000);
    expect(emitted).toEqual([]); // 3 switches took 150+ s: the early ones fell out of the window

    detector.reset();
    go(code(), 0);
    go(chrome('youtube.com'));
    go(code());
    go(chrome('netflix.com'));
    go(code());
    expect(emitted).toEqual([]);

    detector.reset();
    go(chrome('youtube.com'), 0);
    go(chrome('netflix.com'));
    go(chrome('youtube.com'));
    go(chrome('netflix.com'));
    expect(emitted).toEqual([]);
  });

  it('ignores title and idle changes inside one window', () => {
    go(code(), 0);
    go(snap({ windowTitle: 'a.swift' }));
    go(snap({ windowTitle: 'b.swift', isIdle: true }));
    go(chrome('youtube.com'));
    go(snap({ windowTitle: 'c.swift' }));
    expect(emitted).toEqual([]);
  });

  it('tells tabs apart by domain and other apps by name', () => {
    expect(windowKey(chrome('A.com'))).toBe('web:a.com');
    expect(windowKey(chrome('')).startsWith('app:')).toBe(true);
    expect(windowKey(snap({ appName: 'Xcode' }))).toBe('app:xcode');
  });
});

describe('idle_on_work', () => {
  const tick = (s: ForegroundSnapshot, dt = 2000) => {
    now += dt;
    detector.handleTick(s);
  };

  it('fires (weak) after N minutes without input on a work window, then re-emits each minute', () => {
    tick(code(), 0);
    tick(snap({ idleSeconds: 239 }));
    expect(emitted).toEqual([]);
    tick(snap({ idleSeconds: 240 }));
    expect(emitted).toHaveLength(1);
    expect(emitted[0]).toMatchObject({ type: 'idle_on_work', strength: 'weak', metadata: { idleSeconds: 240 } });
    tick(snap({ idleSeconds: 250 }), 30_000);
    expect(emitted).toHaveLength(1);
    tick(snap({ idleSeconds: 290 }), 40_000);
    expect(emitted).toHaveLength(2);
  });

  it('does not fire on AI-tool or distraction windows (they have their own warnings)', () => {
    tick(chrome('youtube.com', { idleSeconds: 600 }));
    expect(emitted).toEqual([]);
  });
});

describe('long_on_problem', () => {
  const tick = (s: ForegroundSnapshot, dt = 2000) => {
    now += dt;
    detector.handleTick(s);
  };
  const focus = (minutes: number, s = chrome('localhost')) => {
    for (let i = 0; i < minutes * 30; i++) tick(s);
  };

  it('fires (weak) after N focused minutes on the problem page, with the problem id', () => {
    detector.handleProblem('demo-algebra-problem', chrome('localhost'));
    tick(chrome('localhost'), 0);
    focus(11);
    expect(emitted.filter((s) => s.type === 'long_on_problem')).toEqual([]);
    focus(1.1);
    const long = emitted.filter((s) => s.type === 'long_on_problem');
    expect(long).toHaveLength(1);
    expect(long[0]).toMatchObject({ strength: 'weak', problemId: 'demo-algebra-problem' });
  });

  it('only counts focused, non-idle time on the problem page', () => {
    detector.handleProblem('p', chrome('localhost'));
    tick(chrome('localhost'), 0);
    focus(8);
    focus(6, code()); // away in another app
    focus(6, chrome('localhost', { isIdle: true, idleSeconds: 70 })); // idle
    tick(chrome('localhost'), 600_000); // a long gap (sleep / pause) is not focus time
    focus(3);
    expect(emitted.filter((s) => s.type === 'long_on_problem')).toEqual([]);
  });

  it('a new problem restarts the clock', () => {
    detector.handleProblem('p1', chrome('localhost'));
    tick(chrome('localhost'), 0);
    focus(10);
    detector.handleProblem('p2', chrome('localhost'));
    focus(10);
    expect(emitted.filter((s) => s.type === 'long_on_problem')).toEqual([]);
    focus(3);
    expect(emitted.filter((s) => s.type === 'long_on_problem')[0]).toMatchObject({ problemId: 'p2' });
  });

  it('reset() forgets the problem', () => {
    detector.handleProblem('p1', chrome('localhost'));
    detector.reset();
    tick(chrome('localhost'), 0);
    focus(20);
    expect(emitted).toEqual([]);
  });
});

describe('InputPoller', () => {
  it('emits input only when the system was used in the last second, and only while active', () => {
    let idle = 5;
    let active = true;
    const out: number[] = [];
    const poller = new InputPoller({ getIdleSeconds: () => idle, isActive: () => active, now: () => 42, emit: (at) => out.push(at) });
    poller.tick();
    expect(out).toEqual([]);
    idle = 0;
    poller.tick();
    expect(out).toEqual([42]);
    active = false;
    poller.tick();
    expect(out).toEqual([42]);
    active = true;
    idle = 1;
    poller.tick();
    expect(out).toEqual([42]);
  });

  it('survives a failing idle read', () => {
    const poller = new InputPoller({
      getIdleSeconds: () => {
        throw new Error('no powerMonitor');
      },
      isActive: () => true,
      now: () => 1,
      emit: () => {
        throw new Error('should not emit');
      }
    });
    expect(() => poller.tick()).not.toThrow();
  });
});

describe('SignalSink', () => {
  let db: Database.Database;
  let busSignals: StruggleSignal[];
  let events: [string, Record<string, unknown>][];
  let sink: SignalSink;
  let off: () => void;

  beforeEach(() => {
    db = openDatabase(':memory:');
    setDatabaseForTesting(db);
    busSignals = [];
    events = [];
    off = stuckBus.on('signal', (s) => busSignals.push(s));
    sink = new SignalSink({
      db: () => db,
      getSession: getActiveSession,
      isPaused,
      emit: (s) => stuckBus.emit('signal', s),
      logEvent: (type, payload) => events.push([type, payload]),
      now: () => 5
    });
  });

  afterEach(() => {
    off();
    setPaused(false);
    setActiveSession(null);
    setDatabaseForTesting(null);
    db.close();
  });

  const signal: StruggleSignal = { type: 'wrong_answer_loop', strength: 'strong', timestamp: 1234, problemId: 'p1', metadata: { attempts: 2 } };

  it('stores the signal in web_signals, logs it, and puts it on the stuck bus', () => {
    const session = startSession();
    expect(sink.accept(signal, 'extension')).toBe(true);
    expect(busSignals).toEqual([signal]);
    const row = db.prepare('SELECT session_id, ts, type, strength, meta_json FROM web_signals').get() as Record<string, unknown>;
    expect(row).toMatchObject({ session_id: session.id, ts: 1234, type: 'wrong_answer_loop', strength: 'strong' });
    expect(JSON.parse(row.meta_json as string)).toEqual({ attempts: 2, source: 'extension', problemId: 'p1' });
    expect(events).toEqual([['stuck.signal', { type: 'wrong_answer_loop', strength: 'strong', source: 'extension', problemId: 'p1' }]]);
  });

  it('drops signals outside a session and while paused', () => {
    expect(sink.accept(signal, 'extension')).toBe(false);
    startSession();
    setPaused(true);
    expect(sink.accept(signal, 'desktop')).toBe(false);
    expect(busSignals).toEqual([]);
    expect(db.prepare('SELECT COUNT(*) AS n FROM web_signals').get()).toEqual({ n: 0 });
  });

  it('keeps only small primitive metadata (no page text)', () => {
    expect(sanitizeMetadata({ a: 1, b: true, c: 'x'.repeat(200), d: { nested: 'obj' }, e: ['arr'] })).toEqual({
      a: 1,
      b: true,
      c: 'x'.repeat(64)
    });
    startSession();
    sink.accept({ ...signal, metadata: { dump: 'y'.repeat(5000), obj: { t: 'secret text' } } }, 'extension');
    const meta = (db.prepare('SELECT meta_json FROM web_signals').get() as { meta_json: string }).meta_json;
    expect(meta.length).toBeLessThan(200);
    expect(meta).not.toContain('secret text');
  });

  it('stores desktop signals too, tagged with their source', () => {
    startSession();
    sink.accept({ type: 'idle_on_work', strength: 'weak', timestamp: 9 }, 'desktop');
    const meta = JSON.parse((db.prepare('SELECT meta_json FROM web_signals').get() as { meta_json: string }).meta_json);
    expect(meta.source).toBe('desktop');
  });
});
