import { beforeEach, describe, expect, it } from 'vitest';
import { DesktopConnection, type DeskStatePayload, type SocketLike } from '../connection';

class FakeSocket implements SocketLike {
  readyState = 0;
  sent: { type: string; payload: unknown }[] = [];
  closed = false;
  onopen: (() => void) | null = null;
  onclose: (() => void) | null = null;
  onerror: (() => void) | null = null;
  onmessage: ((event: { data: unknown }) => void) | null = null;
  send(data: string) {
    this.sent.push(JSON.parse(data));
  }
  close() {
    this.closed = true;
    this.readyState = 3;
  }
  open() {
    this.readyState = 1;
    this.onopen?.();
  }
  drop() {
    this.readyState = 3;
    this.onclose?.();
  }
  receive(type: string, payload: unknown) {
    this.onmessage?.({ data: JSON.stringify({ id: 'd1', type, ts: 1, payload }) });
  }
}

let sockets: FakeSocket[];
let timers: { fn: () => void; ms: number; id: number }[];
let token: string | null;
let states: DeskStatePayload[];
let summaryRequests: string[];
let statusCalls: number;
let conn: DesktopConnection;

beforeEach(() => {
  sockets = [];
  timers = [];
  token = 'TOK';
  states = [];
  summaryRequests = [];
  statusCalls = 0;
  let nextTimer = 1;
  conn = new DesktopConnection({
    url: 'ws://127.0.0.1:1',
    createSocket: () => {
      const s = new FakeSocket();
      sockets.push(s);
      return s;
    },
    getToken: () => token,
    extensionVersion: '1.2.3',
    newId: () => 'id',
    now: () => 42,
    setTimer: (fn, ms) => {
      const id = nextTimer++;
      timers.push({ fn, ms, id });
      return id;
    },
    clearTimer: (h) => {
      timers = timers.filter((t) => t.id !== h);
    },
    random: () => 0,
    onDeskState: (s) => states.push(s),
    onRequestSummary: (id) => summaryRequests.push(id),
    onStatus: () => statusCalls++
  });
});

const helloOk = (s: FakeSocket) => s.receive('desk.hello_result', { ok: true });

describe('DesktopConnection', () => {
  it('does not connect without a token', () => {
    token = null;
    conn.connect();
    expect(sockets).toHaveLength(0);
  });

  it('sends the token in the first message, never in the URL', () => {
    conn.connect();
    sockets[0].open();
    expect(sockets[0].sent[0]).toEqual({
      id: 'id',
      type: 'ext.hello',
      ts: 42,
      payload: { token: 'TOK', extensionVersion: '1.2.3' }
    });
    expect(conn.connected).toBe(false);
    helloOk(sockets[0]);
    expect(conn.connected).toBe(true);
  });

  it('is idempotent while a socket exists', () => {
    conn.connect();
    conn.connect();
    expect(sockets).toHaveLength(1);
  });

  it('reconnects with exponential backoff and resets after a successful hello', () => {
    conn.connect();
    sockets[0].drop();
    expect(timers.map((t) => t.ms)).toEqual([1000]);
    timers[0].fn();
    sockets[1].drop();
    expect(timers.map((t) => t.ms)).toEqual([1000, 2000]);
    timers[1].fn();
    sockets[2].open();
    helloOk(sockets[2]);
    sockets[2].drop();
    expect(timers.at(-1)?.ms).toBe(1000); // attempt counter reset
    expect(conn.connected).toBe(false);
  });

  it('does not reconnect after the desktop rejects the token, until the token changes', () => {
    conn.connect();
    sockets[0].open();
    sockets[0].receive('desk.hello_result', { ok: false, reason: 'invalid token' });
    sockets[0].drop();
    expect(timers).toHaveLength(0);
    conn.connect(); // e.g. the keep-alive alarm
    expect(sockets).toHaveLength(1);
    token = 'NEW';
    conn.restart();
    expect(sockets).toHaveLength(2);
  });

  it('disconnect stops reconnecting', () => {
    conn.connect();
    conn.disconnect();
    expect(sockets[0].closed).toBe(true);
    expect(timers).toHaveLength(0);
  });

  it('passes desk.state and summary requests through and ignores junk', () => {
    conn.connect();
    sockets[0].open();
    const state = { reporting: true, paused: false, capturePageText: true, excludedDomains: ['chase.com'] };
    sockets[0].receive('desk.state', state);
    sockets[0].receive('desk.request_summary', { requestId: 'r1' });
    sockets[0].onmessage?.({ data: 'garbage' });
    sockets[0].receive('desk.state', { reporting: 'yes' });
    expect(states).toEqual([state]);
    expect(summaryRequests).toEqual(['r1']);
  });

  it('send returns false when the socket is not open', () => {
    expect(conn.send('ext.tab', { domain: 'a.com' })).toBe(false);
    conn.connect();
    expect(conn.send('ext.tab', { domain: 'a.com' })).toBe(false);
    sockets[0].open();
    expect(conn.send('ext.tab', { domain: 'a.com' })).toBe(true);
  });

  it('notifies status on connect and disconnect', () => {
    conn.connect();
    sockets[0].open();
    helloOk(sockets[0]);
    expect(statusCalls).toBe(1);
    sockets[0].drop();
    expect(statusCalls).toBe(2);
  });
});
