import type { SttHandlers, SttProvider, SttSession } from './types.js';

// ElevenLabs realtime speech-to-text (Scribe v2 Realtime). The whole wire protocol lives in this
// file, behind an injected socket factory, so tests use a fake socket and the real app passes
// `ws` (which, unlike the browser WebSocket, can send the xi-api-key header).
//
//   wss://api.elevenlabs.io/v1/speech-to-text/realtime?model_id=...&audio_format=pcm_16000&commit_strategy=vad
//   client -> { message_type: 'input_audio_chunk', audio_base_64, commit, sample_rate }
//   server -> session_started | partial_transcript | committed_transcript | warning | <error types>
//
// Reliability: on a dropped or failed connection we reconnect up to 3 times, then report failure
// once so the UI can say voice is having trouble (SPEC Phase 1). The counter resets when a session
// starts successfully. If the server never commits a turn, a short silence after the last partial
// transcript makes us commit manually (the "voice-activity timeout" fallback).

export const DEFAULT_STT_MODEL = 'scribe_v2_realtime';
export const MAX_RECONNECTS = 3;
const SAMPLE_RATE = 16_000;

export interface SocketLike {
  send(data: string): void;
  close(): void;
  onopen: ((ev: unknown) => void) | null;
  onmessage: ((ev: { data: unknown }) => void) | null;
  onclose: ((ev: { code?: number }) => void) | null;
  onerror: ((ev: unknown) => void) | null;
}

export type SocketFactory = (url: string, headers: Record<string, string>) => SocketLike;

export interface ElevenLabsSttOptions {
  apiKey: string;
  model?: string;
  baseUrl?: string;
  socketFactory: SocketFactory;
  /** Wait before reconnect attempt n (1-based). Tests pass an immediate one. */
  backoffMs?: (attempt: number) => number;
  /** Silence after the last partial transcript before we commit by hand. */
  turnTimeoutMs?: number;
  setTimer?: (fn: () => void, ms: number) => unknown;
  clearTimer?: (handle: unknown) => void;
  log?: (line: string) => void;
}

/** Errors that reconnecting will not fix. */
const FATAL = new Set(['auth_error', 'unaccepted_terms', 'quota_exceeded', 'invalid_request', 'input_error']);
/** Server errors where a fresh connection is the fix. Others (e.g. a quiet chunk) are just logged. */
const RECONNECT = new Set(['rate_limited', 'queue_overflow', 'resource_exhausted', 'session_time_limit_exceeded', 'transcriber_error', 'error']);
const CONNECT_TIMEOUT_MS = 8_000;
const FRIENDLY_FATAL: Record<string, string> = {
  auth_error: 'ElevenLabs rejected the API key',
  unaccepted_terms: 'The ElevenLabs account has not accepted its terms yet',
  quota_exceeded: 'The ElevenLabs quota is used up',
  invalid_request: 'ElevenLabs could not accept the voice request',
  input_error: 'ElevenLabs could not read the audio'
};

export class ElevenLabsStt implements SttProvider {
  readonly name = 'elevenlabs';
  constructor(private readonly opts: ElevenLabsSttOptions) {
    if (!opts.apiKey) throw new Error('ElevenLabs API key is required');
  }

  async start(handlers: SttHandlers): Promise<SttSession> {
    return new SttConnection(this.opts, handlers).open();
  }
}

class SttConnection implements SttSession {
  private socket: SocketLike | null = null;
  private ready = false;
  private closed = false;
  private failures = 0;
  private turnTimer: unknown = null;
  private connectTimer: unknown = null;
  private pendingPartial = false;
  private readonly setTimer: (fn: () => void, ms: number) => unknown;
  private readonly clearTimer: (handle: unknown) => void;

  constructor(
    private readonly opts: ElevenLabsSttOptions,
    private readonly handlers: SttHandlers
  ) {
    this.setTimer = opts.setTimer ?? ((fn, ms) => setTimeout(fn, ms));
    this.clearTimer = opts.clearTimer ?? ((h) => clearTimeout(h as ReturnType<typeof setTimeout>));
  }

  open(): this {
    this.connect();
    return this;
  }

  write(pcm: Uint8Array): void {
    if (!this.ready || !this.socket) return; // audio while reconnecting is dropped
    this.send({
      message_type: 'input_audio_chunk',
      audio_base_64: Buffer.from(pcm.buffer, pcm.byteOffset, pcm.byteLength).toString('base64'),
      commit: false,
      sample_rate: SAMPLE_RATE
    });
  }

  close(): void {
    if (this.closed) return;
    this.closed = true;
    this.clearTurnTimer();
    this.clearConnectTimer();
    this.detach();
    this.handlers.onStatus?.('closed');
  }

  // ---- Connection ----------------------------------------------------------------------

  private connect(): void {
    if (this.closed) return;
    this.handlers.onStatus?.(this.failures === 0 ? 'connecting' : 'reconnecting');
    const { apiKey, model, baseUrl } = this.opts;
    const base = (baseUrl ?? 'wss://api.elevenlabs.io').replace(/\/$/, '');
    const query = new URLSearchParams({
      model_id: model || DEFAULT_STT_MODEL,
      audio_format: 'pcm_16000',
      commit_strategy: 'vad'
    });
    let socket: SocketLike;
    try {
      socket = this.opts.socketFactory(`${base}/v1/speech-to-text/realtime?${query}`, { 'xi-api-key': apiKey });
    } catch (error) {
      this.opts.log?.(`[stt] could not open socket: ${(error as Error).message}`);
      this.lost();
      return;
    }
    this.socket = socket;
    this.ready = false;
    // A socket that never reports session_started counts as a failed attempt
    this.connectTimer = this.setTimer(() => {
      this.connectTimer = null;
      if (this.socket === socket && !this.ready) this.lost();
    }, CONNECT_TIMEOUT_MS);
    socket.onmessage = (ev) => this.onMessage(ev.data);
    socket.onclose = () => {
      if (this.socket === socket) this.lost();
    };
    socket.onerror = () => {
      // 'close' follows; reconnect logic lives there
      this.opts.log?.('[stt] socket error');
    };
  }

  private detach(): void {
    const socket = this.socket;
    this.socket = null;
    this.ready = false;
    if (!socket) return;
    socket.onopen = socket.onmessage = socket.onclose = socket.onerror = null;
    try {
      socket.close();
    } catch {
      /* already closed */
    }
  }

  /** The connection dropped or never opened. */
  private lost(): void {
    if (this.closed) return;
    this.detach();
    this.clearTurnTimer();
    this.clearConnectTimer();
    this.failures++;
    if (this.failures > MAX_RECONNECTS) {
      this.closed = true;
      this.handlers.onStatus?.('closed');
      this.handlers.onError(new Error('Speech recognition connection failed after 3 reconnect attempts'));
      return;
    }
    const delay = this.opts.backoffMs?.(this.failures) ?? 400 * 2 ** (this.failures - 1);
    this.setTimer(() => this.connect(), delay);
  }

  // ---- Messages ------------------------------------------------------------------------

  private onMessage(raw: unknown): void {
    let message: { message_type?: string; text?: string; error?: string; warning?: string };
    try {
      message = JSON.parse(typeof raw === 'string' ? raw : Buffer.from(raw as ArrayBuffer).toString('utf8'));
    } catch {
      return;
    }
    const type = message.message_type ?? '';
    switch (type) {
      case 'session_started':
        this.clearConnectTimer();
        this.ready = true;
        this.failures = 0;
        this.handlers.onStatus?.('live');
        return;
      case 'partial_transcript': {
        const text = (message.text ?? '').trim();
        if (!text) return;
        this.handlers.onPartial?.(text);
        this.pendingPartial = true;
        this.armTurnTimer();
        return;
      }
      case 'committed_transcript': {
        this.clearTurnTimer();
        this.pendingPartial = false;
        const text = (message.text ?? '').trim();
        if (text) this.handlers.onTranscript(text);
        return;
      }
      case 'warning':
        this.opts.log?.(`[stt] warning: ${(message.warning ?? '').slice(0, 120)}`);
        return;
      default:
        if (FATAL.has(type)) {
          this.closed = true;
          this.clearTurnTimer();
          this.clearConnectTimer();
          this.detach();
          this.handlers.onStatus?.('closed');
          this.handlers.onError(new Error(`${FRIENDLY_FATAL[type] ?? 'Speech recognition failed'} (${type})`));
        } else if (RECONNECT.has(type)) {
          // Transient server-side trouble: drop the socket and reconnect
          this.opts.log?.(`[stt] server reported ${type}; reconnecting`);
          this.lost();
        }
    }
  }

  private send(payload: Record<string, unknown>): void {
    try {
      this.socket?.send(JSON.stringify(payload));
    } catch (error) {
      this.opts.log?.(`[stt] send failed: ${(error as Error).message}`);
    }
  }

  /** Fallback end-of-turn: partial text but no commit from the server for a while. */
  private armTurnTimer(): void {
    this.clearTurnTimer();
    this.turnTimer = this.setTimer(() => {
      this.turnTimer = null;
      if (this.pendingPartial && this.ready) {
        this.pendingPartial = false;
        this.send({ message_type: 'input_audio_chunk', audio_base_64: '', commit: true, sample_rate: SAMPLE_RATE });
      }
    }, this.opts.turnTimeoutMs ?? 1500);
  }

  private clearConnectTimer(): void {
    if (this.connectTimer !== null) this.clearTimer(this.connectTimer);
    this.connectTimer = null;
  }

  private clearTurnTimer(): void {
    if (this.turnTimer !== null) this.clearTimer(this.turnTimer);
    this.turnTimer = null;
  }
}
