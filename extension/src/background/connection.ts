import { ExtensionMessageSchema, type ExtensionMessage, type ExtensionMessageOf } from '@wolfie/shared';
import { reconnectDelay } from '../lib/backoff';

// Desktop connection manager: hello handshake, reconnect with backoff, typed send. Sockets and
// timers are injected so this runs under Vitest without chrome.* or a real WebSocket.

const OPEN = 1;

export interface SocketLike {
  readyState: number;
  send(data: string): void;
  close(): void;
  onopen: (() => void) | null;
  onclose: (() => void) | null;
  onerror: (() => void) | null;
  onmessage: ((event: { data: unknown }) => void) | null;
}

type Outbound = Extract<ExtensionMessage, { type: `ext.${string}` }>;
export type DeskStatePayload = ExtensionMessageOf<'desk.state'>['payload'];

export interface ConnectionOptions {
  url: string;
  createSocket(url: string): SocketLike;
  getToken(): string | null;
  extensionVersion: string;
  newId(): string;
  now(): number;
  setTimer(fn: () => void, ms: number): unknown;
  clearTimer(handle: unknown): void;
  random?: () => number;
  onDeskState(state: DeskStatePayload): void;
  onRequestSummary(requestId: string): void;
  /** Connected / disconnected / pairing rejected: refresh any UI. */
  onStatus(): void;
}

export class DesktopConnection {
  private socket: SocketLike | null = null;
  private timer: unknown = null;
  private attempt = 0;
  private wanted = false;
  private helloOk = false;
  /** Set when the desktop rejected our token, until the token changes. */
  rejected = false;

  constructor(private readonly opts: ConnectionOptions) {}

  get connected(): boolean {
    return this.helloOk;
  }

  /** Start (or resume) trying to stay connected. Safe to call often, e.g. from an alarm. */
  connect(): void {
    this.wanted = true;
    if (this.socket || !this.opts.getToken() || this.rejected) return;
    this.open();
  }

  /** Stop, and do not reconnect. */
  disconnect(): void {
    this.wanted = false;
    this.clearTimer();
    this.teardown();
  }

  /** The token changed: drop the socket and connect again right away. */
  restart(): void {
    this.rejected = false;
    this.attempt = 0;
    this.clearTimer();
    this.teardown();
    this.connect();
  }

  send<T extends Outbound['type']>(type: T, payload: Extract<Outbound, { type: T }>['payload']): boolean {
    const s = this.socket;
    if (!s || s.readyState !== OPEN) return false;
    s.send(JSON.stringify({ id: this.opts.newId(), type, ts: this.opts.now(), payload }));
    return true;
  }

  private open(): void {
    let socket: SocketLike;
    try {
      socket = this.opts.createSocket(this.opts.url);
    } catch {
      this.scheduleReconnect();
      return;
    }
    this.socket = socket;
    socket.onopen = () => {
      const token = this.opts.getToken();
      if (token) this.send('ext.hello', { token, extensionVersion: this.opts.extensionVersion });
    };
    socket.onmessage = (event) => this.onMessage(event.data);
    socket.onerror = () => undefined; // onclose follows
    socket.onclose = () => {
      if (this.socket !== socket) return; // a stale socket from before restart()
      this.socket = null;
      const was = this.helloOk;
      this.helloOk = false;
      if (was || this.rejected) this.opts.onStatus();
      if (this.wanted && !this.rejected) this.scheduleReconnect();
    };
  }

  private onMessage(raw: unknown): void {
    let json: unknown;
    try {
      json = JSON.parse(String(raw));
    } catch {
      return;
    }
    const parsed = ExtensionMessageSchema.safeParse(json);
    if (!parsed.success) return;
    const msg = parsed.data;
    switch (msg.type) {
      case 'desk.hello_result':
        this.helloOk = msg.payload.ok;
        this.rejected = !msg.payload.ok;
        if (msg.payload.ok) this.attempt = 0;
        this.opts.onStatus();
        break;
      case 'desk.state':
        this.opts.onDeskState(msg.payload);
        break;
      case 'desk.request_summary':
        this.opts.onRequestSummary(msg.payload.requestId);
        break;
      default:
        break;
    }
  }

  private scheduleReconnect(): void {
    this.clearTimer();
    const delay = reconnectDelay(this.attempt++, this.opts.random);
    this.timer = this.opts.setTimer(() => {
      this.timer = null;
      this.connect();
    }, delay);
  }

  private clearTimer(): void {
    if (this.timer !== null) this.opts.clearTimer(this.timer);
    this.timer = null;
  }

  private teardown(): void {
    const s = this.socket;
    this.socket = null;
    const was = this.helloOk;
    this.helloOk = false;
    if (s) {
      s.onclose = null;
      try {
        s.close();
      } catch {
        // already closed
      }
    }
    if (was) this.opts.onStatus();
  }
}
