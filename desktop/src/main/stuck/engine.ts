import type {
  HintTriggerType,
  MascotStateType,
  NudgeInput,
  NudgeResponse,
  SignalTypeType,
  StruggleSignal,
  StuckThresholdsType
} from '@wolfie/shared';
import { applyEscalationEvent, computeLevel, initialEscalationState, type EscalationState } from './escalation.js';
import { ACTIONS, AUTO_RESPONSES } from './actions.js';
import type { stuckBus } from './bus.js';
import type { EventType } from '../events.js';

// Escalation runtime (SPEC 4c/4d): turns bus events and the clock into mascot states, the level-3
// offer, and the level-4 spoken offer. The decisions are all in the shared pure engine
// (computeLevel / applyEscalationEvent); this class owns signal lifetimes, session scoping,
// and side effects. Everything outside is injected so tests run on a fake clock.

export const MIN_SIGNAL_LIFETIME_MS = 5 * 60_000;
/** After push() returns null, wait before offering again (cooldown / cap / snooze). */
export const PUSH_RETRY_MS = 5_000;

export const OFFER_TEXT = "This one looks tricky. Want a hint? Just say \"I'm stuck\" and I'll help.";

export interface EngineDeps {
  now: () => number;
  bus: Pick<typeof stuckBus, 'on' | 'emit'>;
  /** The active session; the engine only runs inside one. */
  getSession: () => { id: string } | null;
  onSessionChange: (fn: () => void) => () => void;
  isPaused: () => boolean;
  /**
   * Whether the student is really working right now (at the keyboard recently and, with Watch
   * mode, doing a study activity). When false, automatic offers stay at level 0. Manual help
   * (mascot click, hotkey, "I'm stuck") is not affected.
   */
  isEngaged?: () => boolean;
  isSnoozed: () => boolean;
  /** Voice mode (settings voice.enabled). */
  voiceMode: () => boolean;
  thresholds: () => StuckThresholdsType;
  idleMinutes: () => number;
  /** NudgeQueue.push: returns the nudge id, or null if it was dropped. */
  push: (nudge: NudgeInput) => string | null;
  onNudgeResponse: (fn: (response: NudgeResponse) => void) => () => void;
  setMascotState: (state: MascotStateType) => void;
  /** Speak the offer aloud (level 4). Only called when voice mode is on. */
  speak: (text: string) => void;
  log: (type: EventType, payload: Record<string, unknown>) => void;
}

interface ActiveSignal {
  signal: StruggleSignal;
  expiresAt: number;
}

export class EscalationEngine {
  private state: EscalationState;
  private signals = new Map<SignalTypeType, ActiveSignal>();
  private offer: { id: string } | null = null;
  private ladderOpen = false;
  private nextPushAt = 0;
  private timer: ReturnType<typeof setInterval> | null = null;
  private unsubs: Array<() => void> = [];

  constructor(private readonly deps: EngineDeps) {
    this.state = this.freshState();
  }

  /** Subscribes to the bus and the session, and ticks every `tickMs`. */
  start(tickMs = 1000): void {
    if (this.unsubs.length) return;
    const { bus } = this.deps;
    this.unsubs.push(
      bus.on('signal', (s) => this.onSignal(s)),
      bus.on('input', (at) => this.onInput(at)),
      bus.on('help-requested', (trigger) => this.onHelpRequested(trigger)),
      bus.on('problem-changed', (id) => this.onProblemChanged(id)),
      this.deps.onSessionChange(() => this.reset()),
      this.deps.onNudgeResponse((r) => this.onResponse(r))
    );
    this.timer = setInterval(() => this.tick(), tickMs);
    this.reset();
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    while (this.unsubs.length) this.unsubs.pop()!();
  }

  /** The hint flow (B3b) tells the engine while a ladder is open: hold level 0 and ignore signals. */
  setLadderOpen(open: boolean): void {
    if (this.ladderOpen === open) return;
    this.ladderOpen = open;
    if (open) {
      this.signals.clear();
      this.offer = null;
      this.setLevelDisplay(0);
    }
  }

  isLadderOpen(): boolean {
    return this.ladderOpen;
  }

  /** True while the level-3 offer is the thing on screen ("I'm good" by voice applies to it). */
  hasOpenOffer(): boolean {
    return this.offer !== null;
  }

  /** Id of the offer bubble on screen, for answering it by voice through NudgeQueue.respond. */
  offerId(): string | null {
    return this.offer?.id ?? null;
  }

  /** "I'm good": suppress offers for this problem for the rest of the session. */
  imGood(): void {
    const now = this.deps.now();
    this.state = applyEscalationEvent(this.state, { type: 'im_good', at: now, problemId: this.state.currentProblemId });
    this.signals.clear();
    this.offer = null;
    this.setLevelDisplay(0);
    this.deps.log('offer.declined', { reason: 'im_good', problem: this.redactedProblem() });
  }

  /** Test/diagnostic view. */
  snapshot(): { level: number; signals: SignalTypeType[]; state: EscalationState } {
    return { level: this.state.lastLevel, signals: [...this.signals.keys()], state: this.state };
  }

  // ---- Bus events --------------------------------------------------------------------------

  private onSignal(signal: StruggleSignal): void {
    const now = this.deps.now();
    if (!this.deps.getSession() || this.ladderOpen) return;
    // Signals with their own problem id adopt it if we do not know the problem yet.
    if (signal.problemId && this.isFallbackProblem()) {
      this.state = applyEscalationEvent(this.state, { type: 'problem_changed', at: now, problemId: signal.problemId });
    } else if (signal.problemId && signal.problemId !== this.state.currentProblemId) {
      return; // belongs to a problem that is no longer on screen
    }
    const existing = this.signals.get(signal.type);
    // A weaker repeat (e.g. Watch mode's model_stuck at lower confidence) must not downgrade a
    // strong signal that is still active
    if (existing && existing.expiresAt > now && existing.signal.strength === 'strong' && signal.strength === 'weak') {
      this.tick();
      return;
    }
    const fresh = !existing;
    this.signals.set(signal.type, { signal, expiresAt: now + this.lifetimeMs(signal.type) });
    if (fresh) this.deps.log('stuck.signal', { type: signal.type, strength: signal.strength });
    this.tick();
  }

  private onInput(at: number): void {
    this.state = applyEscalationEvent(this.state, { type: 'input', at });
  }

  private onHelpRequested(trigger: HintTriggerType): void {
    const now = this.deps.now();
    const hadOffer = this.offer !== null;
    this.state = applyEscalationEvent(this.state, { type: 'accepted', at: now });
    this.signals.clear();
    this.offer = null;
    this.setLevelDisplay(0);
    if (trigger === 'auto' || hadOffer) this.deps.log('offer.accepted', { trigger });
  }

  private onProblemChanged(id: string | null): void {
    const session = this.deps.getSession();
    if (!session) return;
    const key = id ?? this.fallbackKey(session.id);
    if (key === this.state.currentProblemId) return;
    this.state = applyEscalationEvent(this.state, { type: 'problem_changed', at: this.deps.now(), problemId: key });
    this.signals.clear();
    this.offer = null;
    this.setLevelDisplay(0);
  }

  private onResponse(response: NudgeResponse): void {
    if (!this.offer || response.id !== this.offer.id) return;
    const now = this.deps.now();
    switch (response.action) {
      case ACTIONS.ACCEPT_HINT:
        // The hint flow listens for this; the bus handler above does the state changes.
        this.deps.bus.emit('help-requested', 'auto');
        return;
      case ACTIONS.IM_GOOD:
        this.imGood();
        return;
      case ACTIONS.DECLINE:
      case AUTO_RESPONSES.DISMISSED:
        this.state = applyEscalationEvent(this.state, { type: 'declined', at: now });
        this.signals.clear();
        this.offer = null;
        this.setLevelDisplay(0);
        this.deps.log('offer.declined', { reason: response.action });
        return;
      default:
        // 'timeout' is the bubble fading on its own: not an answer, so the offer stays open and
        // level 4 can still follow. Unknown actions are ignored.
        return;
    }
  }

  // ---- The clock ---------------------------------------------------------------------------

  tick(): void {
    const now = this.deps.now();
    const session = this.deps.getSession();
    if (!session || this.ladderOpen) return;

    for (const [type, active] of this.signals) if (active.expiresAt <= now) this.signals.delete(type);

    this.state = {
      ...this.state,
      now,
      voiceMode: this.deps.voiceMode(),
      // Not really working (away, or not on a study task): treated like a pause, so no offers
      paused: this.deps.isPaused() || !(this.deps.isEngaged?.() ?? true),
      snoozed: this.deps.isSnoozed()
    };
    const active = [...this.signals.values()].map((a) => a.signal);
    const level = computeLevel(active, this.state);
    const previous = this.state.lastLevel;
    if (level === previous) return;

    if (level > previous) {
      if (level === 3) {
        if (now < this.nextPushAt) return;
        const id = this.deps.push(this.buildOffer());
        if (id === null) {
          // Dropped (cooldown, hourly cap, snooze, pause): do not count it as shown.
          this.nextPushAt = now + PUSH_RETRY_MS;
          return;
        }
        this.offer = { id };
      } else if (level === 4) {
        if (this.deps.voiceMode()) this.deps.speak(OFFER_TEXT);
      }
    } else if (level < 3) {
      this.offer = null;
    }

    this.state = applyEscalationEvent(this.state, { type: 'shown', level, at: now });
    this.setLevelDisplay(level);
    this.deps.log('stuck.level', { level, previous, signals: active.map((s) => s.type) });
  }

  // ---- Helpers -----------------------------------------------------------------------------

  private buildOffer(): NudgeInput {
    return {
      kind: 'stuck',
      level: 3,
      // No spokenText: level 3 is visual only. Level 4 speaks OFFER_TEXT itself.
      text: OFFER_TEXT,
      priority: 7,
      buttons: [
        { label: 'Yes, give me a hint', action: ACTIONS.ACCEPT_HINT, variant: 'primary' },
        { label: 'Not now', action: ACTIONS.DECLINE, variant: 'secondary' },
        { label: "I'm good", action: ACTIONS.IM_GOOD, variant: 'secondary' }
      ]
    };
  }

  /** Levels 1-2 are sprite states; 0 returns to idle. Level 3+ is a bubble, so the sprite is left alone. */
  private setLevelDisplay(level: number): void {
    if (this.deps.isPaused()) return; // main.ts owns the sleeping sprite while paused
    if (level === 0) this.deps.setMascotState('idle');
    else if (level === 1) this.deps.setMascotState('glance');
    else if (level === 2) this.deps.setMascotState('question-mark');
  }

  private lifetimeMs(type: SignalTypeType): number {
    const t = this.deps.thresholds();
    const windowSec: Partial<Record<SignalTypeType, number>> = {
      dead_control_clicks: t.deadClickWindowSec,
      validation_errors: t.validationWindowSec,
      backtracking: t.backtrackWindowSec,
      context_switch_loop: t.contextSwitchWindowSec,
      scribble_outs: t.scribbleOutWindowSec,
      undo_burst: t.undoBurstWindowSec,
      idle_on_work: this.deps.idleMinutes() * 60,
      idle_on_page: t.idleOnPageMinutes * 60
    };
    return Math.max((windowSec[type] ?? 0) * 1000, MIN_SIGNAL_LIFETIME_MS);
  }

  private reset(): void {
    this.signals.clear();
    this.offer = null;
    this.ladderOpen = false;
    this.nextPushAt = 0;
    this.state = this.freshState();
    this.setLevelDisplay(0);
  }

  private freshState(): EscalationState {
    const session = this.deps.getSession();
    const state = initialEscalationState(this.deps.now(), this.deps.voiceMode());
    // "I'm good" needs a problem key even when no problem id is known (page without data-problem-id)
    return { ...state, currentProblemId: session ? this.fallbackKey(session.id) : null };
  }

  private fallbackKey(sessionId: string): string {
    return `session:${sessionId}`;
  }

  private isFallbackProblem(): boolean {
    return this.state.currentProblemId === null || this.state.currentProblemId.startsWith('session:');
  }

  private redactedProblem(): string {
    return this.isFallbackProblem() ? 'session' : 'problem';
  }
}
