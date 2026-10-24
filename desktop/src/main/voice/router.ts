import type { HintTriggerType } from '@wolfie/shared';
import type { EchoGuard } from './echo.js';
import { parseIntent, type VoiceIntent } from './intents.js';

// Routes what the student says (SPEC Phase 1, 4d, 4e):
//   1. dropped while paused, and when it is Wolfie's own voice coming back (echo)
//   2. a local intent is handled with no model call
//   3. otherwise, if a hint ladder is open, it is a follow-up for the hint service
//   4. otherwise it is ignored (no model call for chatter)
// Any non-echo speech while Wolfie is talking stops playback first (barge-in).

export type IntentHandler = () => boolean | void | Promise<boolean | void>;

export interface SpeakerLike {
  isSpeaking(): boolean;
  stop(): void;
  repeat(): Promise<void>;
}

export interface VoiceRouterDeps {
  speaker: SpeakerLike;
  echo: EchoGuard;
  now: () => number;
  isPaused: () => boolean;
  /** Handlers for intents that need app state. Return false when the intent does not apply right now. */
  handlers: Partial<Record<Exclude<VoiceIntent, 'stop' | 'repeat' | 'stuck'>, IntentHandler>>;
  /** True while a hint ladder is open and follow-ups make sense. */
  hasOpenLadder: () => boolean;
  /** "I don't get step 2": goes to the hint service with the conversation so far. */
  onFollowup: (utterance: string) => void | Promise<void>;
  /** "I'm stuck": stuckBus.emit('help-requested', trigger). */
  requestHelp: (trigger: HintTriggerType) => void;
  /** Announces every recognized intent (voiceBus). */
  announce?: (intent: VoiceIntent, transcript: string) => void;
}

export type RouteResult =
  | { kind: 'dropped'; reason: 'paused' | 'echo' | 'empty' }
  | { kind: 'intent'; intent: VoiceIntent; applied: boolean }
  | { kind: 'followup' }
  | { kind: 'ignored' };

export class VoiceRouter {
  constructor(private readonly deps: VoiceRouterDeps) {}

  /** Interim text: used only for barge-in, never as a command. */
  handlePartial(text: string): void {
    const { deps } = this;
    if (deps.isPaused() || !text.trim()) return;
    if (deps.speaker.isSpeaking() && !deps.echo.isEcho(text, deps.now())) deps.speaker.stop();
  }

  /** A finished turn from STT, or a typed utterance from the developer panel. */
  async handleTranscript(text: string): Promise<RouteResult> {
    const { deps } = this;
    if (!text.trim()) return { kind: 'dropped', reason: 'empty' };
    if (deps.isPaused()) return { kind: 'dropped', reason: 'paused' };
    if (deps.echo.isEcho(text, deps.now())) return { kind: 'dropped', reason: 'echo' };

    // Real speech over Wolfie: silence it now, before anything else happens.
    if (deps.speaker.isSpeaking()) deps.speaker.stop();

    const intent = parseIntent(text);
    if (intent) {
      deps.announce?.(intent, text);
      return { kind: 'intent', intent, applied: await this.applyIntent(intent) };
    }

    if (deps.hasOpenLadder()) {
      await deps.onFollowup(text.trim());
      return { kind: 'followup' };
    }
    return { kind: 'ignored' };
  }

  private async applyIntent(intent: VoiceIntent): Promise<boolean> {
    const { deps } = this;
    switch (intent) {
      case 'stop':
        return true; // already silenced above (or nothing was playing)
      case 'repeat':
        await deps.speaker.repeat();
        return true;
      case 'stuck':
        deps.requestHelp('voice');
        return true;
      default: {
        const handler = deps.handlers[intent];
        if (!handler) return false;
        return (await handler()) !== false;
      }
    }
  }
}
