import {
  HINT_LEVEL_KEYS,
  type ChatTurnType,
  type HintContext,
  type HintFollowup,
  type HintFollowupResponse,
  type HintResponse,
  type HintSourceType,
  type HintTriggerType,
  type NudgeInput,
  type NudgeResponse,
  type PageSummary
} from '@wolfie/shared';
import { ACTIONS, AUTO_RESPONSES } from '../stuck/actions.js';
import { firstSentences } from '../voice/text.js';
import { SHOW_ANSWER_UTTERANCE } from './constants.js';
import type { CaptureResult } from './capture.js';
import type { LevelLog } from './service.js';
import type { EventType } from '../events.js';
import type { stuckBus } from '../stuck/bus.js';

// The hint flow (SPEC 4e): accepting the offer, clicking Wolfie, the hotkey or "I'm stuck" all
// arrive as stuckBus 'help-requested'. The flow assembles context (page summary first, a
// confirmed screenshot as fallback), asks the hint service for the ladder, and shows it one level
// per bubble. The ladder position lives here, keyed by the id of the bubble on screen.

/** A page summary older than this is treated as stale (the browser was probably not in front). */
export const SUMMARY_MAX_AGE_MS = 120_000;
/** A ladder nobody touches for this long is closed, so offers can resume. */
export const LADDER_IDLE_MS = 5 * 60_000;
const MAX_LEVEL = 5;

export const FLOW_TEXT = {
  thinking: 'Let me take a look...',
  noPermission:
    "I can't see your screen yet. If you'd like me to, allow Screen Recording for Wolfie in System Settings > Privacy & Security, then ask me again.",
  declinedCapture: "No problem, I won't look. Tell me what you're stuck on, or ask again whenever you like.",
  captureFailed: "I couldn't get a look at your screen just now. Try again in a moment.",
  lastHint: "That's the last hint I have for this one. You've got what you need to take the next step.",
  gotIt: 'Great, glad that helped!',
  failed: "Sorry, I couldn't put a hint together. Please try again in a moment.",
  simpler: 'Explain that more simply, with an everyday analogy.'
} as const;

/** Bubble action for "Explain more simply" on a Watch-mode explanation. */
export const EXPLAIN_SIMPLER = 'explain_simpler';

/**
 * Watch mode (WATCH_MODE.md). When it is on, help requests use what Wolfie has followed this
 * session instead of a single confirmed screenshot: learning mode gets a direct explanation,
 * homework mode gets the usual hint ladder with the session as context.
 */
export interface WatchHooks {
  active: () => boolean;
  mode: () => 'learning' | 'homework' | 'other';
  /** Session memory as prompt text. */
  contextText: () => string;
  /** The newest watcher frame, or a fresh capture (no confirmation needed: Watch-mode consent). */
  currentFrame: () => Promise<string | null>;
  /**
   * Answer a question (or, with no question, explain what the student seems stuck on).
   * `previousAnswer` is the explanation being followed up on.
   */
  explain: (
    question: string | null,
    previousAnswer?: string
  ) => Promise<{ ok: true; text: string; label: string } | { ok: false; message: string }>;
}

export interface HintFlowDeps {
  now: () => number;
  bus: Pick<typeof stuckBus, 'on'>;
  getSession: () => { id: string; assessmentMode: boolean } | null;
  isPaused: () => boolean;
  /** sync/context.ts requestPageSummary */
  requestPageSummary: () => Promise<PageSummary | null>;
  /** desktopCapturer fallback */
  capture: () => Promise<CaptureResult>;
  /** First capture per session: show the preview and ask. */
  confirmCapture: (dataUrl: string) => Promise<boolean>;
  requestHints: (context: HintContext, source: HintSourceType, assessment: boolean) => Promise<HintResponse>;
  requestFollowup: (
    followup: HintFollowup,
    context: HintContext,
    source: HintSourceType,
    assessment: boolean
  ) => Promise<HintFollowupResponse>;
  logLevelShown: (entry: LevelLog) => void;
  /** NudgeQueue.push with { userInitiated: true }; returns the nudge id or null. */
  push: (nudge: NudgeInput) => string | null;
  /** NudgeQueue.respond: used so voice answers are logged like button presses. */
  respond: (response: NudgeResponse) => void;
  onNudgeResponse: (fn: (response: NudgeResponse) => void) => () => void;
  onSessionChange: (fn: () => void) => () => void;
  /** Engine hooks */
  setLadderOpen: (open: boolean) => void;
  markImGood: () => void;
  log: (type: EventType, payload: Record<string, unknown>) => void;
  /** Delay before "Let me take a look..." appears; slow model calls only. */
  thinkingDelayMs?: number;
  watch?: WatchHooks;
}

interface Ladder {
  context: HintContext;
  source: HintSourceType;
  assessment: boolean;
  response: HintResponse;
  level: number;
  deepest: number;
  history: ChatTurnType[];
  requestId: string;
  nudgeId: string | null;
  lastTouch: number;
}

export class HintFlow {
  private ladder: Ladder | null = null;
  /** A Watch-mode explanation on screen (learning mode); it holds offers back like a ladder does. */
  private explanation: { nudgeId: string | null; lastTouch: number; text: string } | null = null;
  private busy = false;
  private confirmedSessions = new Set<string>();
  private unsubs: Array<() => void> = [];
  private seq = 0;

  constructor(private readonly deps: HintFlowDeps) {}

  start(): void {
    if (this.unsubs.length) return;
    const { deps } = this;
    this.unsubs.push(
      deps.bus.on('help-requested', (trigger) => void this.onHelpRequested(trigger)),
      deps.bus.on('problem-changed', () => {
        this.close('problem_changed');
        this.closeExplanation('problem_changed');
      }),
      deps.onNudgeResponse((r) => this.onResponse(r)),
      deps.onSessionChange(() => {
        this.confirmedSessions.clear();
        this.close('session_changed');
        this.closeExplanation('session_changed');
      })
    );
  }

  stop(): void {
    while (this.unsubs.length) this.unsubs.pop()!();
    this.close('stopped');
    this.closeExplanation('stopped');
  }

  hasOpenLadder(): boolean {
    return this.ladder !== null;
  }

  hasOpenExplanation(): boolean {
    return this.explanation !== null;
  }

  currentLevel(): number {
    return this.ladder?.level ?? 0;
  }

  /** Id of the bubble currently carrying the ladder (for voice answers). */
  currentNudgeId(): string | null {
    return this.ladder?.nudgeId ?? null;
  }

  /** Call every few seconds: closes a ladder nobody has touched, so offers can resume. */
  tick(): void {
    if (this.ladder && this.deps.now() - this.ladder.lastTouch > LADDER_IDLE_MS) this.close('idle');
    if (this.explanation && this.deps.now() - this.explanation.lastTouch > LADDER_IDLE_MS) this.closeExplanation('idle');
  }

  /**
   * A button press or a spoken answer. Spoken answers go through NudgeQueue.respond so they are
   * logged like clicks; this returns false when there is no open ladder to answer.
   */
  answer(action: string, via: 'button' | 'voice' = 'voice'): boolean {
    const explanation = this.explanation;
    if (explanation) {
      if (explanation.nudgeId) this.deps.respond({ id: explanation.nudgeId, action, via });
      else this.applyExplanation(action);
      return true;
    }
    const ladder = this.ladder;
    if (!ladder) return false;
    if (ladder.nudgeId) this.deps.respond({ id: ladder.nudgeId, action, via });
    else this.apply(action);
    return true;
  }

  // ---- Entry --------------------------------------------------------------------------------

  async onHelpRequested(trigger: HintTriggerType): Promise<void> {
    const { deps } = this;
    if (deps.isPaused()) return;
    if (this.ladder) {
      // Asking again while a ladder is open means "one more hint"
      if (trigger !== 'auto') this.answer(ACTIONS.ANOTHER_HINT, trigger === 'voice' ? 'voice' : 'button');
      return;
    }
    if (this.busy) return;
    if (this.explanation) {
      // Asking again while an explanation is up: start over with a fresh look
      this.closeExplanation('replaced');
    }
    if (deps.watch?.active() && deps.watch.mode() === 'learning') {
      await this.explainFromSession(trigger, null);
      return;
    }
    this.busy = true;
    deps.setLadderOpen(true);

    let thinkingTimer: ReturnType<typeof setTimeout> | undefined;
    try {
      thinkingTimer = setTimeout(
        () => deps.push({ kind: 'stuck', level: 3, text: FLOW_TEXT.thinking, priority: 8 }),
        deps.thinkingDelayMs ?? 800
      );
      const session = deps.getSession();
      const sessionId = session?.id ?? 'no-session';
      const assembled = await this.assembleContext(trigger, sessionId);
      if (!assembled.ok) {
        clearTimeout(thinkingTimer);
        deps.setLadderOpen(false);
        this.say(assembled.message);
        return;
      }
      const { context, source } = assembled;
      const assessment = session?.assessmentMode ?? false;
      const response = await deps.requestHints(context, source, assessment);
      clearTimeout(thinkingTimer);

      this.ladder = {
        context,
        source,
        assessment,
        response,
        level: 1,
        deepest: 1,
        history: [],
        requestId: `hint-${deps.now()}-${++this.seq}`,
        nudgeId: null,
        lastTouch: deps.now()
      };
      deps.log('hint.opened', { source, trigger, offline: response.offline, assessment });
      this.showLevel(1);
    } catch (error) {
      clearTimeout(thinkingTimer);
      console.error('[hint-flow] failed:', (error as Error).message);
      this.ladder = null;
      deps.setLadderOpen(false);
      this.say(FLOW_TEXT.failed);
    } finally {
      this.busy = false;
    }
  }

  private async assembleContext(
    trigger: HintTriggerType,
    sessionId: string
  ): Promise<{ ok: true; context: HintContext; source: HintSourceType } | { ok: false; message: string }> {
    const { deps } = this;
    const base = { sessionId, device: 'desktop' as const, trigger };

    let summary: PageSummary | null = null;
    try {
      summary = await deps.requestPageSummary();
    } catch {
      summary = null;
    }
    const page = summary && this.isUsable(summary) ? summary : null;

    // Watch mode: the session so far plus the current screen, no per-session confirmation
    if (deps.watch?.active()) {
      const sessionContext = deps.watch.contextText().slice(0, 8000) || undefined;
      const frame = await deps.watch.currentFrame().catch(() => null);
      if (page || frame) {
        return {
          ok: true,
          source: page ? 'page' : 'screen',
          context: {
            ...base,
            sessionContext,
            ...(page ? { pageSummary: page, problemId: page.problemId } : {}),
            ...(frame ? { imageDataUrl: frame, imageNoStore: true } : {})
          }
        };
      }
    }

    if (page) {
      return { ok: true, source: 'page', context: { ...base, pageSummary: page, problemId: page.problemId } };
    }

    const shot = await deps.capture();
    if (!shot.ok) {
      return { ok: false, message: shot.reason === 'permission' ? FLOW_TEXT.noPermission : FLOW_TEXT.captureFailed };
    }
    if (!this.confirmedSessions.has(sessionId)) {
      if (!(await deps.confirmCapture(shot.dataUrl))) return { ok: false, message: FLOW_TEXT.declinedCapture };
      this.confirmedSessions.add(sessionId);
    }
    return { ok: true, source: 'screen', context: { ...base, imageDataUrl: shot.dataUrl } };
  }

  /** A summary counts only if it is fresh and has something in it. */
  private isUsable(summary: PageSummary): boolean {
    const fresh = this.deps.now() - summary.timestamp <= SUMMARY_MAX_AGE_MS;
    const hasContent = summary.visibleText.trim() !== '' || summary.headings.length > 0 || summary.controls.length > 0;
    return fresh && hasContent;
  }

  // ---- Responses ----------------------------------------------------------------------------

  private onResponse(response: NudgeResponse): void {
    if (this.explanation && response.id === this.explanation.nudgeId) {
      this.applyExplanation(response.action);
      return;
    }
    if (!this.ladder || response.id !== this.ladder.nudgeId) return;
    this.apply(response.action);
  }

  // ---- Watch mode: direct explanations (learning mode) ------------------------------------

  /**
   * Learning mode: explain from the whole session instead of a hint ladder. `question` is null
   * when the student just asked for help (mascot click, accepted offer, "I'm stuck").
   */
  private async explainFromSession(trigger: HintTriggerType, question: string | null, previousAnswer?: string): Promise<void> {
    const { deps } = this;
    const watch = deps.watch!;
    this.busy = true;
    deps.setLadderOpen(true);
    const thinkingTimer = setTimeout(
      () => deps.push({ kind: 'stuck', level: 3, text: FLOW_TEXT.thinking, priority: 8 }),
      deps.thinkingDelayMs ?? 800
    );
    try {
      const res = await watch.explain(question, previousAnswer);
      clearTimeout(thinkingTimer);
      if (!res.ok) {
        deps.setLadderOpen(false);
        this.say(res.message);
        return;
      }
      const id = deps.push({
        kind: 'stuck',
        level: 3,
        text: `${res.text}\n\n${res.label}`,
        spokenText: firstSentences(res.text),
        buttons: [
          { label: 'Explain more simply', action: EXPLAIN_SIMPLER, variant: 'secondary' },
          { label: 'I got it', action: ACTIONS.GOT_IT, variant: 'primary' },
          { label: "I'm good", action: ACTIONS.IM_GOOD, variant: 'secondary' }
        ],
        priority: 8
      });
      this.explanation = { nudgeId: id, lastTouch: deps.now(), text: res.text };
      deps.log('watch.explained', { trigger, followup: question !== null });
    } catch (error) {
      clearTimeout(thinkingTimer);
      console.error('[hint-flow] explanation failed:', (error as Error).message);
      deps.setLadderOpen(false);
      this.say(FLOW_TEXT.failed);
    } finally {
      this.busy = false;
    }
  }

  /** A spoken follow-up ("explain that more simply", "why does that work?") while an explanation is up. */
  async followupExplanation(utterance: string): Promise<boolean> {
    if (!this.explanation || !this.deps.watch || this.busy) return false;
    const previous = this.explanation.text;
    this.explanation = null; // replaced by the answer; offers stay held meanwhile
    await this.explainFromSession('voice', utterance, previous);
    return true;
  }

  private applyExplanation(action: string): void {
    if (!this.explanation) return;
    this.explanation.lastTouch = this.deps.now();
    switch (action) {
      case EXPLAIN_SIMPLER: {
        const previous = this.explanation.text;
        this.explanation = null;
        void this.explainFromSession('manual', FLOW_TEXT.simpler, previous);
        return;
      }
      case ACTIONS.GOT_IT:
        this.closeExplanation('got_it');
        this.say(FLOW_TEXT.gotIt);
        return;
      case ACTIONS.IM_GOOD:
        this.deps.markImGood();
        this.closeExplanation('im_good');
        return;
      case AUTO_RESPONSES.DISMISSED:
        this.closeExplanation('dismissed');
        return;
      default:
        return; // 'timeout': stays open until idle, like a ladder
    }
  }

  private closeExplanation(reason: string): void {
    if (!this.explanation) return;
    this.explanation = null;
    this.deps.setLadderOpen(false);
    this.deps.log('watch.explanation_closed', { reason });
  }

  private apply(action: string): void {
    const ladder = this.ladder;
    if (!ladder) return;
    ladder.lastTouch = this.deps.now();
    switch (action) {
      case ACTIONS.ANOTHER_HINT:
        if (ladder.level >= MAX_LEVEL) this.say(FLOW_TEXT.lastHint, this.buttons(ladder, true), ladder);
        else this.showLevel(ladder.level + 1);
        return;
      case ACTIONS.GOT_IT:
        this.close('got_it');
        this.say(FLOW_TEXT.gotIt);
        return;
      case ACTIONS.IM_GOOD:
        this.deps.markImGood();
        this.close('im_good');
        return;
      case ACTIONS.SHOW_ANSWER:
        if (ladder.assessment) return; // hidden in assessment mode; ignore if asked by voice
        void this.followup(SHOW_ANSWER_UTTERANCE);
        return;
      case AUTO_RESPONSES.DISMISSED:
        this.close('dismissed');
        return;
      default:
        return; // 'timeout': the bubble faded, the ladder stays open until it goes idle
    }
  }

  /** Follow-up speech ("I don't get step 2") while a ladder is open. */
  async followup(utterance: string): Promise<void> {
    const ladder = this.ladder;
    if (!ladder || this.busy) return;
    this.busy = true;
    ladder.lastTouch = this.deps.now();
    try {
      const history = ladder.history.slice(-6);
      const result = await this.deps.requestFollowup(
        { requestId: ladder.requestId, utterance, currentLevel: ladder.level, conversationHistory: history },
        ladder.context,
        ladder.source,
        ladder.assessment
      );
      if (this.ladder !== ladder) return; // closed while waiting
      ladder.history.push({ role: 'user', content: utterance }, { role: 'assistant', content: result.text });
      ladder.history = ladder.history.slice(-6);
      ladder.level = result.level;
      ladder.deepest = Math.max(ladder.deepest, result.level);
      this.say(result.offline ? `Offline hint: ${result.text}` : result.text, this.buttons(ladder, false), ladder);
    } catch (error) {
      console.error('[hint-flow] follow-up failed:', (error as Error).message);
      this.say(FLOW_TEXT.failed);
    } finally {
      this.busy = false;
    }
  }

  // ---- Showing ------------------------------------------------------------------------------

  private showLevel(level: number): void {
    const ladder = this.ladder!;
    const key = HINT_LEVEL_KEYS[level - 1];
    const text = ladder.response.hint_levels[key];
    ladder.level = level;
    ladder.deepest = Math.max(ladder.deepest, level);
    ladder.history.push({ role: 'assistant', content: text });
    ladder.history = ladder.history.slice(-6);
    // Level 1 is already logged by requestHints
    if (level > 1) {
      this.deps.logLevelShown({ context: ladder.context, source: ladder.source, level, text });
    }
    this.say(ladder.response.offline ? `Offline hint: ${text}` : text, this.buttons(ladder, false), ladder, text);
  }

  private buttons(ladder: Ladder, atEnd: boolean): NudgeInput['buttons'] {
    const buttons: NonNullable<NudgeInput['buttons']> = [];
    if (!atEnd && ladder.level < MAX_LEVEL) {
      buttons.push({ label: 'Another hint', action: ACTIONS.ANOTHER_HINT, variant: 'primary' });
    }
    buttons.push({ label: 'I got it', action: ACTIONS.GOT_IT, variant: ladder.level >= MAX_LEVEL ? 'primary' : 'secondary' });
    buttons.push({ label: "I'm good", action: ACTIONS.IM_GOOD, variant: 'secondary' });
    if (!ladder.assessment) buttons.push({ label: 'Show the answer', action: ACTIONS.SHOW_ANSWER, variant: 'secondary' });
    return buttons;
  }

  /**
   * Pushes a bubble. With a ladder, the bubble becomes the one the ladder is keyed by, and the
   * text is spoken as its first two sentences (the queue's show handler speaks `spokenText`).
   */
  private say(text: string, buttons?: NudgeInput['buttons'], ladder?: Ladder, spokenSource?: string): void {
    const id = this.deps.push({
      kind: 'stuck',
      level: 3,
      text,
      spokenText: firstSentences(spokenSource ?? text),
      buttons,
      priority: 8
    });
    if (ladder) ladder.nudgeId = id;
  }

  close(reason: string): void {
    const ladder = this.ladder;
    if (!ladder) return;
    this.ladder = null;
    this.deps.setLadderOpen(false);
    this.deps.log('hint.closed', { reason, deepest: ladder.deepest, source: ladder.source });
  }
}
