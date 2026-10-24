import { createHash } from 'crypto';
import type { PageSummary, StruggleSignal } from '@wolfie/shared';
import type { ForegroundInfo } from '../foreground.js';
import type { CaptureResult } from '../hints/capture.js';
import type { LlmCall } from '../llm/client.js';
import { parseImageDataUrl } from '../llm/data-url.js';
import { renderPrompt } from '../llm/prompts/index.js';
import { LLMError } from '../llm/provider.js';
import type { EventType } from '../events.js';
import type { SessionMemory } from './memory.js';
import { ObservationSchema, type Observation } from './types.js';

// The Watch-mode watcher (WATCH_MODE.md §3.1): every few seconds while watching, it looks at the
// active window (a small JPEG, the page summary, app/title/URL), asks a fast model what the
// student is doing, records that in session memory, and turns "stuck" / "wrong answer" judgments
// into struggle signals for the existing escalation engine. Frames are never stored.

/** Re-look at an unchanged screen this often, so long pauses are still noticed. */
export const UNCHANGED_RECHECK_MS = 60_000;
/** Time credited to a source per observation is capped (the Mac may have slept). */
const MAX_CREDIT_MS = 60_000;
/** A page summary older than this is not sent. */
const SUMMARY_MAX_AGE_MS = 30_000;
/** Strong "stuck" needs this confidence; weak needs WEAK_STUCK and two looks in a row. */
export const STRONG_STUCK = 0.75;
export const WEAK_STUCK = 0.5;

export type WatcherState = 'idle' | 'watching' | 'skipping' | 'no_permission' | 'limit_reached' | 'error';

export interface WatcherDeps {
  now: () => number;
  /** Watch mode enabled + consented, a session running, not paused. */
  isActive: () => boolean;
  intervalMs: () => number;
  getForeground: () => ForegroundInfo | null;
  isExcludedApp: (appName: string) => boolean;
  isExcludedDomain: (domain: string) => boolean;
  getPageSummary: () => PageSummary | null;
  /** A small JPEG of the active window (no confirmation: consent was given for Watch mode). */
  capture: () => Promise<CaptureResult>;
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
  /** The newest frame, kept in memory briefly for questions asked right after (never written). */
  private frame: { dataUrl: string; ts: number } | null = null;

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
    this.setState('idle');
  }

  getState(): WatcherState {
    return this.state;
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
    const fg = deps.getForeground();
    if (!fg || !this.allowed(fg)) return null;
    const recent = this.latestFrame(maxAgeMs);
    if (recent) return recent;
    const generation = this.generation;
    const shot = await deps.capture();
    if (!shot.ok || !deps.isActive() || generation !== this.generation) return null;
    this.frame = { dataUrl: shot.dataUrl, ts: deps.now() };
    return shot.dataUrl;
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
    const fg = deps.getForeground();
    if (!fg || !this.allowed(fg)) {
      // Private or unknown window: no capture, and drop the last frame so it can't be sent later
      this.frame = null;
      this.setState('skipping');
      return;
    }
    if (fg.contentUrl) deps.onContentUrl(fg.contentUrl);

    this.busy = true;
    const generation = this.generation;
    // Stopped, cleared or reset while we waited: drop whatever this look produced
    const stale = () => generation !== this.generation || !deps.isActive();
    try {
      const shot = await deps.capture();
      if (stale()) return;
      if (!shot.ok) {
        this.frame = null;
        // 'empty': the active window couldn't be matched; the whole screen is never sent instead
        this.setState(shot.reason === 'permission' ? 'no_permission' : shot.reason === 'empty' ? 'skipping' : 'error');
        return;
      }
      const now = deps.now();
      this.frame = { dataUrl: shot.dataUrl, ts: now };

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
        appName: fg.appName,
        windowTitle: fg.windowTitle,
        contentUrl: fg.contentUrl,
        elapsedMs: elapsed
      });
      this.emitSignals(obs, now);
      deps.log('watch.observed', { activity: obs.activity, mode: obs.mode, stuck: obs.stuck.likely });
      this.setState('watching');
    } catch (error) {
      if (error instanceof LLMError && error.code === 'DAILY_CAP') this.setState('limit_reached');
      else {
        console.error('[watch] observe failed:', (error as Error).message);
        this.setState('error');
      }
    } finally {
      this.busy = false;
    }
  }

  private allowed(fg: ForegroundInfo): boolean {
    if (this.deps.isExcludedApp(fg.appName)) return false;
    if (fg.isBrowser) {
      // Without a tab report we can't tell an excluded or private page from a normal one
      if (!fg.domain) return false;
      if (this.deps.isExcludedDomain(fg.domain)) return false;
    }
    return true;
  }

  private async observe(fg: ForegroundInfo, dataUrl: string, now: number): Promise<Observation> {
    const { deps } = this;
    const summary = deps.getPageSummary();
    const page =
      summary && fg.isBrowser && summary.domain === fg.domain && now - summary.timestamp <= SUMMARY_MAX_AGE_MS
        ? summary
        : null;
    const latest = deps.memory.latest();
    const input = {
      app: fg.appName,
      window_title: fg.windowTitle,
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
        appName: fg.appName,
        title: page?.title ?? fg.windowTitle,
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

    const { likely, confidence } = obs.stuck;
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
function changeKey(fg: ForegroundInfo, dataUrl: string): string {
  const hash = createHash('sha1').update(dataUrl).digest('hex');
  return [fg.appName, fg.windowTitle ?? '', fg.domain ?? '', fg.contentUrl ?? '', hash].join('|');
}
