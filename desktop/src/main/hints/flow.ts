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
  failed: "Sorry, I couldn't put a hint together. Please try again in a moment."
} as const;

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
      deps.bus.on('problem-changed', () => this.close('problem_changed')),
      deps.onNudgeResponse((r) => this.onResponse(r)),
      deps.onSessionChange(() => {
        this.confirmedSessions.clear();
        this.close('session_changed');
      })
    );
  }

  stop(): void {
    while (this.unsubs.length) this.unsubs.pop()!();
    this.close('stopped');
  }

  hasOpenLadder(): boolean {
    return this.ladder !== null;
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
  }

  /**
   * A button press or a spoken answer. Spoken answers go through NudgeQueue.respond so they are
   * logged like clicks; this returns false when there is no open ladder to answer.
   */
  answer(action: string, via: 'button' | 'voice' = 'voice'): boolean {
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
    if (summary && this.isUsable(summary)) {
      return { ok: true, source: 'page', context: { ...base, pageSummary: summary, problemId: summary.problemId } };
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
    if (!this.ladder || response.id !== this.ladder.nudgeId) return;
    this.apply(response.action);
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
