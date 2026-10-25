import { randomUUID } from 'crypto';
import type { IncomingMessage } from 'http';
import { WebSocketServer, type RawData, type WebSocket } from 'ws';
import {
  ExtensionMessageSchema,
  type ExtensionMessage,
  type ExtensionMessageOf,
  type PageSummary,
  type StruggleSignal,
  type BrightspaceData
} from '@wolfie/shared';
import { TypedEmitter } from '../typed-emitter.js';
import type { DeskState } from './desk-state.js';
import { tokensMatch } from './pairing.js';

// Loopback WebSocket for the Chrome extension (SPEC Phase 2, plan A2).
//
// Auth: the Origin must be chrome-extension://<id>, and once an extension id is stored (trust on
// first use) later origins must match it. The pairing token arrives in the first message
// (`ext.hello`), never in the URL; anything else first, or silence for helloTimeoutMs, closes the
// socket. Messages from an unauthenticated socket are never handled.

const EXTENSION_ORIGIN = /^chrome-extension:\/\/([a-p]{32})$/;

export interface ExtensionHandlers {
  onTab(payload: ExtensionMessageOf<'ext.tab'>['payload']): void;
  /** The active tab reports nothing (excluded, incognito, not a web page, Chrome unfocused). */
  onTabNone?(): void;
  onPageSummary(summary: PageSummary): void;
  onSignal(signal: StruggleSignal, domain: string): void;
  onBrightspaceData(data: BrightspaceData): void;
}

export interface ExtensionServerOptions {
  host?: string;
  /** 0 picks a free port (tests). */
  port: number;
  getToken(): string | null;
  getExtensionId(): string | null;
  setExtensionId(id: string): void;
  getDeskState(): DeskState;
  handlers: ExtensionHandlers;
  helloTimeoutMs?: number;
  heartbeatMs?: number;
  maxPayloadBytes?: number;
}

interface Client {
  ws: WebSocket;
  authed: boolean;
  alive: boolean;
  extensionId: string | null;
  lastState: string | null;
  helloTimer: ReturnType<typeof setTimeout> | null;
}

export class ExtensionServer {
  readonly events = new TypedEmitter<{ connection: [connected: boolean] }>();
  private wss: WebSocketServer | null = null;
  private clients = new Set<Client>();
  private heartbeat: ReturnType<typeof setInterval> | null = null;
  private summaryWaiters = new Set<(summary: PageSummary) => void>();
  private connected = false;

  constructor(private readonly opts: ExtensionServerOptions) {}

  /** Resolves with the bound port, or null if it could not listen (e.g. EADDRINUSE). */
  start(): Promise<number | null> {
    return new Promise((resolve) => {
      const wss = new WebSocketServer({
        host: this.opts.host ?? '127.0.0.1',
        port: this.opts.port,
        maxPayload: this.opts.maxPayloadBytes ?? 256 * 1024,
        verifyClient: (info: { origin: string; req: IncomingMessage }, done: (ok: boolean, code?: number, msg?: string) => void) =>
          this.verifyOrigin(info.origin, done)
      });
      wss.on('connection', (ws, req) => this.onConnection(ws, req));
      wss.once('listening', () => {
        this.wss = wss;
        this.heartbeat = setInterval(() => this.beat(), this.opts.heartbeatMs ?? 20_000);
        const addr = wss.address();
        resolve(typeof addr === 'object' && addr ? addr.port : null);
      });
      wss.on('error', (error) => {
        console.error('[extension-server]', (error as Error).message);
        if (!this.wss) resolve(null);
      });
    });
  }

  async stop(): Promise<void> {
    if (this.heartbeat) clearInterval(this.heartbeat);
    this.heartbeat = null;
    for (const c of this.clients) c.ws.terminate();
    this.clients.clear();
    this.setConnected(false);
    const wss = this.wss;
    this.wss = null;
    if (wss) await new Promise<void>((resolve) => wss.close(() => resolve()));
  }

  /** Disconnect every client (the token changed); the server keeps listening. */
  dropClients(): void {
    for (const c of this.clients) c.ws.terminate();
  }

  isConnected(): boolean {
    return this.connected;
  }

  /** Recompute desk.state and send it to every authenticated client whose copy is out of date. */
  pushState(force = false): void {
    const state = this.opts.getDeskState();
    const json = JSON.stringify(state);
    for (const c of this.clients) {
      if (!c.authed) continue;
      if (!force && c.lastState === json) continue;
      c.lastState = json;
      this.send(c.ws, 'desk.state', state);
    }
  }

  /**
   * Asks the extension for a fresh PageSummary. The wire format has no request id on the reply, so
   * the next `ext.page_summary` after the request resolves it. Null on timeout or no client.
   */
  requestSummary(timeoutMs = 1500): Promise<PageSummary | null> {
    const targets = [...this.clients].filter((c) => c.authed);
    if (targets.length === 0) return Promise.resolve(null);
    return new Promise((resolve) => {
      const done = (summary: PageSummary | null) => {
        clearTimeout(timer);
        this.summaryWaiters.delete(waiter);
        resolve(summary);
      };
      const waiter = (summary: PageSummary) => done(summary);
      const timer = setTimeout(() => done(null), timeoutMs);
      this.summaryWaiters.add(waiter);
      const requestId = randomUUID();
      for (const c of targets) this.send(c.ws, 'desk.request_summary', { requestId });
    });
  }

  // ---- internals ----------------------------------------------------------------------------

  private verifyOrigin(origin: string, done: (ok: boolean, code?: number, msg?: string) => void): void {
    const match = EXTENSION_ORIGIN.exec(origin ?? '');
    if (!match) return done(false, 403, 'Forbidden origin');
    const stored = this.opts.getExtensionId();
    if (stored && stored !== match[1]) return done(false, 403, 'Origin does not match the paired extension');
    done(true);
  }

  private onConnection(ws: WebSocket, req: IncomingMessage): void {
    const originId = EXTENSION_ORIGIN.exec(String(req.headers.origin ?? ''))?.[1] ?? null;
    const client: Client = { ws, authed: false, alive: true, extensionId: originId, lastState: null, helloTimer: null };
    this.clients.add(client);
    client.helloTimer = setTimeout(() => {
      if (!client.authed) ws.close(1008, 'hello timeout');
    }, this.opts.helloTimeoutMs ?? 5000);

    ws.on('pong', () => (client.alive = true));
    ws.on('message', (data) => this.onMessage(client, data));
    ws.on('close', () => {
      if (client.helloTimer) clearTimeout(client.helloTimer);
      this.clients.delete(client);
      this.refreshConnected();
    });
    ws.on('error', () => ws.terminate());
  }

  private parse(data: RawData): ExtensionMessage | null {
    try {
      const parsed = ExtensionMessageSchema.safeParse(JSON.parse(data.toString()));
      return parsed.success ? parsed.data : null;
    } catch {
      return null;
    }
  }

  private onMessage(client: Client, data: RawData): void {
    const msg = this.parse(data);
    if (!client.authed) {
      if (!msg || msg.type !== 'ext.hello') return client.ws.close(1008, 'hello required');
      return this.onHello(client, msg);
    }
    if (!msg) return; // malformed or wrong direction: ignore, stay connected
    switch (msg.type) {
      case 'ext.tab':
        this.opts.handlers.onTab(msg.payload);
        break;
      case 'ext.tab_none':
        this.opts.handlers.onTabNone?.();
        break;
      case 'ext.page_summary':
        this.opts.handlers.onPageSummary(msg.payload.summary);
        for (const waiter of [...this.summaryWaiters]) waiter(msg.payload.summary);
        break;
      case 'ext.signal':
        this.opts.handlers.onSignal(msg.payload.signal, msg.payload.domain);
        break;
      case 'ext.brightspace_data':
        this.opts.handlers.onBrightspaceData(msg.payload.data);
        break;
      default:
        break; // ext.hello again or desk.* from a client: ignore
    }
  }

  private onHello(client: Client, msg: ExtensionMessageOf<'ext.hello'>): void {
    if (client.helloTimer) clearTimeout(client.helloTimer);
    if (!tokensMatch(this.opts.getToken(), msg.payload.token)) {
      this.send(client.ws, 'desk.hello_result', { ok: false, reason: 'invalid token' });
      client.ws.close(1008, 'invalid token');
      return;
    }
    client.authed = true;
    if (client.extensionId && !this.opts.getExtensionId()) this.opts.setExtensionId(client.extensionId);
    this.send(client.ws, 'desk.hello_result', { ok: true });
    this.refreshConnected();
    this.pushState(true);
  }

  private send<T extends Extract<ExtensionMessage, { type: `desk.${string}` }>['type']>(
    ws: WebSocket,
    type: T,
    payload: Extract<ExtensionMessage, { type: T }>['payload']
  ): void {
    if (ws.readyState !== ws.OPEN) return;
    ws.send(JSON.stringify({ id: randomUUID(), type, ts: Date.now(), payload }));
  }

  /** Ping dead sockets away, and re-send desk.state so the MV3 worker sees traffic (keep-alive). */
  private beat(): void {
    for (const c of this.clients) {
      if (!c.alive) {
        c.ws.terminate();
        continue;
      }
      c.alive = false;
      c.ws.ping();
    }
    this.pushState(true);
  }

  private refreshConnected(): void {
    this.setConnected([...this.clients].some((c) => c.authed));
  }

  private setConnected(value: boolean): void {
    if (value === this.connected) return;
    console.log(`[extension-server] connection status changed: ${value}`);
    this.connected = value;
    this.events.emit('connection', value);
  }
}
