// Push-to-talk: the overlay records while the student holds the mic button, and the whole clip is
// transcribed in one request (ElevenLabs speech-to-text, not the realtime socket voice mode uses):
//   POST {base}/v1/speech-to-text   headers: xi-api-key   multipart: model_id, file
// The text then goes into the chat like a typed message.

export const DEFAULT_CLIP_STT_MODEL = 'scribe_v2';
/** Longer clips are refused (a stuck button shouldn't upload minutes of audio). */
export const MAX_CLIP_BYTES = 4 * 1024 * 1024;

export type ClipFetch = (url: string, init: { method: string; headers: Record<string, string>; body: FormData; signal: AbortSignal }) => Promise<{
  ok: boolean;
  status: number;
  json(): Promise<unknown>;
}>;

export interface ClipSttOptions {
  apiKey: string;
  model?: string;
  baseUrl?: string;
  fetch?: ClipFetch;
  timeoutMs?: number;
}

export type ClipResult = { ok: true; text: string } | { ok: false; error: string };

export function createClipStt(opts: ClipSttOptions) {
  const base = (opts.baseUrl ?? 'https://api.elevenlabs.io').replace(/\/$/, '');
  const fetchFn: ClipFetch = opts.fetch ?? ((url, init) => fetch(url, init));

  return async function transcribe(audio: Uint8Array, mimeType: string): Promise<ClipResult> {
    if (!audio.byteLength) return { ok: false, error: "I didn't hear anything. Hold the mic button while you talk." };
    if (audio.byteLength > MAX_CLIP_BYTES) return { ok: false, error: 'That recording was too long. Try a shorter question.' };
    const form = new FormData();
    form.append('model_id', opts.model || DEFAULT_CLIP_STT_MODEL);
    form.append('file', new Blob([new Uint8Array(audio)], { type: mimeType || 'audio/webm' }), 'question.webm');
    try {
      const res = await fetchFn(`${base}/v1/speech-to-text`, {
        method: 'POST',
        headers: { 'xi-api-key': opts.apiKey },
        body: form,
        signal: AbortSignal.timeout(opts.timeoutMs ?? 20_000)
      });
      // Never include the request (it carries the key) in the error
      if (!res.ok) {
        return {
          ok: false,
          error: res.status === 401 ? 'ElevenLabs rejected the API key.' : `I couldn't understand the recording (ElevenLabs HTTP ${res.status}).`
        };
      }
      const text = String(((await res.json()) as { text?: unknown }).text ?? '').trim();
      return text ? { ok: true, text } : { ok: false, error: "I didn't catch any words. Try again a little closer to the mic." };
    } catch {
      return { ok: false, error: "I couldn't reach ElevenLabs to understand that. Check your connection, or type instead." };
    }
  };
}

export type ClipStt = ReturnType<typeof createClipStt>;
