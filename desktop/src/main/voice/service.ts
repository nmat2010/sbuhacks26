import type { HintTriggerType } from '@wolfie/shared';
import { EchoGuard } from './echo.js';
import { VoiceController } from './controller.js';
import { VoiceRouter, type IntentHandler, type RouteResult } from './router.js';
import { Speaker } from './speaker.js';
import type { SttProvider, TtsProvider } from './types.js';
import type { VoiceIntent } from './intents.js';

// Composes the voice pieces behind one object so register.ts only has to inject the outside
// world (providers, IPC senders, app state). No electron imports here.

export interface VoiceServiceDeps {
  now: () => number;
  stt: () => SttProvider;
  tts: () => TtsProvider;
  /** Voice mode toggle (settings voice.enabled). */
  voiceEnabled: () => boolean;
  sessionActive: () => boolean;
  isPaused: () => boolean;
  handlers: Partial<Record<Exclude<VoiceIntent, 'stop' | 'repeat' | 'stuck'>, IntentHandler>>;
  hasOpenLadder: () => boolean;
  onFollowup: (utterance: string) => void | Promise<void>;
  requestHelp: (trigger: HintTriggerType) => void;
  announce?: (intent: VoiceIntent, transcript: string) => void;
  // Outputs to the renderer (Thu plays audio, shows the green dot, shows the trouble bubble)
  sendAudio: (chunk: Uint8Array, meta: { utteranceId: number; mimeType: string }) => void;
  sendStopPlayback: (utteranceId: number) => void;
  sendMic: (live: boolean) => void;
  sendTrouble: (message: string) => void;
  log?: (line: string) => void;
}

export interface VoiceService {
  router: VoiceRouter;
  speaker: Speaker;
  controller: VoiceController;
  /** Re-evaluate whether the mic should be live (session / voice mode / pause changed). */
  refresh(): Promise<void>;
  /** Speak when voice mode is on and monitoring is not paused. Returns whether it spoke. */
  speakIfVoice(text: string): Promise<boolean>;
  /** PCM from the renderer's mic capture. */
  writeAudio(pcm: Uint8Array): void;
  /** A typed utterance (developer panel / mock STT). */
  utterance(text: string): Promise<RouteResult>;
  stop(): void;
}

export function createVoiceService(deps: VoiceServiceDeps): VoiceService {
  const echo = new EchoGuard();
  // The TTS provider can change when settings change, so resolve it on every utterance.
  const ttsProxy: TtsProvider = {
    get name() {
      return deps.tts().name;
    },
    get format() {
      return deps.tts().format;
    },
    synthesize: (text, signal) => deps.tts().synthesize(text, signal)
  };
  const speaker = new Speaker({
    tts: ttsProxy,
    echo,
    now: deps.now,
    onAudio: deps.sendAudio,
    onStop: deps.sendStopPlayback,
    log: deps.log
  });

  const router = new VoiceRouter({
    speaker,
    echo,
    now: deps.now,
    isPaused: deps.isPaused,
    handlers: deps.handlers,
    hasOpenLadder: deps.hasOpenLadder,
    onFollowup: deps.onFollowup,
    requestHelp: deps.requestHelp,
    announce: deps.announce
  });

  const controller = new VoiceController({
    stt: deps.stt,
    shouldListen: () => deps.sessionActive() && deps.voiceEnabled() && !deps.isPaused(),
    onPartial: (t) => router.handlePartial(t),
    onTranscript: (t) => void router.handleTranscript(t),
    onTrouble: (e) => {
      deps.log?.(`[voice] STT trouble: ${e.message}`);
      deps.sendTrouble("Voice is having trouble right now. You can keep typing and I'll still help.");
    },
    onMicLive: deps.sendMic
  });

  return {
    router,
    speaker,
    controller,
    refresh: () => controller.refresh(),
    async speakIfVoice(text) {
      if (!deps.voiceEnabled() || deps.isPaused()) return false;
      await speaker.speak(text);
      return true;
    },
    writeAudio: (pcm) => controller.write(pcm),
    utterance: (text) => router.handleTranscript(text),
    stop() {
      speaker.stop();
      controller.stop();
    }
  };
}
