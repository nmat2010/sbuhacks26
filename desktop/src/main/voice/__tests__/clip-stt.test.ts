import { describe, expect, it } from 'vitest';
import { createClipStt, MAX_CLIP_BYTES, type ClipFetch } from '../clip-stt.js';

function fakeFetch(reply: { status: number; body?: unknown } | Error) {
  const calls: Array<{ url: string; headers: Record<string, string>; form: FormData }> = [];
  const fetch: ClipFetch = async (url, init) => {
    calls.push({ url, headers: init.headers, form: init.body });
    if (reply instanceof Error) throw reply;
    return { ok: reply.status < 300, status: reply.status, json: async () => reply.body };
  };
  return { fetch, calls };
}

const clip = new Uint8Array([1, 2, 3, 4]);

describe('clip speech-to-text (push-to-talk)', () => {
  it('sends the clip with the model and key, and returns the words', async () => {
    const f = fakeFetch({ status: 200, body: { text: ' What is overfitting? ' } });
    const res = await createClipStt({ apiKey: 'k', fetch: f.fetch })(clip, 'audio/webm;codecs=opus');
    expect(res).toEqual({ ok: true, text: 'What is overfitting?' });
    expect(f.calls[0].url).toBe('https://api.elevenlabs.io/v1/speech-to-text');
    expect(f.calls[0].headers['xi-api-key']).toBe('k');
    expect(f.calls[0].form.get('model_id')).toBe('scribe_v2');
    expect((f.calls[0].form.get('file') as Blob).size).toBe(4);
  });

  it('friendly errors: no words, bad key, HTTP failure, offline; never the key', async () => {
    const empty = await createClipStt({ apiKey: 'k', fetch: fakeFetch({ status: 200, body: { text: '' } }).fetch })(clip, 'audio/webm');
    expect(empty).toMatchObject({ ok: false, error: expect.stringContaining("didn't catch any words") });
    const auth = await createClipStt({ apiKey: 'secret', fetch: fakeFetch({ status: 401 }).fetch })(clip, 'audio/webm');
    expect(auth).toMatchObject({ ok: false, error: 'ElevenLabs rejected the API key.' });
    const http = await createClipStt({ apiKey: 'secret', fetch: fakeFetch({ status: 500 }).fetch })(clip, 'audio/webm');
    expect(http.ok === false && http.error).toContain('HTTP 500');
    const offline = await createClipStt({ apiKey: 'secret', fetch: fakeFetch(new Error('ENOTFOUND')).fetch })(clip, 'audio/webm');
    expect(offline.ok === false && offline.error).toContain("couldn't reach ElevenLabs");
    expect(JSON.stringify([auth, http, offline])).not.toContain('secret');
  });

  it('refuses an empty or oversized clip without calling ElevenLabs', async () => {
    const f = fakeFetch({ status: 200, body: { text: 'x' } });
    const stt = createClipStt({ apiKey: 'k', fetch: f.fetch });
    expect((await stt(new Uint8Array(0), 'audio/webm')).ok).toBe(false);
    expect((await stt(new Uint8Array(MAX_CLIP_BYTES + 1), 'audio/webm')).ok).toBe(false);
    expect(f.calls).toHaveLength(0);
  });
});
