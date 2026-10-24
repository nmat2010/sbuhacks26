import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import WebSocket from 'ws';
import type Database from 'better-sqlite3';
import type { NetworkInterfaceInfo } from 'os';
import { SyncMessageSchema, type PairedDeviceType, type SyncMessage } from '@wolfie/shared';
import { openDatabase, setDatabaseForTesting } from '../../db/index.js';
import { logEvent } from '../../events.js';
import { MockLLMProvider } from '../../llm/mock-provider.js';
import { computeHmac, lanAddresses, verifyHmac } from '../lan-auth.js';
import { startLanLink, type LanLink } from '../lan-link.js';
import { PairingCode } from '../pairing-code.js';
import { hasSeen, pruneSeen } from '../lan-store.js';

let db: Database.Database;
let clock: number;
let devices: PairedDeviceType[];
let link: LanLink;
let clients: WebClient[] = [];
let ended: { sessionId: string; startedAt: number; endedAt: number }[];
let followupMode: 'ok' | 'fail';

class WebClient {
  ws: WebSocket;
  inbox: SyncMessage[] = [];
  closed: Promise<number>;
  private waiters: Array<() => void> = [];
  private n = 0;

  constructor(port: number) {
    this.ws = new WebSocket(`ws://127.0.0.1:${port}`);
    this.ws.on('message', (d) => {
      const parsed = SyncMessageSchema.safeParse(JSON.parse(d.toString()));
      if (!parsed.success) throw new Error(`server sent an invalid message: ${d.toString()}`);
      this.inbox.push(parsed.data);
      this.waiters.splice(0).forEach((w) => w());
    });
    this.closed = new Promise((resolve) => this.ws.on('close', (code) => resolve(code)));
    this.ws.on('error', () => undefined);
    clients.push(this);
  }

  async next<T extends SyncMessage['type']>(type: T, timeoutMs = 3000): Promise<Extract<SyncMessage, { type: T }>> {
    const deadline = Date.now() + timeoutMs;
    for (;;) {
      const i = this.inbox.findIndex((m) => m.type === type);
      if (i >= 0) return this.inbox.splice(i, 1)[0] as Extract<SyncMessage, { type: T }>;
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

  send(type: string, payload: unknown, id?: string): string {
    const msgId = id ?? `c${++this.n}-${Math.random().toString(36).slice(2, 8)}`;
    this.ws.send(JSON.stringify({ id: msgId, type, ts: Date.now(), payload }));
    return msgId;
  }

  async challenge(): Promise<string> {
    return (await this.next('auth.challenge')).payload.nonce;
  }

  async pair(code: string, name = "Tuan's iPad") {
    await this.challenge();
    this.send('pair.request', { code, deviceName: name });
    return (await this.next('pair.result')).payload;
  }

  async hello(deviceId: string, secret: string) {
    const nonce = await this.challenge();
    this.send('auth.hello', { deviceId, hmac: computeHmac(secret, nonce) });
    return (await this.next('auth.result')).payload;
  }

  /** Waits until the server has handled everything sent so far. */
  async settle(): Promise<void> {
    const id = this.send('webapp.activity', { sessionId: 'settle', activities: [] });
    for (;;) {
      const ack = await this.next('ack');
      if (ack.payload.ackId === id) return;
    }
  }
}

const connect = () => new WebClient(link.server.getPort()!);

async function pairedClient(): Promise<{ client: WebClient; deviceId: string; secret: string }> {
  const client = connect();
  const result = await client.pair(link.pairingCode.current().code);
  expect(result.ok).toBe(true);
  return { client, deviceId: result.deviceId!, secret: result.secret! };
}

const mock = new MockLLMProvider();
// The mock provider waits 500 ms per call; keep tests quick by skipping that delay.
const fastMock = {
  requestHints: ((ctx, src, assess) => mock.requestHints(ctx, src, assess)) as typeof mock.requestHints
};

async function boot(over: { helloTimeoutMs?: number } = {}): Promise<void> {
  link = await startLanLink({
    port: 0,
    host: '127.0.0.1',
    db: () => db,
    now: () => clock,
    getDevices: () => devices,
    setDevices: (d) => {
      devices = d;
    },
    hints: {
      requestHints: (ctx, src, assess) => fastMock.requestHints(ctx, src, assess),
      requestFollowup: async (followup) => {
        if (followupMode === 'fail') throw new Error('boom');
        return { requestId: followup.requestId, text: 'Step 2 means subtract 5 from both sides.', level: followup.currentLevel, offline: false };
      }
    },
    getPlanSnapshot: () => ({ items: [{ id: 'p1', title: 'Read section 2', status: 'pending' }] }),
    getStreakSnapshot: () => ({ current: 3, longest: 5, freezesAvailable: 1, todayQualified: false, todayMinutes: 12, week: [] }),
    logEvent: (type, payload, opts) => logEvent(type, payload, opts),
    networkInterfaces: () => ({}),
    onSessionEnded: (info) => ended.push(info),
    ...over
  });
}

beforeEach(async () => {
  db = openDatabase(':memory:');
  setDatabaseForTesting(db);
  clock = 1_000_000;
  devices = [];
  ended = [];
  followupMode = 'ok';
  await boot();
});

afterEach(async () => {
  for (const c of clients) c.ws.terminate();
  clients = [];
  await link.stop();
  setDatabaseForTesting(null);
  db.close();
});

const count = (table: string, where = '1=1') => (db.prepare(`SELECT COUNT(*) AS n FROM ${table} WHERE ${where}`).get() as { n: number }).n;

describe('LAN sync: pairing and auth', () => {
  it('pairs with the right code, stores the device, and the code is single-use', async () => {
    const code = link.pairingCode.current().code;
    const c = connect();
    const result = await c.pair(code, "Thu's iPad");
    expect(result).toMatchObject({ ok: true });
    expect(result.deviceId).toBeTruthy();
    expect(result.secret).toMatch(/^[0-9a-f]{64}$/);
    expect(devices).toEqual([expect.objectContaining({ deviceId: result.deviceId, name: "Thu's iPad", secret: result.secret, pairedAt: clock })]);
    expect(link.pairingCode.current().code).not.toBe(code);

    const again = connect();
    expect((await again.pair(code)).ok).toBe(false); // used code
    expect(devices).toHaveLength(1);
  });

  it('rejects a wrong code and closes the socket', async () => {
    const c = connect();
    const result = await c.pair('000000' === link.pairingCode.current().code ? '000001' : '000000');
    expect(result).toMatchObject({ ok: false, reason: 'invalid code' });
    expect(await c.closed).toBe(1008);
    expect(devices).toEqual([]);
  });

  it('locks pairing after repeated wrong guesses, even for the right code, then recovers', async () => {
    const real = link.pairingCode.current().code;
    const wrong = real === '123456' ? '654321' : '123456';
    for (let i = 0; i < 5; i++) {
      expect((await connect().pair(wrong)).ok).toBe(false);
    }
    const locked = await connect().pair(real);
    expect(locked.ok).toBe(false);
    expect(locked.reason).toMatch(/too many/);
    clock += 61_000;
    expect((await connect().pair(link.pairingCode.current().code)).ok).toBe(true);
  });

  it('lets a paired device authenticate with HMAC(secret, nonce), and pushes the snapshots', async () => {
    const { deviceId, secret } = await pairedClient();
    const c = connect();
    expect(await c.hello(deviceId, secret)).toEqual({ ok: true });
    expect((await c.next('plan.snapshot')).payload.items).toEqual([{ id: 'p1', title: 'Read section 2', status: 'pending' }]);
    expect((await c.next('streak.snapshot')).payload).toMatchObject({ current: 3, longest: 5 });
  });

  it('rejects a wrong secret and an unknown device', async () => {
    const { deviceId } = await pairedClient();
    const bad = connect();
    expect(await bad.hello(deviceId, 'f'.repeat(64))).toEqual({ ok: false, reason: 'bad credentials' });
    expect(await bad.closed).toBe(1008);
    const unknown = connect();
    expect(await unknown.hello('no-such-device', 'x')).toEqual({ ok: false, reason: 'unpaired' });
  });

  it('a nonce cannot be reused: an HMAC for another connection fails', async () => {
    const { deviceId, secret } = await pairedClient();
    const first = connect();
    const nonce1 = await first.challenge();
    const second = connect();
    await second.challenge();
    second.send('auth.hello', { deviceId, hmac: computeHmac(secret, nonce1) });
    expect((await second.next('auth.result')).payload.ok).toBe(false);
  });

  it('closes an unauthenticated socket that sends data, and stores nothing', async () => {
    const c = connect();
    await c.challenge();
    c.send('session.start', { sessionId: 'w1', device: 'webapp', startedAt: 1, assessmentMode: false });
    expect(await c.closed).toBe(1008);
    expect(count('sessions')).toBe(0);
  });

  it('closes a socket that never authenticates', async () => {
    await link.stop();
    await boot({ helloTimeoutMs: 120 });
    const c = connect();
    expect(await c.closed).toBe(1008);
  });

  it('hmac helpers have a stable test vector (for the web app implementation)', () => {
    expect(computeHmac('abc', 'xyz')).toBe('c03d0898b76731130f3e2134b39b824c53c4e62a55b3c020a4be6d5ada606102');
    expect(verifyHmac('abc', 'xyz', 'C03D0898B76731130F3E2134B39B824C53C4E62A55B3C020A4BE6D5ADA606102')).toBe(true);
    expect(verifyHmac('abc', 'xyz', 'nope')).toBe(false);
  });
});

describe('LAN sync: messages', () => {
  it('stores sessions, activity and nudge logs from the web app and acks each message', async () => {
    const { client } = await pairedClient();
    const ids = [
      client.send('session.start', { sessionId: 'w1', device: 'webapp', startedAt: 5_000, label: 'Calc homework', assessmentMode: true }),
      client.send('webapp.activity', {
        sessionId: 'w1',
        activities: [
          { type: 'canvas_stroke', ts: 5_100 },
          { type: 'undo', ts: 5_200, meta: { n: 2 } },
          { type: 'tab_hidden', ts: 5_300 }
        ]
      }),
      client.send('nudge.log', { sessionId: 'w1', ts: 5_400, kind: 'stuck', level: 3, text: 'Want a hint?', userResponse: 'accept_hint' }),
      client.send('session.end', { sessionId: 'w1', endedAt: 65_000 })
    ];
    for (const id of ids) expect((await client.next('ack')).payload.ackId).toBe(id);

    expect(db.prepare('SELECT device, started_at, ended_at, label, assessment_mode FROM sessions WHERE id = ?').get('w1')).toEqual({
      device: 'webapp',
      started_at: 5_000,
      ended_at: 65_000,
      label: 'Calc homework',
      assessment_mode: 1
    });
    expect(db.prepare('SELECT type, ts, meta_json FROM webapp_activity ORDER BY id').all()).toEqual([
      { type: 'canvas_stroke', ts: 5_100, meta_json: null },
      { type: 'undo', ts: 5_200, meta_json: '{"n":2}' },
      { type: 'tab_hidden', ts: 5_300, meta_json: null }
    ]);
    expect(db.prepare("SELECT device, kind, level, user_response, session_id FROM nudges").get()).toEqual({
      device: 'webapp',
      kind: 'stuck',
      level: 3,
      user_response: 'accept_hint',
      session_id: 'w1'
    });
    const events = db.prepare("SELECT type, device FROM events ORDER BY id").all();
    expect(events).toEqual([
      { type: 'session.start', device: 'webapp' },
      { type: 'nudge.shown', device: 'webapp' },
      { type: 'nudge.answered', device: 'webapp' },
      { type: 'session.end', device: 'webapp' }
    ]);
    expect(ended).toEqual([{ sessionId: 'w1', startedAt: 5_000, endedAt: 65_000 }]);
  });

  it('offline replay: replaying the whole queue (same ids), even on a new connection, creates no duplicates', async () => {
    const { client, deviceId, secret } = await pairedClient();
    const queue = [
      ['m1', 'session.start', { sessionId: 'w2', device: 'webapp', startedAt: 10, assessmentMode: false }],
      ['m2', 'webapp.activity', { sessionId: 'w2', activities: [{ type: 'canvas_stroke', ts: 11 }, { type: 'erase', ts: 12 }] }],
      ['m3', 'nudge.log', { sessionId: 'w2', ts: 13, kind: 'stuck', level: 3, text: 'Hint?' }],
      ['m4', 'session.end', { sessionId: 'w2', endedAt: 100 }]
    ] as const;
    for (const [id, type, payload] of queue) client.send(type, payload, id);
    for (let i = 0; i < 4; i++) await client.next('ack');

    // Connection drops; the client replays everything because it never saw some acks.
    client.ws.terminate();
    const again = connect();
    expect(await again.hello(deviceId, secret)).toEqual({ ok: true });
    for (const [id, type, payload] of queue) again.send(type, payload, id);
    const acked = new Set<string>();
    for (let i = 0; i < 4; i++) acked.add((await again.next('ack')).payload.ackId);
    expect(acked).toEqual(new Set(['m1', 'm2', 'm3', 'm4'])); // acknowledged again so the client can clear its queue

    expect(count('sessions', "id = 'w2'")).toBe(1);
    expect(count('webapp_activity')).toBe(2);
    expect(count('nudges')).toBe(1);
    expect(count('events', "type = 'session.end'")).toBe(1);
    expect(ended).toHaveLength(1);
  });

  it('dedupe survives a desktop restart (the ids are in the database)', async () => {
    const { client, deviceId, secret } = await pairedClient();
    client.send('webapp.activity', { sessionId: 'w3', activities: [{ type: 'canvas_stroke', ts: 1 }] }, 'x1');
    await client.next('ack');
    expect(hasSeen(db, deviceId, 'x1')).toBe(true);

    await link.stop();
    await boot();
    const again = connect();
    await again.hello(deviceId, secret);
    again.send('webapp.activity', { sessionId: 'w3', activities: [{ type: 'canvas_stroke', ts: 1 }] }, 'x1');
    await again.next('ack');
    expect(count('webapp_activity')).toBe(1);
  });

  it('keeps data that arrives before its session.start, and the later start fills the session in', async () => {
    const { client } = await pairedClient();
    client.send('webapp.activity', { sessionId: 'w4', activities: [{ type: 'canvas_stroke', ts: 50 }] });
    client.send('session.start', { sessionId: 'w4', device: 'webapp', startedAt: 40, label: 'Late start', assessmentMode: false });
    await client.next('ack');
    await client.next('ack');
    expect(count('sessions', "id = 'w4'")).toBe(1);
    expect(db.prepare("SELECT started_at, label FROM sessions WHERE id = 'w4'").get()).toEqual({ started_at: 40, label: 'Late start' });
    expect(count('webapp_activity')).toBe(1);
  });

  it('acknowledges a poison message (valid envelope, bad payload) without applying it', async () => {
    const { client } = await pairedClient();
    const id = client.send('session.start', { sessionId: 123 });
    expect((await client.next('ack')).payload.ackId).toBe(id);
    expect(count('sessions')).toBe(0);
    client.ws.send('not json at all');
    await client.settle(); // the connection is still alive
  });

  it('ignores server-only message types sent by a client', async () => {
    const { client } = await pairedClient();
    client.send('plan.snapshot', { items: [] });
    client.send('hint.error', { requestId: 'x', message: 'spoof' });
    await client.settle();
    expect(count('a_sync_seen')).toBe(1); // only the settle message was applied; the spoofed ones were dropped unseen
    expect(client.inbox.filter((m) => m.type === 'hint.error' || m.type === 'auth.result')).toEqual([]);
  });

  it('prunes old dedupe ids', () => {
    const day = 24 * 3600 * 1000;
    db.prepare("INSERT INTO a_sync_seen (id, device_id, seen_at) VALUES ('d:old', 'd', ?), ('d:new', 'd', ?)").run(1, 39 * day);
    expect(pruneSeen(db, 40 * day)).toBe(1);
    expect(hasSeen(db, 'd', 'new')).toBe(true);
  });
});

describe('LAN sync: hints', () => {
  const hintRequest = (requestId: string) => ({
    requestId,
    context: { sessionId: 'w5', device: 'webapp', trigger: 'manual', problemId: 'demo-algebra-problem', imageDataUrl: 'data:image/png;base64,iVBORw0KGgo=' },
    source: 'handwriting',
    assessment: false,
    timestamp: 1
  });

  it('round trip: hint.request -> ack -> hint.response with five levels (mock provider)', async () => {
    const { client } = await pairedClient();
    const id = client.send('hint.request', hintRequest('h1'));
    expect((await client.next('ack')).payload.ackId).toBe(id);
    const response = await client.next('hint.response');
    expect(response.payload.requestId).toBe('h1');
    const levels = Object.values(response.payload.response.hint_levels);
    expect(levels).toHaveLength(5);
    expect(new Set(levels).size).toBe(5);
    expect(response.payload.response.what_i_see).toContain('2x + 5 = 13');
  });

  it('a replayed hint.request is acknowledged but does not call the model again', async () => {
    const { client } = await pairedClient();
    let calls = 0;
    const real = fastMock.requestHints;
    fastMock.requestHints = ((...args: Parameters<typeof real>) => {
      calls++;
      return real(...args);
    }) as typeof real;
    try {
      client.send('hint.request', hintRequest('h2'), 'same-id');
      await client.next('hint.response');
      client.send('hint.request', hintRequest('h2'), 'same-id');
      await client.next('ack');
      await client.next('ack');
      expect(calls).toBe(1);
    } finally {
      fastMock.requestHints = real;
    }
  });

  it('follows up through requestFollowup, and replies hint.error when the service fails', async () => {
    const { client } = await pairedClient();
    const followup = {
      followup: { requestId: 'h1', utterance: "I don't get step 2", currentLevel: 2, conversationHistory: [] },
      context: { sessionId: 'w5', device: 'webapp', trigger: 'voice' },
      source: 'handwriting',
      assessment: false
    };
    client.send('hint.followup', followup);
    const reply = await client.next('hint.followup_response');
    expect(reply.payload).toMatchObject({ requestId: 'h1', level: 2, text: expect.stringContaining('subtract 5') });

    followupMode = 'fail';
    client.send('hint.followup', followup);
    const err = await client.next('hint.error');
    expect(err.payload.requestId).toBe('h1');
    expect(err.payload.message).not.toContain('boom'); // no internals leak to the client
  });
});

describe('LAN sync: unpair and snapshots', () => {
  it('unpair deletes the secret, tells the device "unpaired", and stops all traffic', async () => {
    const { client, deviceId, secret } = await pairedClient();
    client.send('session.start', { sessionId: 'w6', device: 'webapp', startedAt: 1, assessmentMode: false });
    await client.next('ack');

    const info = link.unpair(deviceId);
    expect(info.devices).toEqual([]);
    expect(devices).toEqual([]);
    expect((await client.next('auth.result')).payload).toEqual({ ok: false, reason: 'unpaired' });
    expect(await client.closed).toBe(1008);

    // Nothing sent on the old socket lands, and the device cannot come back.
    client.ws.send(JSON.stringify({ id: 'late', type: 'webapp.activity', ts: 1, payload: { sessionId: 'w6', activities: [{ type: 'canvas_stroke', ts: 2 }] } }));
    const back = connect();
    expect(await back.hello(deviceId, secret)).toEqual({ ok: false, reason: 'unpaired' });
    expect(count('webapp_activity')).toBe(0);
  });

  it('a socket authenticated before an out-of-band unpair is cut off on its next message', async () => {
    const { client, deviceId } = await pairedClient();
    devices = devices.filter((d) => d.deviceId !== deviceId); // e.g. settings edited directly
    client.send('webapp.activity', { sessionId: 'w7', activities: [{ type: 'canvas_stroke', ts: 1 }] });
    expect((await client.next('auth.result')).payload.reason).toBe('unpaired');
    expect(count('webapp_activity')).toBe(0);
  });

  it('pushes fresh snapshots on demand to authenticated clients only', async () => {
    const { client } = await pairedClient();
    await client.next('plan.snapshot');
    await client.next('streak.snapshot');
    const stranger = connect();
    await stranger.challenge();
    link.server.pushSnapshots('streak');
    expect((await client.next('streak.snapshot')).payload.current).toBe(3);
    await new Promise((r) => setTimeout(r, 50));
    expect(stranger.inbox).toEqual([]);
  });

  it('reports pairing info for the settings screen', async () => {
    const { deviceId } = await pairedClient();
    const info = link.getInfo();
    expect(info).toMatchObject({ listening: true, port: link.server.getPort(), addresses: [] });
    expect(info.code).toMatch(/^\d{6}$/);
    expect(info.devices).toEqual([{ deviceId, name: "Tuan's iPad", pairedAt: clock, connected: true }]);
    expect(link.regenerateCode().code).toMatch(/^\d{6}$/);
  });
});

describe('helpers', () => {
  it('lists LAN IPv4 addresses, Wi-Fi first, skipping loopback and link-local', () => {
    const info = (address: string, family: 'IPv4' | 'IPv6', internal = false) => ({ address, family, internal }) as NetworkInterfaceInfo;
    expect(
      lanAddresses({
        lo0: [info('127.0.0.1', 'IPv4', true)],
        utun3: [info('10.8.0.2', 'IPv4')],
        en0: [info('fe80::1', 'IPv6'), info('192.168.1.23', 'IPv4')],
        bridge0: [info('169.254.9.9', 'IPv4')]
      })
    ).toEqual(['192.168.1.23', '10.8.0.2']);
  });

  it('pairing codes expire, rotate after use, and can be regenerated', () => {
    let t = 0;
    let n = 41;
    const p = new PairingCode({ now: () => t, ttlMs: 1000, randomCode: () => ++n });
    expect(p.current().code).toBe('000042');
    t = 999;
    expect(p.current().code).toBe('000042');
    t = 1000; // expired: replaced on the next read
    expect(p.current().code).toBe('000043');
    expect(p.check('000042')).toBe('bad');
    expect(p.check('000043')).toBe('ok'); // consumed: rotated to 000044
    expect(p.check('000043')).toBe('bad');
    expect(p.regenerate().code).toBe('000045');
  });
});
