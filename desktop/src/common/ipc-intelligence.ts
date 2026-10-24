// Agent B's IPC channels. Merged into the maps in ipc.ts; only Agent B edits this file.

export interface VoiceStatus {
  /** Voice mode toggle (settings voice.enabled). */
  enabled: boolean;
  sttProvider: string;
  ttsProvider: string;
  /** Mic currently live (session active + voice on + not paused). */
  micLive: boolean;
  /** False when no ElevenLabs key is set: voice falls back to typed utterances (mock). */
  hasVoiceKey: boolean;
}

/** renderer -> main, request/response: 'channel': { args: [...]; result: ... } */
export interface IntelligenceInvoke {
  /**
   * A typed utterance, as if the student had said it. Used by the developer panel with the mock
   * STT provider. Result is the router's decision: 'intent:<name>', 'followup', 'ignored', 'dropped:<why>'.
   */
  'voice-utterance': { args: [text: string]; result: { success: boolean; route: string } };
  'voice-status': { args: []; result: VoiceStatus };
  /**
   * Mic frames from the hidden capture renderer: 16 kHz, 16-bit LE mono PCM. This is an invoke
   * (not a send) because the preload only exposes a generic invoke; the result is ignored.
   */
  'voice-audio-in': { args: [pcm: Uint8Array]; result: void };
}

/** renderer -> main, fire-and-forget: 'channel': [...args] */
// eslint-disable-next-line @typescript-eslint/no-empty-interface
export interface IntelligenceSend {}

/** main -> renderer events: 'channel': payload */
export interface IntelligenceEvents {
  /** Encoded TTS audio, in order. The first chunk of a new utteranceId starts playback. */
  'voice-audio-out': { utteranceId: number; mimeType: string; chunk: Uint8Array };
  /** Drop queued audio now (barge-in, "stop"). */
  'voice-stop-playback': { utteranceId: number };
  /** Green dot on the mascot: true while the mic is live. */
  'voice-mic': boolean;
  /** Friendly message for a bubble when voice breaks (STT reconnects exhausted). */
  'voice-trouble': string;
}
