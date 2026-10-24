import { randomUUID } from 'crypto';
import type Database from 'better-sqlite3';
import { WebSocketServer, type RawData, type WebSocket } from 'ws';
import {
  SyncMessageSchema,
  type DeviceType,
  type PairedDeviceType,
  type PlanSnapshotType,
  type RequestFollowup,
  type RequestHints,
  type StreakSnapshotType,
  type SyncMessage,
  type SyncMessageOf
} from '@wolfie/shared';
import { TypedEmitter } from '../typed-emitter.js';
import { newDeviceId, newNonce, newSecret, verifyHmac } from './lan-auth.js';
import { endWebSession, insertActivities, insertNudgeLog, markSeen, pruneSeen, upsertWebSession } from './lan-store.js';
import type { PairingCode } from './pairing-code.js';

// LAN WebSocket server for the web app (SPEC Phase 10, plan A8). Handshake and message types are
// in shared/src/schemas/sync.ts. Flow per connection:
//   server: auth.challenge {nonce}
//   client: auth.hello {deviceId, hmac}   -> auth.result {ok}            (paired device)
//        or pair.request {code, deviceName} -> pair.result {ok, deviceId, secret}  (new device)
// Only authenticated sockets get any other message handled. Every handled message is answered with
// `ack` (also when it was a replay), and applied at most once (dedupe by message id, persisted).

type ServerType = Extract<SyncMessage['type'], 'auth.challenge' | 'auth.result' | 'pair.result' | 'ack' | 'hint.response' | 'hint.followup_response' | 'hint.error' | 'plan.snapshot' | 'streak.snapshot'>;

export interface LanServerDeps {
  host?: string;
  /** 0 picks a free port (tests). */
  port: number;
  db: () => Database.Database;
  now: () => number;
  pairingCode: PairingCode;
  getDevices: () => PairedDeviceType[];
  setDevices: (devices: PairedDeviceType[]) => void;
  hints: { requestHints: RequestHints; requestFollowup: RequestFollowup };
  getPlanSnapshot: () => PlanSnapshotType;
  getStreakSnapshot: () => StreakSnapshotType;
  logEvent: (type: `${string}.${string}`, payload: Record<string, unknown>, opts: { device: DeviceType; ts: number; db: Database.Database }) => void;
  /** A web session ended (A9 recalculates the streak for its days). */
  onSessionEnded?: (info: { sessionId: string; startedAt: number; endedAt: number }) => void;
  helloTimeoutMs?: number;
  maxPayloadBytes?: number;
}

interface Conn {
  ws: WebSocket;
  nonce: string;
  deviceId: string | null;
  helloTimer: ReturnType<typeof setTimeout> | null;
}

export class LanServer {
  readonly events = new TypedEmitter<{ devices: [] }>();
  private wss: WebSocketServer | null = null;
  private conns = new Set<Conn>();
  private port: number | null = null;

  constructor(private readonly deps: LanServerDeps) {}

  start(): Promise<number | null> {
    return new Promise((resolve) => {
      const wss = new WebSocketServer({
        host: this.deps.host ?? '0.0.0.0',
        port: this.deps.port,
        maxPayload: this.deps.maxPayloadBytes ?? 20 * 1024 * 1024 // canvas PNGs and camera photos
      });
      wss.on('connection', (ws) => this.onConnection(ws));
      wss.once('listening', () => {
        this.wss = wss;
        const addr = wss.address();
        this.port = typeof addr === 'object' && addr ? addr.port : null;
        try {
          pruneSeen(this.deps.db(), this.deps.now());
        } catch {
          // database not ready: pruning is housekeeping only
        }
        resolve(this.port);
      });
      wss.on('error', (error) => {
        console.error('[lan-server]', (error as Error).message);
        if (!this.wss) resolve(null);
      });
    });
  }

  async stop(): Promise<void> {
    for (const c of this.conns) c.ws.terminate();
    this.conns.clear();
    const wss = this.wss;
    this.wss = null;
    this.port = null;
    if (wss) await new Promise<void>((resolve) => wss.close(() => resolve()));
  }

  getPort(): number | null {
    return this.port;
  }

  isConnected(deviceId: string): boolean {
    return [...this.conns].some((c) => c.deviceId === deviceId);
  }

  /** Delete the secret, then tell the device and cut it off (plan A8). */
  unpair(deviceId: string): boolean {
    const devices = this.deps.getDevices();
    if (!devices.some((d) => d.deviceId === deviceId)) return false;
    this.deps.setDevices(devices.filter((d) => d.deviceId !== deviceId));
    for (const c of [...this.conns]) {
      if (c.deviceId !== deviceId) continue;
      c.deviceId = null;
      this.send(c.ws, 'auth.result', { ok: false, reason: 'unpaired' });
      c.ws.close(1008, 'unpaired');
    }
    this.events.emit('devices');
    return true;
  }

  /** Push the plan and/or streak snapshot to every authenticated web app. */
  pushSnapshots(which: 'plan' | 'streak' | 'both' = 'both'): void {
    for (const c of this.conns) {
      if (!c.deviceId) continue;
      if (which !== 'streak') this.send(c.ws, 'plan.snapshot', this.deps.getPlanSnapshot());
      if (which !== 'plan') this.send(c.ws, 'streak.snapshot', this.deps.getStreakSnapshot());
    }
  }

  // ---- connection handling -------------------------------------------------------------------

  private onConnection(ws: WebSocket): void {
    const conn: Conn = { ws, nonce: newNonce(), deviceId: null, helloTimer: null };
    this.conns.add(conn);
    conn.helloTimer = setTimeout(() => {
      if (!conn.deviceId) ws.close(1008, 'auth timeout');
    }, this.deps.helloTimeoutMs ?? 10_000);
    ws.on('message', (data) => void this.onMessage(conn, data));
    ws.on('close', () => {
      if (conn.helloTimer) clearTimeout(conn.helloTimer);
      this.conns.delete(conn);
      this.events.emit('devices');
    });
    ws.on('error', () => ws.terminate());
    this.send(ws, 'auth.challenge', { nonce: conn.nonce });
  }

  private send<T extends ServerType>(ws: WebSocket, type: T, payload: Extract<SyncMessage, { type: T }>['payload']): void {
    if (ws.readyState !== ws.OPEN) return;
    ws.send(JSON.stringify({ id: randomUUID(), type, ts: this.deps.now(), payload }));
  }

  private rawId(data: RawData): string | null {
    try {
      const id = (JSON.parse(data.toString()) as { id?: unknown }).id;
      return typeof id === 'string' ? id : null;
    } catch {
      return null;
    }
  }

  private async onMessage(conn: Conn, data: RawData): Promise<void> {
    let json: unknown;
    try {
      json = JSON.parse(data.toString());
    } catch {
      return;
    }
    const parsed = SyncMessageSchema.safeParse(json);

    if (!conn.deviceId) {
      if (!parsed.success) return void conn.ws.close(1008, 'authentication required');
      return this.onUnauthenticated(conn, parsed.data);
    }
    // The device may have been unpaired since this socket authenticated.
    if (!this.deps.getDevices().some((d) => d.deviceId === conn.deviceId)) {
      conn.deviceId = null;
      this.send(conn.ws, 'auth.result', { ok: false, reason: 'unpaired' });
      return void conn.ws.close(1008, 'unpaired');
    }
    if (!parsed.success) {
      // Poison message: acknowledge so the client's queue moves on, but apply nothing.
      const id = this.rawId(data);
      if (id) this.send(conn.ws, 'ack', { ackId: id });
      return;
    }
    await this.onAuthenticated(conn, conn.deviceId, parsed.data);
  }

  private onUnauthenticated(conn: Conn, msg: SyncMessage): void {
    if (msg.type === 'auth.hello') return this.onHello(conn, msg);
    if (msg.type === 'pair.request') return this.onPair(conn, msg);
    conn.ws.close(1008, 'authentication required');
  }

  private onHello(conn: Conn, msg: SyncMessageOf<'auth.hello'>): void {
    const device = this.deps.getDevices().find((d) => d.deviceId === msg.payload.deviceId);
    if (!device) {
      this.send(conn.ws, 'auth.result', { ok: false, reason: 'unpaired' });
      return void conn.ws.close(1008, 'unpaired');
    }
    if (!verifyHmac(device.secret, conn.nonce, msg.payload.hmac)) {
      this.send(conn.ws, 'auth.result', { ok: false, reason: 'bad credentials' });
      return void conn.ws.close(1008, 'bad credentials');
    }
    this.authenticated(conn, device.deviceId);
    this.send(conn.ws, 'auth.result', { ok: true });
    this.pushSnapshots('both');
  }

  private onPair(conn: Conn, msg: SyncMessageOf<'pair.request'>): void {
    const check = this.deps.pairingCode.check(msg.payload.code);
    if (check !== 'ok') {
      this.send(conn.ws, 'pair.result', { ok: false, reason: check === 'locked' ? 'too many attempts, try again in a minute' : 'invalid code' });
      return void conn.ws.close(1008, check === 'locked' ? 'locked' : 'invalid code');
    }
    const device: PairedDeviceType = {
      deviceId: newDeviceId(),
      name: msg.payload.deviceName.slice(0, 60),
      secret: newSecret(),
      pairedAt: this.deps.now()
    };
    this.deps.setDevices([...this.deps.getDevices(), device]);
    this.authenticated(conn, device.deviceId);
    this.send(conn.ws, 'pair.result', { ok: true, deviceId: device.deviceId, secret: device.secret });
    this.pushSnapshots('both');
  }

  private authenticated(conn: Conn, deviceId: string): void {
    if (conn.helloTimer) clearTimeout(conn.helloTimer);
    conn.deviceId = deviceId;
    this.events.emit('devices');
  }

  private async onAuthenticated(conn: Conn, deviceId: string, msg: SyncMessage): Promise<void> {
    const db = this.deps.db();

    // Server-to-client types and handshake messages are not valid from an authenticated client.
    switch (msg.type) {
      case 'auth.challenge':
      case 'auth.hello':
      case 'auth.result':
      case 'pair.request':
      case 'pair.result':
      case 'ack':
      case 'hint.response':
      case 'hint.followup_response':
      case 'hint.error':
      case 'plan.snapshot':
      case 'streak.snapshot':
        return;
      default:
        break;
    }

    // Hints are not stored, only de-duplicated so a replay cannot trigger a second model call.
    if (msg.type === 'hint.request' || msg.type === 'hint.followup') {
      if (!this.once(db, deviceId, msg.id, () => undefined)) return void this.send(conn.ws, 'ack', { ackId: msg.id });
      this.send(conn.ws, 'ack', { ackId: msg.id });
      if (msg.type === 'hint.request') await this.answerHintRequest(conn, msg);
      else await this.answerFollowup(conn, msg);
      return;
    }

    // Database messages: applied together with their dedupe record, in one transaction. A replay
    // is acknowledged again but never applied twice.
    const ev = (type: `${string}.${string}`, payload: Record<string, unknown>, ts: number) =>
      this.deps.logEvent(type, payload, { device: 'webapp', ts, db });
    let endInfo: { sessionId: string; startedAt: number; endedAt: number } | null = null;
    const fresh = this.once(db, deviceId, msg.id, () => {
      switch (msg.type) {
        case 'session.start':
          upsertWebSession(db, msg.payload);
          ev('session.start', { sessionId: msg.payload.sessionId, assessmentMode: msg.payload.assessmentMode }, msg.payload.startedAt);
          break;
        case 'session.end': {
          const startedAt = endWebSession(db, msg.payload);
          ev('session.end', { sessionId: msg.payload.sessionId, durationMs: msg.payload.endedAt - startedAt }, msg.payload.endedAt);
          endInfo = { sessionId: msg.payload.sessionId, startedAt, endedAt: msg.payload.endedAt };
          break;
        }
        case 'webapp.activity':
          insertActivities(db, msg.payload);
          break;
        case 'nudge.log':
          insertNudgeLog(db, msg.payload);
          ev('nudge.shown', { kind: msg.payload.kind, level: msg.payload.level }, msg.payload.ts);
          if (msg.payload.userResponse) ev('nudge.answered', { kind: msg.payload.kind, action: msg.payload.userResponse }, msg.payload.ts);
          break;
        default:
          break;
      }
    });
    this.send(conn.ws, 'ack', { ackId: msg.id });
    if (fresh && endInfo) {
      try {
        this.deps.onSessionEnded?.(endInfo);
      } catch (error) {
        console.error('[lan-server] onSessionEnded failed:', error instanceof Error ? error.message : error);
      }
    }
  }

  /**
   * Runs `fn` and records the message id in one transaction. Returns false for a replay. If `fn`
   * throws, the transaction rolls back, the error is logged and the message is dropped (still
   * acknowledged, so a poison message cannot be retried forever).
   */
  private once(db: Database.Database, deviceId: string, messageId: string, fn: () => void): boolean {
    try {
      return db.transaction(() => {
        if (!markSeen(db, deviceId, messageId, this.deps.now())) return false;
        fn();
        return true;
      })();
    } catch (error) {
      console.error('[lan-server] failed to apply message:', error instanceof Error ? error.message : error);
      return false;
    }
  }

  private async answerHintRequest(conn: Conn, msg: SyncMessageOf<'hint.request'>): Promise<void> {
    const { requestId, context, source, assessment } = msg.payload;
    try {
      const response = await this.deps.hints.requestHints({ ...context, device: 'webapp' }, source, assessment);
      this.send(conn.ws, 'hint.response', { requestId, response });
    } catch (error) {
      console.error('[lan-server] hint request failed:', error instanceof Error ? error.message : error);
      this.send(conn.ws, 'hint.error', { requestId, message: "Wolfie couldn't produce a hint right now." });
    }
  }

  private async answerFollowup(conn: Conn, msg: SyncMessageOf<'hint.followup'>): Promise<void> {
    const { followup, context, source, assessment } = msg.payload;
    try {
      const reply = await this.deps.hints.requestFollowup(followup, { ...context, device: 'webapp' }, source, assessment);
      this.send(conn.ws, 'hint.followup_response', reply);
    } catch (error) {
      console.error('[lan-server] hint followup failed:', error instanceof Error ? error.message : error);
      this.send(conn.ws, 'hint.error', { requestId: followup.requestId, message: "Wolfie couldn't answer that right now." });
    }
  }
}
