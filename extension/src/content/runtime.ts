import type { PageSummary, StruggleSignal } from '@wolfie/shared';
import type { ContentState, RuntimeMessage } from '../lib/messages';
import { adapterFor, type SiteAdapter } from './adapters';
import { classifyFeedback, defaultDetectorConfig, SignalDetectors, SUBMIT_LABEL, type DetectorConfig } from './detectors';
import {
  buildPageSummary,
  collectErrors,
  collectFeedback,
  controlIdFor,
  isDisabledControl,
  makeVisible,
  roleOf,
  summaryDigest,
  textSimilarity,
  type SummaryDeps
} from './summary';

// The content script's brain (A5), free of chrome.* so jsdom tests can drive it. It owns: when to
// send a PageSummary (meaningful change, request, throttled), and the web struggle-signal
// detectors. It does nothing at all unless the background says `reporting` AND `capturePageText`:
// in domain-only mode the page is never read.

export interface RuntimeDeps {
  doc: Document;
  win: Window;
  location(): { href: string; hostname: string; pathname: string };
  summaryDeps: SummaryDeps;
  send(message: RuntimeMessage): void;
  now(): number;
  setTimer(fn: () => void, ms: number): unknown;
  clearTimer(handle: unknown): void;
  config?: DetectorConfig;
  /** Quiet period after the last DOM change before a submit's result is read. */
  settleMs?: number;
  /** Give up waiting for a result after this long. */
  settleMaxMs?: number;
  /** A click that changes nothing within this long counts as a dead click. */
  noEffectMs?: number;
  /** Debounce for DOM changes before a summary is considered. */
  debounceMs?: number;
  /** Minimum gap between automatic summaries. */
  minSendIntervalMs?: number;
}

interface PendingSubmit {
  startedAt: number;
  mutationsAtStart: number;
  beforeText: string;
  timer: unknown;
}

/** A page whose text barely changed (similarity above this) is not a "meaningful change". */
const SIMILAR = 0.8;

export class ContentRuntime {
  private active = false;
  private observer: MutationObserver | null = null;
  private mutations = 0;
  private lastMutationAt = 0;
  private lastSent: PageSummary | null = null;
  private lastSentAt = 0;
  private summaryTimer: unknown = null;
  private pending: PendingSubmit | null = null;
  private noEffectTimers = new Set<unknown>();
  private lastDeadAt = new Map<string, number>();
  private readonly detectors: SignalDetectors;
  private readonly adapter: SiteAdapter | null;
  private readonly listeners: Array<[string, EventListener]> = [];

  constructor(private readonly deps: RuntimeDeps) {
    this.adapter = adapterFor(deps.location().hostname);
    this.detectors = new SignalDetectors({
      now: () => deps.now(),
      emit: (signal) => this.emitSignal(signal),
      config: deps.config ?? defaultDetectorConfig()
    });
  }

  /** From the background: reporting for this tab, and whether page text may be read. */
  setState(state: ContentState): void {
    const shouldRun = state.reporting && state.capturePageText;
    if (shouldRun && !this.active) this.start();
    else if (!shouldRun && this.active) this.stop();
  }

  isActive(): boolean {
    return this.active;
  }

  /** `desk.request_summary`: send a fresh summary now, ignoring the throttle. */
  requestSummary(): void {
    if (!this.active) return;
    this.sendSummary(this.build());
  }

  dispose(): void {
    this.stop();
  }

  // ---- lifecycle ---------------------------------------------------------------------------

  private start(): void {
    const { doc, win } = this.deps;
    this.active = true;
    const Observer = (win as unknown as { MutationObserver: typeof MutationObserver }).MutationObserver;
    this.observer = new Observer(() => this.onMutation());
    this.observer.observe(doc.documentElement, {
      childList: true,
      subtree: true,
      characterData: true,
      attributes: true,
      attributeFilter: ['disabled', 'aria-disabled', 'hidden', 'open', 'aria-hidden', 'class', 'style']
    });
    this.listen('click', (e) => this.onClick(e));
    this.listen('pointerdown', (e) => this.onPointerDown(e));
    this.listen('submit', () => this.beginSubmit());
    this.listen('keydown', (e) => this.onKeyDown(e as KeyboardEvent));
    this.scheduleSummary(0);
  }

  private stop(): void {
    this.active = false;
    this.observer?.disconnect();
    this.observer = null;
    for (const [type, fn] of this.listeners) this.deps.doc.removeEventListener(type, fn, true);
    this.listeners.length = 0;
    this.clear(this.summaryTimer);
    this.summaryTimer = null;
    if (this.pending) this.clear(this.pending.timer);
    this.pending = null;
    for (const t of this.noEffectTimers) this.clear(t);
    this.noEffectTimers.clear();
    this.lastSent = null; // the next start sends a full summary again
  }

  private listen(type: string, fn: EventListener): void {
    this.deps.doc.addEventListener(type, fn, true);
    this.listeners.push([type, fn]);
  }

  private clear(handle: unknown): void {
    if (handle !== null && handle !== undefined) this.deps.clearTimer(handle);
  }

  // ---- summaries ---------------------------------------------------------------------------

  private build(): PageSummary {
    const { doc, summaryDeps } = this.deps;
    const summary = buildPageSummary(doc, this.deps.location(), summaryDeps);
    if (!summary.problemId && this.adapter) summary.problemId = this.adapter.problemId(this.deps.location().pathname);
    return summary;
  }

  private sendSummary(summary: PageSummary): void {
    this.lastSent = summary;
    this.lastSentAt = this.deps.now();
    this.detectors.setProblem(summary.problemId);
    this.deps.send({ type: 'PAGE_SUMMARY', data: summary });
  }

  private onMutation(): void {
    if (!this.active) return;
    this.mutations++;
    this.lastMutationAt = this.deps.now();
    this.scheduleSummary(this.deps.debounceMs ?? 500);
    if (this.pending) this.scheduleSettle();
  }

  private scheduleSummary(delay: number): void {
    if (this.summaryTimer !== null) return;
    this.summaryTimer = this.deps.setTimer(() => {
      this.summaryTimer = null;
      if (!this.active) return;
      const summary = this.build();
      this.detectors.setProblem(summary.problemId);
      if (!this.isMeaningful(summary)) return;
      const wait = (this.deps.minSendIntervalMs ?? 2000) - (this.deps.now() - this.lastSentAt);
      if (this.lastSent && wait > 0) {
        this.scheduleSummary(wait); // too soon: look again once the throttle allows
        return;
      }
      this.sendSummary(summary);
    }, delay);
  }

  private isMeaningful(next: PageSummary): boolean {
    const prev = this.lastSent;
    if (!prev) return true;
    if (summaryDigest(prev) !== summaryDigest(next)) return true;
    return textSimilarity(prev.visibleText, next.visibleText) < SIMILAR;
  }

  // ---- signals -----------------------------------------------------------------------------

  private emitSignal(signal: StruggleSignal): void {
    this.deps.send({ type: 'SIGNAL', signal });
  }

  private isSubmitLike(el: Element): boolean {
    if (el.tagName === 'BUTTON' && (el as HTMLButtonElement).type === 'submit') return true;
    if (el.tagName === 'INPUT' && (el as HTMLInputElement).type === 'submit') return true;
    if (this.adapter?.submitSelectors.some((s) => el.matches(s))) return true;
    if (roleOf(el) !== 'button') return false;
    const label = el.getAttribute('aria-label') ?? el.textContent ?? (el as HTMLInputElement).value ?? '';
    return SUBMIT_LABEL.test(label.replace(/\s+/g, ' ').trim());
  }

  private onKeyDown(e: KeyboardEvent): void {
    if (e.key !== 'Enter' || e.shiftKey) return;
    const t = e.target as Element | null;
    if (t && t.tagName === 'INPUT' && ['text', 'number', 'search', 'email', ''].includes((t as HTMLInputElement).type)) {
      this.beginSubmit();
    }
  }

  private onPointerDown(e: Event): void {
    const target = e.target as Element | null;
    if (!target) return;
    const hit = controlIdFor(this.deps.doc, target, this.deps.summaryDeps);
    if (hit && isDisabledControl(hit.el)) this.deadClick(hit.id);
  }

  private onClick(e: Event): void {
    const target = e.target as Element | null;
    if (!target) return;
    const hit = controlIdFor(this.deps.doc, target, this.deps.summaryDeps);
    if (!hit) return;
    if (isDisabledControl(hit.el)) {
      this.deadClick(hit.id); // aria-disabled controls still receive clicks
      return;
    }
    if (this.isSubmitLike(hit.el)) this.beginSubmit();
    if (roleOf(hit.el) === 'button') this.watchForEffect(hit.id);
  }

  private deadClick(controlId: string): void {
    const now = this.deps.now();
    // pointerdown and click can both report one physical click
    if (now - (this.lastDeadAt.get(controlId) ?? -Infinity) < 100) return;
    this.lastDeadAt.set(controlId, now);
    this.detectors.noteDeadClick(controlId);
  }

  /** A button click is "dead" if nothing in the page changes shortly after it. */
  private watchForEffect(controlId: string): void {
    const before = this.mutations;
    const timer = this.deps.setTimer(() => {
      this.noEffectTimers.delete(timer);
      if (!this.active) return;
      if (this.mutations === before && !this.pending) this.deadClick(controlId);
    }, this.deps.noEffectMs ?? 1000);
    this.noEffectTimers.add(timer);
  }

  // ---- submit results ----------------------------------------------------------------------

  private beginSubmit(): void {
    const before = this.build();
    if (this.pending) this.clear(this.pending.timer);
    this.pending = {
      startedAt: this.deps.now(),
      mutationsAtStart: this.mutations,
      beforeText: before.visibleText,
      timer: null
    };
    this.scheduleSettle();
  }

  /** Wait for the page to go quiet after a submit, then read the result once. */
  private scheduleSettle(): void {
    const p = this.pending;
    if (!p) return;
    this.clear(p.timer);
    const elapsed = this.deps.now() - p.startedAt;
    const maxWait = this.deps.settleMaxMs ?? 3000;
    const wait = Math.min(this.deps.settleMs ?? 400, Math.max(0, maxWait - elapsed));
    p.timer = this.deps.setTimer(() => this.finishSubmit(), wait);
  }

  private finishSubmit(): void {
    const p = this.pending;
    this.pending = null;
    if (!p || !this.active) return;
    // No DOM change at all after the submit means no check happened (a dead click, not a result).
    if (this.mutations === p.mutationsAtStart) return;
    const { doc, summaryDeps } = this.deps;
    const after = this.build();
    const visible = makeVisible(summaryDeps);
    const beforeSentences = new Set(p.beforeText.split(/(?<=[.!?])\s+/));
    const fresh = after.visibleText.split(/(?<=[.!?])\s+/).filter((s) => !beforeSentences.has(s));
    const texts = [...collectFeedback(doc, visible), ...collectErrors(doc, visible), ...fresh];
    this.detectors.setProblem(after.problemId);
    this.detectors.noteResult(classifyFeedback(texts));
  }
}
