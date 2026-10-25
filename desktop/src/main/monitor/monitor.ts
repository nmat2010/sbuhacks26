import type Database from 'better-sqlite3';
import type { PermissionState } from '../../common/ipc-sensing.js';
import { TypedEmitter } from '../typed-emitter.js';
import { isBrowserApp } from './browsers.js';
import { WindowSourceError, type WindowInfo, type WindowSource } from './window-source.js';

// Session monitor (SPEC Phase 2): polls the active window every 2 s during a session and writes
// `app_events` rows only when the app, title, tab domain or idle flag changes. Everything OS- or
// Electron-specific is injected, so this runs under plain Node in tests.

/**
 * app_events marker row written when monitoring is paused. Time between a pause marker and the
 * next row is "paused" time: history and streak code must not count it as work. A session's
 * last row ends at sessions.ended_at.
 */
export const PAUSED_APP = '(paused)';

/** A gap between polls longer than this means the computer slept. */
const SLEEP_GAP_MS = 30_000;

export interface ForegroundSnapshot {
  sessionId: string;
  ts: number;
  appName: string;
  /** null when title capture is off or the title is unavailable. */
  windowTitle: string | null;
  /** Active tab domain from the extension; only set while a browser is frontmost. */
  domain: string | null;
  isBrowser: boolean;
  isIdle: boolean;
  idleSeconds: number;
}

export interface MonitorSettings {
  captureTitles(): boolean;
  idleTimeoutSeconds(): number;
  /** App name that auto-starts a session when it comes to the front, or null. */
  autoStartApp(): string | null;
}

export interface MonitorDeps {
  source: WindowSource;
  db: () => Database.Database;
  now: () => number;
  getSession: () => { id: string } | null;
  isPaused: () => boolean;
  getIdleSeconds: () => number;
  /** Current tab domain reported by the extension (A2); null if none. */
  getDomain: () => string | null;
  settings: MonitorSettings;
  startSession: () => void;
  /**
   * True when the frontmost window is Wolfie itself (overlay, dashboard, dialogs). Those polls
   * are skipped, so clicking Wolfie is not an app switch: no row, no context-switch signal, and
   * the browser keeps counting as frontmost for the extension.
   */
  isSelf?: (info: WindowInfo) => boolean;
}

export class Monitor {
  readonly events = new TypedEmitter<{
    /** App, title, domain or idle flag changed (a row was written). */
    foreground: [snapshot: ForegroundSnapshot];
    /** Every successful poll while a session is running and unpaused. */
    tick: [snapshot: ForegroundSnapshot];
    permission: [automation: PermissionState];
  }>();

  private timer: ReturnType<typeof setInterval> | null = null;
  private busy = false;
  private rerun = false;
  private lastSessionId: string | null = null;
  private lastKey: string | null = null;
  private last: ForegroundSnapshot | null = null;
  /** The last successful poll found one of Wolfie's own windows in front. */
  private selfFront = false;
  private pauseMarked = false;
  private lastPollAt: number | null = null;
  private studyAppFront = false;
  private automation: PermissionState = 'unknown';

  constructor(private readonly deps: MonitorDeps) {}

  start(intervalMs = 2000): void {
    if (this.timer) return;
    this.timer = setInterval(() => void this.tick(), intervalMs);
    void this.tick();
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  getAutomationState(): PermissionState {
    return this.automation;
  }

  /** Wolfie itself (overlay, dashboard, dialogs) was in front at the last poll. */
  isSelfFront(): boolean {
    return this.selfFront;
  }

  getLast(): ForegroundSnapshot | null {
    return this.last;
  }

  /** Poll now (session start, extension tab report) instead of waiting for the next interval. */
  poke(): Promise<void> {
    return this.tick();
  }

  async tick(): Promise<void> {
    if (this.busy) {
      this.rerun = true;
      return;
    }
    this.busy = true;
    try {
      do {
        this.rerun = false;
        await this.poll();
      } while (this.rerun);
    } catch (error) {
      console.error('[monitor] poll failed:', error instanceof Error ? error.message : error);
    } finally {
      this.busy = false;
    }
  }

  private setAutomation(state: PermissionState): void {
    if (state === this.automation) return;
    this.automation = state;
    this.events.emit('permission', state);
  }

  private async readWindow(includeTitle: boolean) {
    try {
      const info = await this.deps.source.getActiveWindow({ includeTitle });
      this.setAutomation('granted');
      return info;
    } catch (error) {
      if (error instanceof WindowSourceError && error.kind === 'automation_denied') this.setAutomation('denied');
      return null;
    }
  }

  private async poll(): Promise<void> {
    const { deps } = this;
    const paused = deps.isPaused();
    let session = deps.getSession();

    if (!session) {
      this.resetForNoSession();
      await this.maybeAutoStart(paused);
      session = deps.getSession();
      if (!session) return;
    }

    if (session.id !== this.lastSessionId) {
      this.lastSessionId = session.id;
      this.lastKey = null;
      this.last = null;
      this.pauseMarked = false;
    }

    if (paused) {
      this.selfFront = false;
      if (!this.pauseMarked) {
        this.pauseMarked = true;
        this.lastKey = null;
        this.last = null;
        this.insert(session.id, deps.now(), PAUSED_APP, null, null, false);
      }
      return;
    }
    this.pauseMarked = false;

    const includeTitle = deps.settings.captureTitles();
    const info = await this.readWindow(includeTitle);
    if (!info) {
      this.selfFront = false;
      return;
    }
    // The session may have ended or paused while osascript ran.
    if (deps.getSession()?.id !== session.id || deps.isPaused()) return;
    this.selfFront = !!deps.isSelf?.(info);
    if (this.selfFront) {
      // Still a poll, so a long stretch on Wolfie's own window is not mistaken for sleep.
      this.markSleepGap(session.id, deps.now());
      return;
    }

    const study = deps.settings.autoStartApp();
    this.studyAppFront = !!study && info.appName.trim().toLowerCase() === study.trim().toLowerCase();

    const idleSeconds = deps.getIdleSeconds();
    const isIdle = idleSeconds >= deps.settings.idleTimeoutSeconds();
    this.markSleepGap(session.id, deps.now());
    const isBrowser = isBrowserApp(info.appName);
    const snapshot: ForegroundSnapshot = {
      sessionId: session.id,
      ts: deps.now(),
      appName: info.appName,
      windowTitle: includeTitle ? info.windowTitle : null,
      domain: isBrowser ? deps.getDomain() : null,
      isBrowser,
      isIdle,
      idleSeconds
    };
    this.last = snapshot;

    const key = JSON.stringify([snapshot.appName, snapshot.windowTitle, snapshot.domain, snapshot.isIdle]);
    if (key !== this.lastKey) {
      this.lastKey = key;
      this.insert(session.id, snapshot.ts, snapshot.appName, snapshot.windowTitle, snapshot.domain, snapshot.isIdle);
      this.events.emit('foreground', snapshot);
    }
    this.events.emit('tick', snapshot);
  }

  /**
   * The Mac slept (or the app was suspended) between two polls: nothing was written for that
   * stretch, so it would be counted as the previous window's time. Close it as idle instead.
   */
  private markSleepGap(sessionId: string, now: number): void {
    const prev = this.lastPollAt;
    this.lastPollAt = now;
    const last = this.last;
    if (prev === null || !last || last.sessionId !== sessionId || now - prev <= SLEEP_GAP_MS || last.isIdle) return;
    this.insert(sessionId, prev + 1000, last.appName, last.windowTitle, last.domain, true);
    this.lastKey = JSON.stringify([last.appName, last.windowTitle, last.domain, true]);
  }

  /** Not in a session: forget per-session state so the next session writes a fresh first row. */
  private resetForNoSession(): void {
    this.selfFront = false;
    this.lastSessionId = null;
    this.lastKey = null;
    this.last = null;
    this.pauseMarked = false;
    this.lastPollAt = null;
  }

  private async maybeAutoStart(paused: boolean): Promise<void> {
    const study = this.deps.settings.autoStartApp();
    if (!study) {
      this.studyAppFront = false;
      return;
    }
    if (paused) return;
    // Only the app name is read here, and nothing is stored until a session starts.
    const info = await this.readWindow(false);
    const front = !!info && info.appName.trim().toLowerCase() === study.trim().toLowerCase();
    // Start on the transition to the study app, so stopping a session by hand sticks.
    if (front && !this.studyAppFront) this.deps.startSession();
    this.studyAppFront = front;
  }

  private insert(
    sessionId: string,
    ts: number,
    appName: string,
    title: string | null,
    domain: string | null,
    isIdle: boolean
  ): void {
    try {
      this.deps
        .db()
        .prepare(
          'INSERT INTO app_events (session_id, ts, app_name, window_title, url_domain, is_idle) VALUES (?, ?, ?, ?, ?, ?)'
        )
        .run(sessionId, ts, appName, title, domain, isIdle ? 1 : 0);
    } catch (error) {
      console.error('[monitor] failed to write app_event:', error instanceof Error ? error.message : error);
    }
  }
}
