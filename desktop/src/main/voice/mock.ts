import type { SttHandlers, SttProvider, SttSession, TtsAudioFormat, TtsProvider } from './types.js';

/** Dev/demo STT: no microphone; tests and the developer panel call `inject`. */
export class MockSttProvider implements SttProvider {
  readonly name = 'mock';
  private handlers: SttHandlers | null = null;
  starts = 0;
  closes = 0;
  readonly audioFrames: Uint8Array[] = [];

  async start(handlers: SttHandlers): Promise<SttSession> {
    this.starts++;
    this.handlers = handlers;
    handlers.onStatus?.('live');
    return {
      write: (pcm) => {
        this.audioFrames.push(pcm);
      },
      close: () => {
        this.closes++;
        this.handlers = null;
        handlers.onStatus?.('closed');
      }
    };
  }

  get active(): boolean {
    return this.handlers !== null;
  }

  /** Simulates the student speaking: optional partials, then a final transcript. */
  inject(text: string, opts: { partials?: string[] } = {}): void {
    for (const p of opts.partials ?? []) this.handlers?.onPartial?.(p);
    this.handlers?.onTranscript(text);
  }

  fail(error: Error): void {
    this.handlers?.onError(error);
  }
}

/** Dev/demo TTS: produces no audio, the bubble shows the text. Records what was "spoken". */
export class MockTtsProvider implements TtsProvider {
  readonly name = 'mock';
  readonly format: TtsAudioFormat | null = null;
  readonly spoken: string[] = [];

  // eslint-disable-next-line require-yield
  async *synthesize(text: string): AsyncIterable<Uint8Array> {
    this.spoken.push(text);
  }
}
