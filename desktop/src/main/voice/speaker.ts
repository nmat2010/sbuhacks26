import type { EchoGuard } from './echo.js';
import type { TtsProvider } from './types.js';

// Plays Wolfie's speech: streams TTS audio chunks to whoever plays them (the renderer, via IPC),
// registers the text with the echo guard, and can be interrupted instantly for barge-in.
// A TTS failure is not an error for the user: the bubble already shows the text.

export interface SpeakerDeps {
  tts: TtsProvider;
  echo: EchoGuard;
  now: () => number;
  /** Receives audio chunks as they arrive (first chunk = start playing). */
  onAudio: (chunk: Uint8Array, meta: { utteranceId: number; mimeType: string }) => void;
  /** Tells the player to drop queued audio now. */
  onStop?: (utteranceId: number) => void;
  /** Mock/silent providers: surfaces the spoken text for the developer panel. */
  onSpokenText?: (text: string) => void;
  log?: (line: string) => void;
}

export class Speaker {
  private controller: AbortController | null = null;
  private seq = 0;
  private lastText = '';
  private current: Promise<void> = Promise.resolve();

  constructor(private readonly deps: SpeakerDeps) {}

  isSpeaking(): boolean {
    return this.deps.echo.isSpeaking();
  }

  /** Speaks `text`, interrupting anything already playing. Resolves when playback ends. */
  speak(text: string): Promise<void> {
    const trimmed = text.trim();
    if (!trimmed) return Promise.resolve();
    this.stop();
    this.lastText = trimmed;
    const controller = new AbortController();
    this.controller = controller;
    const id = ++this.seq;
    this.current = this.run(trimmed, id, controller);
    return this.current;
  }

  /** "Repeat that". */
  repeat(): Promise<void> {
    return this.lastText ? this.speak(this.lastText) : Promise.resolve();
  }

  /** Barge-in or "stop": abort the TTS stream and silence the player immediately. */
  stop(): void {
    const controller = this.controller;
    if (!controller) return;
    this.controller = null;
    controller.abort();
    this.deps.echo.speakingEnded(this.deps.now());
    this.deps.onStop?.(this.seq);
  }

  private async run(text: string, id: number, controller: AbortController): Promise<void> {
    const { tts, echo, now } = this.deps;
    echo.speakingStarted(text, now());
    this.deps.onSpokenText?.(text);
    try {
      if (tts.format) {
        for await (const chunk of tts.synthesize(text, controller.signal)) {
          if (controller.signal.aborted) break;
          this.deps.onAudio(chunk, { utteranceId: id, mimeType: tts.format.mimeType });
        }
      } else {
        // Silent provider: drain so it can record the text.
        for await (const chunk of tts.synthesize(text, controller.signal)) void chunk;
      }
    } catch (error) {
      if (!controller.signal.aborted) {
        this.deps.log?.(`[voice] TTS failed, showing text only: ${(error as Error).message}`);
      }
    } finally {
      if (this.controller === controller) {
        this.controller = null;
        echo.speakingEnded(now());
      }
    }
  }
}
