import { createHash } from 'crypto';
import type { PageSummary, StruggleSignal } from '@wolfie/shared';
import type { CaptureResult } from '../hints/capture.js';
import type { LlmCall } from '../llm/client.js';
import { parseImageDataUrl } from '../llm/data-url.js';
import { renderPrompt } from '../llm/prompts/index.js';
import { LLMError } from '../llm/provider.js';
import type { EventType } from '../events.js';
import type { SessionMemory } from './memory.js';
import type { BrowserTab, ProbeResult } from './browser-probe.js';
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
/** A look gets this long (lite models sometimes take 20 s+); it is not retried. */
export const OBSERVE_TIMEOUT_MS = 30_000;
/** Minimum time between looks triggered by window/tab switches. */
export const POKE_GAP_MS = 3000;
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
  /** The window or tab changed between checking and capturing: that frame is discarded. */
  | 'window_changed'
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
  /** The helper's window title when the window was chosen (checked again after capturing). */
  titleSeen: string | null;
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
  /** Something new to show: the window being looked at changed, or a look was recorded. */
  onLook?: () => void;
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
  /** The last limit hit was Gemini's own daily quota (not Wolfie's watch.calls_per_day). */
  private quotaExhausted = false;
  /** The browser's last answer for a window, reused while its id and title stay the same. */
  private probeCache: { windowId: number; title: string; tab: BrowserTab; at: number } | null = null;
  /** The newest frame, kept in memory briefly for questions asked right after (never written). */
  private frame: { dataUrl: string; ts: number } | null = null;
  private frameWindow: number | null = null;
  /** The window the latest look is about (shown in the chat before the model answers). */
  private looking: { app: string; title: string | null; windowId: number; since: number } | null = null;
  /** A poke arrived during a look: the next look starts right after it. */
  private poked = false;
  private lastTickAt: number | null = null;

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
    this.looking = null;
    this.setState('idle');
  }

  getState(): WatcherState {
    return this.state;
  }

  /** The window currently being looked at; null while skipping, away or idle. */
  lookingAt(): { app: string; title: string | null; since: number } | null {
    return this.looking ? { app: this.looking.app, title: this.looking.title, since: this.looking.since } : null;
  }

  /** The front app or tab changed: look now instead of waiting for the next interval. */
  poke(): void {
    if (!this.running) return;
    if (this.busy) {
      this.poked = true;
      return;
    }
    if (this.timer) clearTimeout(this.timer);
    // At most one look every POKE_GAP_MS, so flicking through apps doesn't spend a call per window
    const since = this.lastTickAt === null ? Infinity : this.deps.now() - this.lastTickAt;
    this.schedule(Math.max(0, POKE_GAP_MS - since), this.loopToken);
  }

  /** True when watching stopped on Gemini's daily quota rather than Wolfie's own cap. */
  isQuotaExhausted(): boolean {
    return this.state === 'limit_reached' && this.quotaExhausted;
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
    if (!(await this.stillFront(resolved.target))) return null;
    this.frame = { dataUrl: shot.dataUrl, ts: deps.now() };
    this.frameWindow = resolved.target.windowId;
    return shot.dataUrl;
  }

  /** Away: no input for a while, unless the student is watching a video (no input is normal then). */
  private isAway(): boolean {
    if (this.deps.idleSeconds() < AWAY_SECONDS) return false;
    const latest = this.deps.memory.latest();
    const watchingVideo = latest?.obs.activity === 'watching_video' && this.deps.now() - latest.ts <= 3 * 60_000;
    return !watchingVideo;
  }

  /** Asks the browser, reusing the answer while the same window shows the same title (1 min). */
  private async probe(front: FrontWindow): Promise<ProbeResult> {
    const now = this.deps.now();
    const c = this.probeCache;
    if (c && front.title && c.windowId === front.windowId && c.title === front.title && now - c.at < 60_000) {
      return { ok: true, tab: c.tab };
    }
    const result = await this.deps.probeBrowser(front.app);
    this.probeCache =
      result.ok && front.windowId !== null && front.title && titlesMatch(front.title, result.tab.title)
        ? { windowId: front.windowId, title: front.title, tab: result.tab, at: now }
        : null;
    return result;
  }

  /** After capturing: the same window, with the same title, is still in front. */
  private async stillFront(target: WatchTarget): Promise<boolean> {
    const again = await this.deps.frontWindow();
    return !!again && again.windowId === target.windowId && (again.title ?? null) === (target.titleSeen ?? null);
  }

  /** Decides what may be looked at right now. Every "no" drops the stored frame. */
  private async resolveTarget(): Promise<{ ok: true; target: WatchTarget } | { ok: false; state: WatcherState; reason?: SkipReason }> {
    const { deps } = this;
    if (this.isAway()) return { ok: false, state: 'away' };
    const front = await deps.frontWindow();
    if (!front || front.windowId === null || front.pid === deps.selfPid) return { ok: false, state: 'skipping', reason: 'no_window' };
    if (deps.isExcludedApp(front.app)) return { ok: false, state: 'skipping', reason: 'excluded_app' };
    const base = { app: front.app, windowId: front.windowId, title: front.title };
    // Any app that opens web links is a browser, even one we don't know by name (deny by default)
    if (!front.isBrowser && !deps.isBrowser(front.app)) {
      return { ok: true, target: { ...base, titleSeen: front.title, isBrowser: false, domain: null, contentUrl: null } };
    }

    const probe = await this.probe(front);
    if (probe.ok) {
      const { tab } = probe;
      if (tab.incognito) return { ok: false, state: 'skipping', reason: 'private_window' };
      // The browser's front tab must be this very window's tab (titles match), so a window or tab
      // switch between the helper and the probe can't let the wrong window through
      if (!titlesMatch(front.title, tab.title)) return { ok: false, state: 'skipping', reason: 'window_changed' };
      if (!tab.host) return { ok: false, state: 'skipping', reason: 'unknown_tab' };
      if (deps.isExcludedDomain(tab.host)) return { ok: false, state: 'skipping', reason: 'excluded_site' };
      return {
        ok: true,
        target: { ...base, titleSeen: front.title, title: tab.title ?? front.title, isBrowser: true, domain: tab.host, contentUrl: tab.contentUrl }
      };
    }
    // The browser couldn't be asked: trust the extension only if its tab matches this window
    const report = deps.tabReport(front.title);
    if (!report) {
      const reason: SkipReason =
        probe.reason === 'denied' ? 'browser_access_denied' : probe.reason === 'unsupported' ? 'unsupported_browser' : 'unknown_tab';
      return { ok: false, state: 'skipping', reason };
    }
    if (deps.isExcludedDomain(report.domain)) return { ok: false, state: 'skipping', reason: 'excluded_site' };
    return { ok: true, target: { ...base, titleSeen: front.title, isBrowser: true, domain: report.domain, contentUrl: report.contentUrl } };
  }

  /** New session (or memory cleared): forget per-session state. */
  reset(): void {
    this.generation++;
    this.probeCache = null;
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
      void this.tick().finally(() => {
        const soon = this.poked;
        this.poked = false;
        this.schedule(soon ? POKE_GAP_MS : Math.max(1000, this.deps.intervalMs()), token);
      });
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
    this.lastTickAt = deps.now();
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
        if (this.looking) {
          this.looking = null;
          deps.onLook?.();
        }
        this.skipReason = resolved.reason ?? null;
        this.setState(resolved.state);
        return;
      }
      const fg = resolved.target;
      if (this.looking?.windowId !== fg.windowId || this.looking.title !== fg.title) {
        this.looking = { app: fg.app, title: fg.title, windowId: fg.windowId, since: deps.now() };
        deps.onLook?.();
      }
      const shot = await deps.capture(fg.windowId);
      if (stale()) return;
      // The student may have switched window or tab while we captured: then this frame is dropped
      if (shot.ok && !(await this.stillFront(fg))) {
        this.frame = null;
        this.skipReason = 'window_changed';
        this.setState('skipping');
        return;
      }
      if (stale()) return;
      if (fg.contentUrl) deps.onContentUrl(fg.contentUrl);
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
      deps.onLook?.();
    } catch (error) {
      if (stale()) return; // stopped meanwhile: stay idle
      if (error instanceof LLMError && (error.code === 'DAILY_CAP' || error.code === 'QUOTA')) {
        this.skipReason = null;
        this.quotaExhausted = error.code === 'QUOTA';
        this.setState('limit_reached');
      }
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
      previous: latest ? { subject: latest.obs.subject, summary: latest.obs.summary, mode: latest.obs.mode } : null,
      // Earlier sources and their key points (e.g. the original problem), so a mis-copied problem
      // or a mixed-up concept can be noticed in another window
      session_notes: deps.memory.toPromptText(1500, now) || undefined
    };
    return deps.llm().generate({
      task: 'watch_observe',
      system: renderPrompt('watch-observe.v2'),
      messages: [{ role: 'user', content: JSON.stringify(input) }],
      images: [parseImageDataUrl(dataUrl)],
      schema: ObservationSchema,
      // One try with room for slow moments: a retry costs quota, and the next look comes soon anyway
      timeoutMs: OBSERVE_TIMEOUT_MS,
      noRetry: true,
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
    // A wrong answer counts in any study activity (a Doc with written answers, notes, code),
    // not only on a problem-set page
    if (STUDY_ACTIVITIES.has(obs.activity) && check?.looks_correct === false && check.visible_answer) {
      const answerKey = check.visible_answer.trim().toLowerCase();
      if (!this.flaggedAnswers.has(answerKey)) {
        this.flaggedAnswers.add(answerKey);
        deps.emitSignal({
          type: 'answer_seen_wrong',
          strength: 'strong',
          timestamp: now,
          // The short "what is off" goes into the offer text; it never contains the answer
          metadata: { source: 'watch', issue: check.issue ?? undefined }
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

/**
 * The browser's tab title and the OS window title describe the same tab. The window title may add
 * an unread count "(3) " (either side), an audio/camera marker, or " - <browser or profile>".
 */
export function titlesMatch(windowTitle: string | null, tabTitle: string | null): boolean {
  const norm = (t: string) => t.trim().replace(/^\(\d+\)\s+/, '').toLowerCase();
  if (!windowTitle || !tabTitle) return false;
  const win = norm(windowTitle);
  const tab = norm(tabTitle);
  if (!tab) return false;
  if (win === tab) return true;
  if (!win.startsWith(tab)) return false;
  const rest = win.slice(tab.length);
  // audio on/muted, microphone, camera, recording markers (each optionally with VS16)
  return /^(\s*(?:\u{1F50A}|\u{1F507}|\u{1F3A4}|\u{1F4F7}|\u{23FA})\u{FE0F}?)*(\s+[-\u2013\u2014]\s.*)?$/u.test(rest);
}
