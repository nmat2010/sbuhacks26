// Speech provider interfaces (SPEC Phase 1). Implementations: mock.ts (dev, demo, tests) and
// elevenlabs-*.ts (B5b). Mic capture and audio playback live in the renderer (Thu); main only sees
// 16 kHz mono PCM frames in and encoded audio chunks out.

export interface SttHandlers {
  /** Interim text while the student is still talking. Used for barge-in; never routed as a command. */
  onPartial?(text: string): void;
  /** A finished turn (end-of-turn detected by the provider). */
  onTranscript(text: string): void;
  /** Reconnects exhausted or a fatal provider error. Text input keeps working. */
  onError(error: Error): void;
  /** Connection state, for the "voice is having trouble" bubble. */
  onStatus?(status: 'connecting' | 'live' | 'reconnecting' | 'closed'): void;
}

export interface SttSession {
  /** 16 kHz, 16-bit little-endian mono PCM. */
  write(pcm: Uint8Array): void;
  close(): void;
}

export interface SttProvider {
  name: string;
  /** Opens a streaming recognition session. */
  start(handlers: SttHandlers): Promise<SttSession>;
}

export interface TtsAudioFormat {
  /** e.g. 'audio/mpeg', or 'audio/pcm;rate=24000' for raw 16-bit PCM. */
  mimeType: string;
}

export interface TtsProvider {
  name: string;
  /** Null means this provider produces no audio (the mock): the bubble text is the output. */
  format: TtsAudioFormat | null;
  /** Streams audio for `text`. Aborting `signal` must stop the stream promptly (barge-in). */
  synthesize(text: string, signal: AbortSignal): AsyncIterable<Uint8Array>;
}
