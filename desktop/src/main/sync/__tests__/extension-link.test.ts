import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import WebSocket from 'ws';
import type Database from 'better-sqlite3';
import type { ExtensionMessage, PageSummary, StruggleSignal } from '@wolfie/shared';
import { openDatabase, setDatabaseForTesting } from '../../db/index.js';
import { Monitor } from '../../monitor/monitor.js';
import type { WindowInfo, WindowSource } from '../../monitor/window-source.js';
import { getActiveSession, isPaused, sessionEvents, setActiveSession, setPaused, startSession } from '../../session/index.js';
import { settingsEvents } from '../../settings.js';
import { DomainTracker } from '../domain-tracker.js';
import { startExtensionLink, type ExtensionLink } from '../extension-link.js';
import { generateToken, normalizeToken, tokensMatch } from '../pairing.js';
import { stuckBus } from '../../stuck/bus.js';
import { SignalSink } from '../../stuck/signals/sink.js';

const EXT_A = 'chrome-extension://abcdefghijklmnopabcdefghijklmnop';
const EXT_B = 'chrome-extension://ponmlkjihgfedcbaponmlkjihgfedcba';

let db: Database.Database;
let link: ExtensionLink;
let monitor: Monitor;
let front: WindowInfo;
let settingsState: {
  token: string | null;
  extId: string | null;
  excluded: string[];
  capture: boolean;
};
let latest: PageSummary | null;
let problems: (string | null)[];
let signals: [StruggleSignal, string][];
let sockets: TestClient[] = [];

class TestClient {
  ws: WebSocket;
  inbox: ExtensionMessage[] = [];
  closed: Promise<number>;
  private waiters: Array<() => void> = [];

  constructor(port: number, origin: string | null = EXT_A) {
    this.ws = new WebSocket(`ws://127.0.0.1:${port}`, origin ? { origin } : {});
    this.ws.on('message', (d) => {
      this.inbox.push(JSON.parse(d.toString()));
      this.waiters.splice(0).forEach((w) => w());
    });
    this.closed = new Promise((resolve) => this.ws.on('close', (code) => resolve(code)));
    this.ws.on('error', () => undefined);
    sockets.push(this);
  }

  opened(): Promise<void> {
    return new Promise((resolve, reject) => {
      this.ws.once('open', () => resolve());
      this.ws.once('error', reject);
      this.ws.once('unexpected-response', (_req, res) => reject(new Error(`HTTP ${res.statusCode}`)));
    });
  }

  send(type: string, payload: unknown): void {
    this.ws.send(JSON.stringify({ id: Math.random().toString(36), type, ts: Date.now(), payload }));
  }

  async next(type: string, timeoutMs = 2000): Promise<ExtensionMessage> {
    const deadline = Date.now() + timeoutMs;
    for (;;) {
      const i = this.inbox.findIndex((m) => m.type === type);
      if (i >= 0) return this.inbox.splice(i, 1)[0];
      const left = deadline - Date.now();
      if (left <= 0) throw new Error(`timed out waiting for ${type}`);
      await new Promise<void>((resolve) => {
        const t = setTimeout(resolve, left);
        this.waiters.push(() => {
          clearTimeout(t);
          resolve();
        });
      });
    }
  }

  async hello(token: string): Promise<boolean> {
    await this.opened();
    this.send('ext.hello', { token, extensionVersion: '1.0.0' });
    const result = await this.next('desk.hello_result');
    return result.type === 'desk.hello_result' && result.payload.ok;
  }
}

const source: WindowSource = { getActiveWindow: async () => front };

async function boot(opts: { helloTimeoutMs?: number; heartbeatMs?: number; onSignal?: (s: StruggleSignal, d: string) => void } = {}): Promise<void> {
  const tracker = new DomainTracker();
  monitor = new Monitor({
    source,
    db: () => db,
    now: Date.now,
    getSession: getActiveSession,
    isPaused,
    getIdleSeconds: () => 0,
    getDomain: () => tracker.getDomain(),
    settings: { captureTitles: () => true, idleTimeoutSeconds: () => 60, autoStartApp: () => null },
    startSession: () => undefined
  });
  link = await startExtensionLink({
    tracker,
    port: 0,
    monitor,
    getSession: getActiveSession,
    isPaused,
    sessionEvents,
    settingsEvents,
    settings: {
      getToken: () => settingsState.token,
      setToken: (t) => (settingsState.token = t),
      getExtensionId: () => settingsState.extId,
      setExtensionId: (id) => (settingsState.extId = id),
      excludedDomains: () => settingsState.excluded,
      capturePageText: () => settingsState.capture
    },
    setLatestPageSummary: (s) => (latest = s),
    setPageSummaryRequester: () => undefined,
    emitProblemChanged: (id) => problems.push(id),
    onSignal: (s, d) => signals.push([s, d]),
    ...opts
  });
}

const summary = (over: Partial<PageSummary> = {}): PageSummary => ({
  url: 'http://localhost:5174/algebra.html',
  domain: 'localhost',
  title: 'Algebra',
  headings: [],
  visibleText: 'Solve for x',
  controls: [],
  errorMessages: [],
  openDialogs: [],
  timestamp: 1,
  ...over
});

const appRows = () =>
  db.prepare('SELECT app_name, url_domain FROM app_events ORDER BY id').all() as { app_name: string; url_domain: string | null }[];

beforeEach(() => {
  db = openDatabase(':memory:');
  setDatabaseForTesting(db);
  front = { appName: 'Google Chrome', windowTitle: 'Tab' };
  settingsState = { token: null, extId: null, excluded: ['chase.com'], capture: true };
  latest = null;
  problems = [];
  signals = [];
});

afterEach(async () => {
  for (const s of sockets) s.ws.terminate();
  sockets = [];
  await link?.stop();
  setPaused(false);
  setActiveSession(null);
  sessionEvents.removeAllListeners();
  setDatabaseForTesting(null);
  db.close();
});

/** Session running and Chrome frontmost, so the desktop says reporting: true. */
async function reportingSession(): Promise<void> {
  startSession();
  await monitor.tick();
}

describe('extension loopback server: auth', () => {
  it('generates a pairing token on first start and keeps it', async () => {
    await boot();
    const token = settingsState.token!;
    expect(token).toMatch(/^[A-Z2-9]{4}-[A-Z2-9]{4}-[A-Z2-9]{4}$/);
    expect(link.getExtensionPairingInfo()).toMatchObject({ token, extensionId: null, connected: false });
  });

  it('rejects a client with the wrong token', async () => {
    await boot();
    const c = new TestClient(link.port!);
    expect(await c.hello('WRONG-TOKEN-0000')).toBe(false);
    expect(await c.closed).toBe(1008);
    expect(settingsState.extId).toBeNull();
  });

  it('rejects a client that sends no token (anything but ext.hello first, or silence)', async () => {
    await boot({ helloTimeoutMs: 150 });
    const wrongFirst = new TestClient(link.port!);
    await wrongFirst.opened();
    wrongFirst.send('ext.tab', { domain: 'youtube.com' });
    expect(await wrongFirst.closed).toBe(1008);

    const silent = new TestClient(link.port!);
    await silent.opened();
    expect(await silent.closed).toBe(1008);
  });

  it('rejects a wrong or missing origin at the upgrade, before any message', async () => {
    await boot();
    await expect(new TestClient(link.port!, 'http://evil.example').opened()).rejects.toThrow('HTTP 403');
    await expect(new TestClient(link.port!, null).opened()).rejects.toThrow('HTTP 403');
    await expect(new TestClient(link.port!, 'chrome-extension://short').opened()).rejects.toThrow('HTTP 403');
  });

  it('trusts the first extension id on first use, then rejects other origins', async () => {
    await boot();
    const a = new TestClient(link.port!, EXT_A);
    expect(await a.hello(settingsState.token!)).toBe(true);
    expect(settingsState.extId).toBe('abcdefghijklmnopabcdefghijklmnop');
    expect(link.server.isConnected()).toBe(true);
    await expect(new TestClient(link.port!, EXT_B).opened()).rejects.toThrow('HTTP 403');
    const again = new TestClient(link.port!, EXT_A);
    expect(await again.hello(settingsState.token!.toLowerCase())).toBe(true); // case-insensitive token
  });

  it('regenerating the token drops clients and forgets the trusted id', async () => {
    await boot();
    const a = new TestClient(link.port!);
    const old = settingsState.token!;
    await a.hello(old);
    const info = link.regenerateToken();
    expect(info.token).not.toBe(old);
    expect(settingsState.extId).toBeNull();
    await a.closed;
    const b = new TestClient(link.port!, EXT_B);
    expect(await b.hello(old)).toBe(false);
  });

  it('ignores malformed messages after auth without dropping the connection', async () => {
    await boot();
    const c = new TestClient(link.port!);
    await c.hello(settingsState.token!);
    c.ws.send('not json');
    c.ws.send(JSON.stringify({ type: 'ext.tab', payload: {} }));
    await reportingSession();
    c.send('ext.tab', { domain: 'youtube.com' });
    await new Promise((r) => setTimeout(r, 50));
    expect(link.tracker.getDomain()).toBe('youtube.com');
  });
});

describe('extension loopback server: reporting', () => {
  it("a valid client's domain lands in app_events.url_domain", async () => {
    await boot();
    await reportingSession();
    const c = new TestClient(link.port!);
    await c.hello(settingsState.token!);
    const state = await c.next('desk.state');
    expect(state.type === 'desk.state' && state.payload.reporting).toBe(true);

    c.send('ext.tab', { domain: 'youtube.com', title: 'Lo-fi' });
    await new Promise((r) => setTimeout(r, 100)); // tracker -> monitor.poke
    expect(appRows().at(-1)).toEqual({ app_name: 'Google Chrome', url_domain: 'youtube.com' });
  });

  it('drops reports while not reporting, and for excluded domains', async () => {
    await boot();
    const c = new TestClient(link.port!);
    await c.hello(settingsState.token!);
    c.send('ext.tab', { domain: 'youtube.com' }); // no session yet
    await new Promise((r) => setTimeout(r, 50));
    expect(link.tracker.getDomain()).toBeNull();

    await reportingSession();
    c.send('ext.tab', { domain: 'secure.chase.com' });
    await new Promise((r) => setTimeout(r, 50));
    expect(link.tracker.getDomain()).toBeNull();
    c.send('ext.tab', { domain: 'wikipedia.org' });
    await new Promise((r) => setTimeout(r, 50));
    expect(link.tracker.getDomain()).toBe('wikipedia.org');
  });

  it('sends desk.state on session, pause, frontmost-app and settings changes', async () => {
    await boot();
    const c = new TestClient(link.port!);
    await c.hello(settingsState.token!);
    const first = await c.next('desk.state');
    expect(first.type === 'desk.state' && first.payload).toMatchObject({ reporting: false, paused: false, excludedDomains: ['chase.com'] });

    await reportingSession();
    const started = await c.next('desk.state');
    expect(started.type === 'desk.state' && started.payload.reporting).toBe(true);

    setPaused(true);
    const pausedState = await c.next('desk.state');
    expect(pausedState.type === 'desk.state' && pausedState.payload).toMatchObject({ reporting: false, paused: true });
    setPaused(false);
    await c.next('desk.state');

    front = { appName: 'Xcode', windowTitle: null };
    await monitor.tick();
    const away = await c.next('desk.state');
    expect(away.type === 'desk.state' && away.payload.reporting).toBe(false);

    front = { appName: 'Google Chrome', windowTitle: null };
    await monitor.tick();
    await c.next('desk.state');

    settingsState.capture = false;
    settingsEvents.emit('change', 'monitoring.capture_page_text', false);
    const noText = await c.next('desk.state');
    expect(noText.type === 'desk.state' && noText.payload.capturePageText).toBe(false);
  });

  it('forgets the page and domain when the browser loses focus', async () => {
    await boot();
    await reportingSession();
    const c = new TestClient(link.port!);
    await c.hello(settingsState.token!);
    c.send('ext.tab', { domain: 'localhost' });
    c.send('ext.page_summary', { summary: summary() });
    await new Promise((r) => setTimeout(r, 80));
    expect(latest).not.toBeNull();
    front = { appName: 'Xcode', windowTitle: null };
    await monitor.tick();
    expect(latest).toBeNull();
    expect(link.tracker.getDomain()).toBeNull();
  });

  it('stores summaries and emits problem-changed only when problemId changes', async () => {
    await boot();
    await reportingSession();
    const c = new TestClient(link.port!);
    await c.hello(settingsState.token!);
    const send = async (s: PageSummary) => {
      c.send('ext.page_summary', { summary: s });
      await new Promise((r) => setTimeout(r, 40));
    };
    await send(summary({ problemId: 'demo-algebra-problem' }));
    await send(summary({ problemId: 'demo-algebra-problem', visibleText: 'changed' })); // same problem
    await send(summary({ url: 'http://localhost/other', title: 'Other' })); // URL change, no problemId
    await send(summary({ problemId: 'demo-algebra-problem' })); // back, still the same problem
    await send(summary({ problemId: 'demo-code-error' }));
    expect(problems).toEqual(['demo-algebra-problem', 'demo-code-error']);
    expect(latest?.problemId).toBe('demo-code-error');
  });

  it('a new session counts its first problem as a change again', async () => {
    await boot();
    await reportingSession();
    const c = new TestClient(link.port!);
    await c.hello(settingsState.token!);
    c.send('ext.page_summary', { summary: summary({ problemId: 'p1' }) });
    await new Promise((r) => setTimeout(r, 40));
    setActiveSession(null);
    await reportingSession();
    c.send('ext.page_summary', { summary: summary({ problemId: 'p1' }) });
    await new Promise((r) => setTimeout(r, 40));
    expect(problems).toEqual(['p1', 'p1']);
  });

  it('domain-only mode: page summaries are dropped when capturePageText is off', async () => {
    settingsState.capture = false;
    await boot();
    await reportingSession();
    const c = new TestClient(link.port!);
    await c.hello(settingsState.token!);
    c.send('ext.page_summary', { summary: summary({ problemId: 'p1' }) });
    c.send('ext.tab', { domain: 'localhost' });
    await new Promise((r) => setTimeout(r, 60));
    expect(latest).toBeNull();
    expect(problems).toEqual([]);
    expect(link.tracker.getDomain()).toBe('localhost'); // the domain still flows
  });

  it('forwards extension signals while reporting', async () => {
    await boot();
    await reportingSession();
    const c = new TestClient(link.port!);
    await c.hello(settingsState.token!);
    const signal: StruggleSignal = { type: 'wrong_answer_loop', strength: 'strong', timestamp: 5, problemId: 'p1' };
    c.send('ext.signal', { signal, domain: 'localhost' });
    c.send('ext.signal', { signal, domain: 'chase.com' }); // excluded: dropped
    await new Promise((r) => setTimeout(r, 60));
    expect(signals).toEqual([[signal, 'localhost']]);
  });

  it("an extension signal reaches stuckBus 'signal' and web_signals through the sink", async () => {
    const sink = new SignalSink({
      db: () => db,
      getSession: getActiveSession,
      isPaused,
      emit: (s) => stuckBus.emit('signal', s),
      logEvent: () => undefined,
      now: Date.now
    });
    await boot({ onSignal: (s) => void sink.accept(s, 'extension') });
    await reportingSession();
    const onBus: StruggleSignal[] = [];
    const off = stuckBus.on('signal', (s) => onBus.push(s));
    const c = new TestClient(link.port!);
    await c.hello(settingsState.token!);
    const signal: StruggleSignal = { type: 'dead_control_clicks', strength: 'strong', timestamp: 7, problemId: 'demo-disabled-button', metadata: { clicks: 3 } };
    c.send('ext.signal', { signal, domain: 'localhost' });
    await new Promise((r) => setTimeout(r, 60));
    off();
    expect(onBus).toEqual([signal]);
    expect(db.prepare('SELECT type, strength FROM web_signals').all()).toEqual([{ type: 'dead_control_clicks', strength: 'strong' }]);
  });

  it('requestSummary asks the extension and resolves with the next page summary', async () => {
    await boot();
    await reportingSession();
    const c = new TestClient(link.port!);
    await c.hello(settingsState.token!);
    const pending = link.server.requestSummary(2000);
    const req = await c.next('desk.request_summary');
    expect(req.type === 'desk.request_summary' && req.payload.requestId).toBeTruthy();
    c.send('ext.page_summary', { summary: summary({ title: 'Fresh' }) });
    expect((await pending)?.title).toBe('Fresh');
  });

  it('requestSummary resolves null with no client or on timeout', async () => {
    await boot();
    expect(await link.server.requestSummary(50)).toBeNull();
    await reportingSession();
    const c = new TestClient(link.port!);
    await c.hello(settingsState.token!);
    expect(await link.server.requestSummary(50)).toBeNull();
  });

  it('heartbeat re-sends desk.state so the MV3 worker sees traffic', async () => {
    await boot({ heartbeatMs: 40 });
    const c = new TestClient(link.port!);
    await c.hello(settingsState.token!);
    await c.next('desk.state');
    await c.next('desk.state'); // second one is the heartbeat
  });
});

describe('pairing token helpers', () => {
  it('generates, normalizes and compares in a friendly way', () => {
    const t = generateToken();
    expect(tokensMatch(t, t.toLowerCase().replace(/-/g, ' '))).toBe(true);
    expect(tokensMatch(t, 'AAAA-AAAA-AAAA')).toBe(false);
    expect(tokensMatch(null, t)).toBe(false);
    expect(normalizeToken(' ab-cd ')).toBe('ABCD');
  });
});
