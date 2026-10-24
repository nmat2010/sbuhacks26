import type { TtsAudioFormat, TtsProvider } from './types.js';

// ElevenLabs text-to-speech over HTTP streaming:
//   POST {base}/v1/text-to-speech/{voice_id}/stream?output_format=pcm_16000
//   headers: xi-api-key, Content-Type: application/json;  body: { text, model_id }
// The response body is raw audio. We ask for 16-bit little-endian mono PCM so the renderer can
// schedule chunks in Web Audio as they arrive (no MP3 frame boundaries to worry about). Aborting
// the signal cancels the HTTP stream, which is how barge-in stops playback.

export const DEFAULT_TTS_MODEL = 'eleven_flash_v2_5';
export const TTS_OUTPUT_FORMAT = 'pcm_16000';

export type FetchLike = (
  url: string,
  init: { method: string; headers: Record<string, string>; body: string; signal: AbortSignal }
) => Promise<{
  ok: boolean;
  status: number;
  body: { getReader(): { read(): Promise<{ done: boolean; value?: Uint8Array }>; cancel(): Promise<void> } } | null;
}>;

export interface ElevenLabsTtsOptions {
  apiKey: string;
  voiceId: string;
  model?: string;
  baseUrl?: string;
  fetch?: FetchLike;
}

export class ElevenLabsTts implements TtsProvider {
  readonly name = 'elevenlabs';
  readonly format: TtsAudioFormat = { mimeType: 'audio/pcm;rate=16000' };
  private readonly model: string;
  private readonly baseUrl: string;
  private readonly fetchFn: FetchLike;

  constructor(private readonly opts: ElevenLabsTtsOptions) {
    if (!opts.apiKey) throw new Error('ElevenLabs API key is required');
    if (!opts.voiceId) throw new Error('Set ELEVENLABS_VOICE_ID to a voice id from your ElevenLabs account');
    this.model = opts.model || DEFAULT_TTS_MODEL;
    this.baseUrl = (opts.baseUrl ?? 'https://api.elevenlabs.io').replace(/\/$/, '');
    this.fetchFn = opts.fetch ?? ((url, init) => fetch(url, init) as unknown as ReturnType<FetchLike>);
  }

  async *synthesize(text: string, signal: AbortSignal): AsyncIterable<Uint8Array> {
    const url = `${this.baseUrl}/v1/text-to-speech/${encodeURIComponent(this.opts.voiceId)}/stream?output_format=${TTS_OUTPUT_FORMAT}`;
    const response = await this.fetchFn(url, {
      method: 'POST',
      headers: { 'xi-api-key': this.opts.apiKey, 'Content-Type': 'application/json' },
      body: JSON.stringify({ text, model_id: this.model }),
      signal
    });
    // Never include the request (it carries the key) in the error
    if (!response.ok || !response.body) throw new Error(`ElevenLabs text-to-speech failed (HTTP ${response.status})`);

    const reader = response.body.getReader();
    let carry: Uint8Array | null = null; // a 16-bit sample can be split across network chunks
    try {
      for (;;) {
        if (signal.aborted) return;
        const { done, value } = await reader.read();
        // A chunk that arrived while the student was already talking is not played
        if (done || signal.aborted) return;
        if (!value || value.length === 0) continue;
        let chunk = value;
        if (carry) {
          const merged = new Uint8Array(carry.length + chunk.length);
          merged.set(carry, 0);
          merged.set(chunk, carry.length);
          chunk = merged;
          carry = null;
        }
        if (chunk.length % 2 === 1) {
          carry = chunk.slice(chunk.length - 1);
          chunk = chunk.slice(0, chunk.length - 1);
        }
        if (chunk.length > 0) yield chunk;
      }
    } finally {
      // Cancelling closes the HTTP stream when the consumer stopped early (barge-in)
      await reader.cancel().catch(() => undefined);
    }
  }
}
