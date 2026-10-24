import { createHash } from 'crypto';
import type { PageSummary, StruggleSignal } from '@wolfie/shared';
import type { CaptureResult } from '../hints/capture.js';
import type { LlmCall } from '../llm/client.js';
import { parseImageDataUrl } from '../llm/data-url.js';
import { renderPrompt } from '../llm/prompts/index.js';
import { LLMError } from '../llm/provider.js';
import type { EventType } from '../events.js';
import type { SessionMemory } from './memory.js';
import type { ProbeResult } from './browser-probe.js';
import type { FrontWindow } from './front-window.js';
import { ObservationSchema, type Observation } from './types.js';

// The Watch-mode watcher (WATCH_MODE.md §3.1): every few seconds while watching, it looks at the
// active window (a small JPEG, the page summary, app/title/URL), asks a fast model what the
// student is doing, records that in session memory, and turns "stuck" / "wrong answer" judgments
// into struggle signals for the existing escalation engine. Frames are never stored.
//
// Which window: the native helper names the frontmost window (by id, so the capture is exactly
// that window). For browsers, the browser itself says whether the window is incognito and which
// site it shows; without that (other browsers, or Automation denied) the extension's tab report
// must match the window title, otherwise nothing is captured.

/** Re-look at an unchanged screen this often, so long pauses are still noticed. */
export const UNCHANGED_RECHECK_MS = 60_000;
/** Time credited to a source per observation is capped (the Mac may have slept). */
const MAX_CREDIT_MS = 60_000;
/** A page summary older than this is not sent. */
const SUMMARY_MAX_AGE_MS = 30_000;
/** Strong "stuck" needs this confidence; weak needs WEAK_STUCK and two looks in a row. */
export const STRONG_STUCK = 0.75;
export const WEAK_STUCK = 0.5;
/** No keyboard/mouse input for this long: the student is away, so nothing is looked at. */
export const AWAY_SECONDS = 10 * 60;
/** Activities where "stuck" means something; browsing or "other" never raises a stuck signal. */
const STUDY_ACTIVITIES = new Set<Observation['activity']>(['reading_paper', 'watching_video', 'homework', 'coding', 'writing']);

/** The observation shows a real study task (not browsing, not an unrelated app). */
export function isStudying(obs: Observation): boolean {
  return obs.mode !== 'other' && STUDY_ACTIVITIES.has(obs.activity);
}

export type WatcherState = 'idle' | 'watching' | 'skipping' | 'away' | 'no_permission' | 'limit_reached' | 'error';

/** Why the last look was skipped, for the status note. */
export type SkipReason =
  | 'no_window'
  | 'excluded_app'
  | 'private_window'
  | 'excluded_site'
  | 'unknown_tab'
  | 'browser_access_denied'
  | 'unsupported_browser';

/** The window a look is about. */
export interface WatchTarget {
  app: string;
  windowId: number;
  title: string | null;
  isBrowser: boolean;
  domain: string | null;
  contentUrl: string | null;
}

export interface WatcherDeps {
  now: () => number;
  /** Watch mode enabled + consented, a session running, not paused. */
  isActive: () => boolean;
  intervalMs: () => number;
  /** Seconds since the last keyboard/mouse input (powerMonitor.getSystemIdleTime). */
  idleSeconds: () => number;
  /** Native helper: the frontmost app's frontmost window. */
  frontWindow: () => Promise<FrontWindow | null>;
  /** Wolfie's own process (its windows are never looked at). */
  selfPid: number;
  /** Any web browser, scriptable or not (Safari, Firefox included). */
  isBrowser: (app: string) => boolean;
  /** The browser's own answer about its front window (incognito? which site?). */
  probeBrowser: (app: string) => Promise<ProbeResult>;
  /** Extension fallback: the reported tab, only if it matches this window title; else null. */
  tabReport: (windowTitle: string | null) => { domain: string; contentUrl: string | null } | null;
  isExcludedApp: (appName: string) => boolean;
  isExcludedDomain: (domain: string) => boolean;
  getPageSummary: () => PageSummary | null;
  /** A small JPEG of exactly this window (no confirmation: consent was given for Watch mode). */
  capture: (windowId: number) => Promise<CaptureResult>;
  llm: () => { generate<T>(call: LlmCall<T>): Promise<T> };
  memory: SessionMemory;
  emitSignal: (signal: StruggleSignal) => void;
  /** A paper or video URL came into view (enrichment). */
  onContentUrl: (url: string) => void;
  onState?: (state: WatcherState) => void;
  log: (type: EventType, payload: Record<string, unknown>) => void;
}

export class Watcher {
  private timer: ReturnType<typeof setTimeout> | null = null;
  private running = false;
  /** Bumped by every start(), so a tick that outlives a stop/start cannot keep an old loop going. */
  private loopToken = 0;
  /** Bumped by stop() and reset(): a look that finishes after either is discarded. */
  private generation = 0;
  private busy = false;
  private lastKey: string | null = null;
  private lastCallAt: number | null = null;
  private unchangedSince: number | null = null;
  private lastRecordAt: number | null = null;
  private weakStreak = 0;
  private flaggedAnswers = new Set<string>();
  private state: WatcherState = 'idle';
  private skipReason: SkipReason | null = null;
  /** The newest frame, kept in memory briefly for questions asked right after (never written). */
  private frame: { dataUrl: string; ts: number } | null = null;
  private frameWindow: number | null = null;

  constructor(private readonly deps: WatcherDeps) {}

  start(): void {
    if (this.running) return;
    this.running = true;
    this.schedule(0, ++this.loopToken);
  }

  stop(): void {
    this.running = false;
    this.loopToken++;
    this.generation++;
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
    this.frame = null;
    this.frameWindow = null;
    this.setState('idle');
  }

  getState(): WatcherState {
    return this.state;
  }

  /** Why the last look was skipped (null unless the state is 'skipping'). */
  getSkipReason(): SkipReason | null {
    return this.state === 'skipping' ? this.skipReason : null;
  }

  /** The latest frame if it is at most `maxAgeMs` old. */
  latestFrame(maxAgeMs: number): string | null {
    if (!this.frame || this.deps.now() - this.frame.ts > maxAgeMs) return null;
    return this.frame.dataUrl;
  }

  /**
   * A frame for a question asked right now: the newest one if fresh, else a new capture. Same
   * rules as watching: nothing when inactive, excluded or private.
   */
  async captureNow(maxAgeMs: number): Promise<string | null> {
    const { deps } = this;
    if (!deps.isActive()) return null;
    const recent = this.latestFrame(maxAgeMs);
    const generation = this.generation;
    const resolved = await this.resolveTarget();
    if (!resolved.ok || generation !== this.generation) return null;
    // A fresh frame is reused only if the same window is still in front
    if (recent && this.frameWindow === resolved.target.windowId) return recent;
    const shot = await deps.capture(resolved.target.windowId);
    if (!shot.ok || !deps.isActive() || generation !== this.generation) return null;
    this.frame = { dataUrl: shot.dataUrl, ts: deps.now() };
    this.frameWindow = resolved.target.windowId;
    return shot.dataUrl;
  }

  /** Decides what may be looked at right now. Every "no" drops the stored frame. */
  private async resolveTarget(): Promise<{ ok: true; target: WatchTarget } | { ok: false; state: WatcherState; reason?: SkipReason }> {
    const { deps } = this;
    if (deps.idleSeconds() >= AWAY_SECONDS) return { ok: false, state: 'away' };
    const front = await deps.frontWindow();
    if (!front || front.windowId === null || front.pid === deps.selfPid) return { ok: false, state: 'skipping', reason: 'no_window' };
    if (deps.isExcludedApp(front.app)) return { ok: false, state: 'skipping', reason: 'excluded_app' };
    const base = { app: front.app, windowId: front.windowId, title: front.title };
    if (!deps.isBrowser(front.app)) {
      return { ok: true, target: { ...base, isBrowser: false, domain: null, contentUrl: null } };
    }

    const probe = await deps.probeBrowser(front.app);
    if (probe.ok) {
      const { tab } = probe;
      if (tab.incognito) return { ok: false, state: 'skipping', reason: 'private_window' };
      if (!tab.host) return { ok: false, state: 'skipping', reason: 'unknown_tab' };
      if (deps.isExcludedDomain(tab.host)) return { ok: false, state: 'skipping', reason: 'excluded_site' };
      return { ok: true, target: { ...base, title: tab.title ?? front.title, isBrowser: true, domain: tab.host, contentUrl: tab.contentUrl } };
    }
    // The browser couldn't be asked: trust the extension only if its tab matches this window
    const report = deps.tabReport(front.title);
    if (!report) {
      const reason: SkipReason =
        probe.reason === 'denied' ? 'browser_access_denied' : probe.reason === 'unsupported' ? 'unsupported_browser' : 'unknown_tab';
      return { ok: false, state: 'skipping', reason };
    }
    if (deps.isExcludedDomain(report.domain)) return { ok: false, state: 'skipping', reason: 'excluded_site' };
    return { ok: true, target: { ...base, isBrowser: true, domain: report.domain, contentUrl: report.contentUrl } };
  }

  /** New session (or memory cleared): forget per-session state. */
  reset(): void {
    this.generation++;
    this.lastKey = null;
    this.lastCallAt = null;
    this.unchangedSince = null;
    this.lastRecordAt = null;
    this.weakStreak = 0;
    this.flaggedAnswers.clear();
    this.frame = null;
  }

  private schedule(delayMs: number, token: number): void {
    if (!this.running || token !== this.loopToken) return;
    this.timer = setTimeout(() => {
      this.timer = null;
      void this.tick().finally(() => this.schedule(Math.max(1000, this.deps.intervalMs()), token));
    }, delayMs);
  }

  private setState(state: WatcherState): void {
    if (state === this.state) return;
    this.state = state;
    this.deps.onState?.(state);
  }

  /** One look. Public for tests; the timer calls it every interval. */
  async tick(): Promise<void> {
    const { deps } = this;
    if (this.busy) return;
    if (!deps.isActive()) {
      this.frame = null;
      this.setState('idle');
      return;
    }
    this.busy = true;
    const generation = this.generation;
    // Stopped, cleared or reset while we waited: drop whatever this look produced
    const stale = () => generation !== this.generation || !deps.isActive();
    try {
      const resolved = await this.resolveTarget();
      if (stale()) return;
      if (!resolved.ok) {
        // Private, excluded, unknown, or the student is away: no capture, and drop the last frame
        this.frame = null;
        this.skipReason = resolved.reason ?? null;
        this.setState(resolved.state);
        return;
      }
      const fg = resolved.target;
      if (fg.contentUrl) deps.onContentUrl(fg.contentUrl);
      const shot = await deps.capture(fg.windowId);
      if (stale()) return;
      if (!shot.ok) {
        this.frame = null;
        // 'empty': the window couldn't be captured; the whole screen is never sent instead
        this.skipReason = 'no_window';
        this.setState(shot.reason === 'permission' ? 'no_permission' : shot.reason === 'empty' ? 'skipping' : 'error');
        return;
      }
      const now = deps.now();
      this.frame = { dataUrl: shot.dataUrl, ts: now };
      this.frameWindow = fg.windowId;

      const key = changeKey(fg, shot.dataUrl);
      if (key === this.lastKey) {
        this.unchangedSince ??= now;
        if (this.lastCallAt !== null && now - this.lastCallAt < UNCHANGED_RECHECK_MS) {
          this.setState('watching');
          return;
        }
      } else {
        this.lastKey = key;
        this.unchangedSince = null;
      }

      const obs = await this.observe(fg, shot.dataUrl, now);
      if (stale()) return;
      this.lastCallAt = now;
      const elapsed = this.lastRecordAt === null ? 0 : Math.min(MAX_CREDIT_MS, now - this.lastRecordAt);
      this.lastRecordAt = now;
      deps.memory.record(obs, {
        ts: now,
        appName: fg.app,
        windowTitle: fg.title,
        contentUrl: fg.contentUrl,
        elapsedMs: elapsed
      });
      this.emitSignals(obs, now);
      deps.log('watch.observed', { activity: obs.activity, mode: obs.mode, stuck: obs.stuck.likely });
      this.setState('watching');
    } catch (error) {
      if (stale()) return; // stopped meanwhile: stay idle
      if (error instanceof LLMError && error.code === 'DAILY_CAP') this.setState('limit_reached');
      else {
        console.error('[watch] observe failed:', (error as Error).message);
        this.setState('error');
      }
    } finally {
      this.busy = false;
    }
  }

  private async observe(fg: WatchTarget, dataUrl: string, now: number): Promise<Observation> {
    const { deps } = this;
    const summary = deps.getPageSummary();
    const page =
      summary && fg.isBrowser && summary.domain === fg.domain && now - summary.timestamp <= SUMMARY_MAX_AGE_MS
        ? summary
        : null;
    const latest = deps.memory.latest();
    const input = {
      app: fg.app,
      window_title: fg.title,
      site: fg.domain,
      content_url: fg.contentUrl,
      page_title: page?.title,
      headings: page?.headings.slice(0, 10),
      page_text: page?.visibleText.slice(0, 1500),
      problem: page?.problemRegion,
      errors: page?.errorMessages.slice(0, 5),
      seconds_unchanged: this.unchangedSince === null ? 0 : Math.round((now - this.unchangedSince) / 1000),
      previous: latest ? { subject: latest.obs.subject, summary: latest.obs.summary, mode: latest.obs.mode } : null
    };
    return deps.llm().generate({
      task: 'watch_observe',
      system: renderPrompt('watch-observe.v1'),
      messages: [{ role: 'user', content: JSON.stringify(input) }],
      images: [parseImageDataUrl(dataUrl)],
      schema: ObservationSchema,
      mockKey: {
        appName: fg.app,
        title: page?.title ?? fg.title,
        domain: fg.domain,
        contentUrl: fg.contentUrl,
        problemId: page?.problemId ?? null
      },
      temperature: 0.2
    });
  }

  private emitSignals(obs: Observation, now: number): void {
    const { deps } = this;
    const check = obs.answer_check;
    if (obs.mode === 'homework' && check?.looks_correct === false && check.visible_answer) {
      const answerKey = check.visible_answer.trim().toLowerCase();
      if (!this.flaggedAnswers.has(answerKey)) {
        this.flaggedAnswers.add(answerKey);
        deps.emitSignal({
          type: 'answer_seen_wrong',
          strength: 'strong',
          timestamp: now,
          metadata: { source: 'watch' }
        });
      }
    }

    // Only a real study task can be "stuck": browsing or an unrelated app never raises an offer
    const studying = isStudying(obs);
    const { confidence } = obs.stuck;
    const likely = obs.stuck.likely && studying;
    if (likely && confidence >= STRONG_STUCK) {
      this.weakStreak = 0;
      deps.emitSignal({ type: 'model_stuck', strength: 'strong', timestamp: now, metadata: { source: 'watch' } });
    } else if (likely && confidence >= WEAK_STUCK) {
      this.weakStreak += 1;
      // One unsure look is noise; two in a row is a pattern
      if (this.weakStreak >= 2) {
        deps.emitSignal({ type: 'model_stuck', strength: 'weak', timestamp: now, metadata: { source: 'watch' } });
      }
    } else {
      this.weakStreak = 0;
    }
  }
}

/** Same window, same page and the same pixels: nothing new to look at. */
function changeKey(fg: WatchTarget, dataUrl: string): string {
  const hash = createHash('sha1').update(dataUrl).digest('hex');
  return [fg.app, fg.windowId, fg.title ?? '', fg.domain ?? '', fg.contentUrl ?? '', hash].join('|');
}
