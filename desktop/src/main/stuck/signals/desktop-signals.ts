import type { StruggleSignal } from '@wolfie/shared';
import type { ForegroundSnapshot } from '../../monitor/monitor.js';

// Desktop-side struggle signals (SPEC 4b, A6), computed from the monitor's snapshots:
//   context_switch_loop (weak): 3+ rapid switches between a work window and the same other
//                               window within 2 min
//   idle_on_work (weak):        the same work window focused with no input for N minutes
//   long_on_problem (weak):     N minutes of focused, non-idle time on one problem
// Pure and clock-injected. Thresholds come from settings via getConfig().

export interface SignalConfig {
  contextSwitchCount: number;
  contextSwitchWindowSec: number;
  idleMinutes: number;
  longProblemMinutes: number;
}

export type WindowClass = 'work' | 'other';

export interface DesktopSignalDeps {
  now(): number;
  emit(signal: StruggleSignal): void;
  getConfig(): SignalConfig;
  /** 'other' for AI tools and distractions (they have their own warnings), else 'work'. */
  classify(snapshot: ForegroundSnapshot): WindowClass;
}

/** How often a persisting condition (idle, long on problem) re-emits to keep the signal alive. */
const REEMIT_MS = 60_000;
/** A tick gap longer than this (sleep, pause) does not count as focused time. */
const MAX_TICK_GAP_MS = 5_000;

export function windowKey(s: Pick<ForegroundSnapshot, 'appName' | 'domain' | 'isBrowser'>): string {
  return s.isBrowser && s.domain ? `web:${s.domain.toLowerCase()}` : `app:${s.appName.toLowerCase()}`;
}

interface Visit {
  key: string;
  at: number;
  cls: WindowClass;
}

export class DesktopSignalDetector {
  private visits: Visit[] = [];
  private lastTickAt: number | null = null;
  private lastIdleEmitAt = -Infinity;
  private problem: { id: string; domain: string | null; focusedMs: number; lastEmitAt: number } | null = null;

  constructor(private readonly deps: DesktopSignalDeps) {}

  /** New session or monitoring resumed after a long gap: forget everything. */
  reset(): void {
    this.visits = [];
    this.lastTickAt = null;
    this.lastIdleEmitAt = -Infinity;
    this.problem = null;
  }

  /** From stuckBus 'problem-changed'. `snapshot` is the monitor's latest, to learn the page's domain. */
  handleProblem(problemId: string | null, snapshot: ForegroundSnapshot | null): void {
    this.problem = problemId
      ? { id: problemId, domain: snapshot?.domain?.toLowerCase() ?? null, focusedMs: 0, lastEmitAt: -Infinity }
      : null;
  }

  /** From the monitor's 'foreground' event (app, title, domain or idle changed). */
  handleForeground(s: ForegroundSnapshot): void {
    const key = windowKey(s);
    const last = this.visits.at(-1);
    if (last && last.key === key) return; // a title or idle change inside the same window
    const now = this.deps.now();
    const { contextSwitchCount, contextSwitchWindowSec } = this.deps.getConfig();
    this.visits.push({ key, at: now, cls: this.deps.classify(s) });
    this.visits = this.visits.filter((v) => now - v.at <= contextSwitchWindowSec * 1000);

    // The recent run that only alternates between two windows, one of them work.
    let start = this.visits.length - 1;
    const pair = new Set<string>();
    while (start >= 0) {
      pair.add(this.visits[start].key);
      if (pair.size > 2) break;
      start--;
    }
    const run = this.visits.slice(start + 1);
    const switches = run.length - 1;
    if (pair.size === 2 && switches >= contextSwitchCount && run.some((v) => v.cls === 'work')) {
      this.deps.emit({ type: 'context_switch_loop', strength: 'weak', timestamp: now, metadata: { switches } });
    }
  }

  /** From the monitor's 'tick' event (every poll while a session runs unpaused). */
  handleTick(s: ForegroundSnapshot): void {
    const now = this.deps.now();
    const gap = this.lastTickAt === null ? 0 : now - this.lastTickAt;
    this.lastTickAt = now;
    const cfg = this.deps.getConfig();

    // idle_on_work
    if (this.deps.classify(s) === 'work' && s.idleSeconds >= cfg.idleMinutes * 60 && now - this.lastIdleEmitAt >= REEMIT_MS) {
      this.lastIdleEmitAt = now;
      this.deps.emit({
        type: 'idle_on_work',
        strength: 'weak',
        timestamp: now,
        problemId: this.problem?.id,
        metadata: { idleSeconds: Math.round(s.idleSeconds) }
      });
    }

    // long_on_problem: focused, non-idle time in the browser on the problem's domain
    const p = this.problem;
    if (p && gap <= MAX_TICK_GAP_MS && s.isBrowser && !s.isIdle && s.domain?.toLowerCase() === p.domain) {
      p.focusedMs += gap;
      if (p.focusedMs >= cfg.longProblemMinutes * 60_000 && now - p.lastEmitAt >= REEMIT_MS) {
        p.lastEmitAt = now;
        this.deps.emit({
          type: 'long_on_problem',
          strength: 'weak',
          timestamp: now,
          problemId: p.id,
          metadata: { minutes: Math.round(p.focusedMs / 60_000) }
        });
      }
    }
  }
}
