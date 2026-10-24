import { describe, expect, it } from 'vitest';
import { ElevenLabsTts, TTS_OUTPUT_FORMAT, type FetchLike } from '../elevenlabs-tts.js';
import { ElevenLabsStt, MAX_RECONNECTS, type SocketFactory, type SocketLike } from '../elevenlabs-stt.js';
import { NO_KEY_NOTE, NO_VOICE_ID_NOTE, selectVoiceProviders } from '../providers.js';
import { MockSttProvider, MockTtsProvider } from '../mock.js';
import type { SttHandlers } from '../types.js';

// ---- TTS ----------------------------------------------------------------------------------

function streamOf(chunks: Uint8Array[], onCancel?: () => void, gate?: Promise<void>) {
  let i = 0;
  return {
    getReader: () => ({
      async read() {
        if (gate && i === 1) await gate;
        return i < chunks.length ? { done: false, value: chunks[i++] } : { done: true as const };
      },
      async cancel() {
        onCancel?.();
      }
    })
  };
}

describe('ElevenLabsTts', () => {
  it('posts to the streaming endpoint with the key in a header and yields whole PCM samples', async () => {
    const seen: Array<{ url: string; headers: Record<string, string>; body: string }> = [];
    const fetchFn: FetchLike = async (url, init) => {
      seen.push({ url, headers: init.headers, body: init.body });
      // 3 + 4 + 2 bytes: samples straddle chunk boundaries
      return { ok: true, status: 200, body: streamOf([new Uint8Array([1, 2, 3]), new Uint8Array([4, 5, 6, 7]), new Uint8Array([8, 9])]) };
    };
    const tts = new ElevenLabsTts({ apiKey: 'KEY123', voiceId: 'voice-1', model: 'eleven_flash_v2_5', fetch: fetchFn });
    expect(tts.format).toEqual({ mimeType: 'audio/pcm;rate=16000' });

    const out: number[][] = [];
    for await (const chunk of tts.synthesize('Hello there.', new AbortController().signal)) out.push([...chunk]);

    expect(out.flat()).toEqual([1, 2, 3, 4, 5, 6, 7, 8]); // the trailing odd byte never completes a sample
    expect(out.every((c) => c.length % 2 === 0)).toBe(true);
    expect(seen[0].url).toBe(`https://api.elevenlabs.io/v1/text-to-speech/voice-1/stream?output_format=${TTS_OUTPUT_FORMAT}`);
    expect(seen[0].headers['xi-api-key']).toBe('KEY123');
    expect(JSON.parse(seen[0].body)).toEqual({ text: 'Hello there.', model_id: 'eleven_flash_v2_5' });
    expect(seen[0].url).not.toContain('KEY123');
  });

  it('aborts on barge-in: the signal reaches fetch, the stream is cancelled, and no more audio is yielded', async () => {
    const controller = new AbortController();
    let cancelled = false;
    let fetchSignal: AbortSignal | undefined;
    let release!: () => void;
    const gate = new Promise<void>((r) => (release = r));
    const fetchFn: FetchLike = async (_url, init) => {
      fetchSignal = init.signal;
      return { ok: true, status: 200, body: streamOf([new Uint8Array(4), new Uint8Array(4), new Uint8Array(4)], () => (cancelled = true), gate) };
    };
    const tts = new ElevenLabsTts({ apiKey: 'k', voiceId: 'v', fetch: fetchFn });
    const got: number[] = [];
    const done = (async () => {
      for await (const chunk of tts.synthesize('A long reply.', controller.signal)) got.push(chunk.length);
    })();
    await new Promise((r) => setTimeout(r, 5));
    controller.abort(); // student starts talking
    release();
    await done;
    expect(fetchSignal).toBe(controller.signal);
    expect(got).toEqual([4]);
    expect(cancelled).toBe(true);
  });

  it('fails with a message that does not contain the key, and demands a voice id', async () => {
    const fetchFn: FetchLike = async () => ({ ok: false, status: 401, body: null });
    const tts = new ElevenLabsTts({ apiKey: 'SECRETKEY', voiceId: 'v', fetch: fetchFn });
    await expect(
      (async () => {
        for await (const chunk of tts.synthesize('x', new AbortController().signal)) void chunk;
      })()
    ).rejects.toThrow(/HTTP 401/);
    await expect(
      (async () => {
        for await (const chunk of tts.synthesize('x', new AbortController().signal)) void chunk;
      })()
    ).rejects.not.toThrow(/SECRETKEY/);
    expect(() => new ElevenLabsTts({ apiKey: 'k', voiceId: '' })).toThrow(/ELEVENLABS_VOICE_ID/);
    expect(() => new ElevenLabsTts({ apiKey: '', voiceId: 'v' })).toThrow();
  });
});

// ---- STT ----------------------------------------------------------------------------------

class FakeSocket implements SocketLike {
  onopen: ((ev: unknown) => void) | null = null;
  onmessage: ((ev: { data: unknown }) => void) | null = null;
  onclose: ((ev: { code?: number }) => void) | null = null;
  onerror: ((ev: unknown) => void) | null = null;
  sent: Array<Record<string, any>> = [];
  closed = false;
  constructor(
    readonly url: string,
    readonly headers: Record<string, string>
  ) {}
  send(data: string) {
    this.sent.push(JSON.parse(data));
  }
  close() {
    this.closed = true;
  }
  /** Server -> client */
  emit(message: Record<string, unknown>) {
    this.onmessage?.({ data: JSON.stringify(message) });
  }
  drop() {
    this.onclose?.({ code: 1006 });
  }
}

function harness(opts: { failToCreate?: number } = {}) {
  const sockets: FakeSocket[] = [];
  const timers: Array<{ fn: () => void; ms: number; id: number; live: boolean }> = [];
  const events: string[] = [];
  const transcripts: string[] = [];
  const partials: string[] = [];
  const errors: Error[] = [];
  let created = 0;
  const socketFactory: SocketFactory = (url, headers) => {
    created++;
    if (created <= (opts.failToCreate ?? 0)) throw new Error('connect refused');
    const s = new FakeSocket(url, headers);
    sockets.push(s);
    return s;
  };
  const handlers: SttHandlers = {
    onPartial: (t) => void partials.push(t),
    onTranscript: (t) => void transcripts.push(t),
    onError: (e) => void errors.push(e),
    onStatus: (s) => void events.push(s)
  };
  const provider = new ElevenLabsStt({
    apiKey: 'KEY123',
    socketFactory,
    backoffMs: () => 0,
    turnTimeoutMs: 1000,
    setTimer: (fn, ms) => {
      const t = { fn, ms, id: timers.length, live: true };
      timers.push(t);
      return t.id;
    },
    clearTimer: (id) => {
      const t = timers[id as number];
      if (t) t.live = false;
    }
  });
  /** Runs timers that are due, shortest first (we do not model time, only order). */
  const fire = (predicate: (t: { ms: number }) => boolean = () => true) => {
    for (const t of [...timers]) {
      if (t.live && predicate(t)) {
        t.live = false;
        t.fn();
      }
    }
  };
  return { provider, sockets, handlers, events, transcripts, partials, errors, timers, fire, created: () => created };
}

describe('ElevenLabsStt', () => {
  it('connects with the key in a header (not the URL), streams base64 PCM, and routes transcripts', async () => {
    const h = harness();
    const session = await h.provider.start(h.handlers);
    const socket = h.sockets[0];
    expect(socket.headers).toEqual({ 'xi-api-key': 'KEY123' });
    expect(socket.url).toContain('wss://api.elevenlabs.io/v1/speech-to-text/realtime?');
    expect(socket.url).toContain('model_id=scribe_v2_realtime');
    expect(socket.url).toContain('audio_format=pcm_16000');
    expect(socket.url).toContain('commit_strategy=vad');
    expect(socket.url).not.toContain('KEY123');

    session.write(new Uint8Array([1, 2])); // before session_started: dropped
    expect(socket.sent).toHaveLength(0);

    socket.emit({ message_type: 'session_started', session_id: 's' });
    expect(h.events).toEqual(['connecting', 'live']);
    session.write(new Uint8Array([1, 2, 3, 4]));
    expect(socket.sent[0]).toEqual({ message_type: 'input_audio_chunk', audio_base_64: 'AQIDBA==', commit: false, sample_rate: 16000 });

    socket.emit({ message_type: 'partial_transcript', text: 'I don' });
    socket.emit({ message_type: 'committed_transcript', text: " I don't get step 2 " });
    expect(h.partials).toEqual(['I don']);
    expect(h.transcripts).toEqual(["I don't get step 2"]);
    socket.emit({ message_type: 'committed_transcript', text: '   ' });
    expect(h.transcripts).toHaveLength(1);

    session.close();
    expect(socket.closed).toBe(true);
    expect(h.events[h.events.length - 1]).toBe('closed');
  });

  it('reconnects three times, then reports failure exactly once', async () => {
    const h = harness();
    await h.provider.start(h.handlers);
    // The server accepts every connection and drops it at once, four times in a row
    for (let attempt = 0; attempt <= MAX_RECONNECTS; attempt++) {
      expect(h.sockets).toHaveLength(attempt + 1);
      expect(h.errors).toHaveLength(0);
      h.sockets[attempt].drop();
      h.fire((t) => t.ms === 0); // the backoff timer (ms 0 in this test)
    }
    expect(h.sockets).toHaveLength(MAX_RECONNECTS + 1); // 1 initial + 3 reconnects
    expect(h.errors).toHaveLength(1);
    expect(h.errors[0].message).toMatch(/3 reconnect/);
    expect(h.events).toContain('reconnecting');
    expect(h.events[h.events.length - 1]).toBe('closed');
    h.fire();
    expect(h.sockets).toHaveLength(MAX_RECONNECTS + 1); // nothing more happens
  });

  it('counts failed attempts to create the socket too, and the counter resets after a good session', async () => {
    const h = harness({ failToCreate: 2 });
    await h.provider.start(h.handlers);
    h.fire((t) => t.ms === 0);
    h.fire((t) => t.ms === 0);
    expect(h.sockets).toHaveLength(1); // third try succeeds
    h.sockets[0].emit({ message_type: 'session_started', session_id: 's' });
    // three more drops in a row are survivable because the counter was reset
    for (let i = 0; i < 3; i++) {
      h.sockets[i].drop();
      h.fire((t) => t.ms === 0);
      h.sockets[i + 1].emit({ message_type: 'session_started', session_id: 's' });
    }
    expect(h.errors).toHaveLength(0);
  });

  it('a socket that never says session_started counts as a failed attempt', async () => {
    const h = harness();
    await h.provider.start(h.handlers);
    h.fire((t) => t.ms === 8000); // the connect timeout
    expect(h.timers.some((t) => t.ms === 0 && t.live)).toBe(true);
    h.fire((t) => t.ms === 0);
    expect(h.sockets).toHaveLength(2);
  });

  it('does not reconnect after a fatal error (bad key), and says why without the key', async () => {
    const h = harness();
    await h.provider.start(h.handlers);
    h.sockets[0].emit({ message_type: 'auth_error', error: 'bad key KEY123' });
    h.fire();
    expect(h.sockets).toHaveLength(1);
    expect(h.errors).toHaveLength(1);
    expect(h.errors[0].message).toMatch(/rejected the API key/);
    expect(h.errors[0].message).not.toContain('KEY123');
  });

  it('reconnects on transient server errors; ignores quiet-audio notices', async () => {
    const h = harness();
    await h.provider.start(h.handlers);
    h.sockets[0].emit({ message_type: 'session_started', session_id: 's' });
    h.sockets[0].emit({ message_type: 'insufficient_audio_activity', error: 'quiet' });
    expect(h.sockets).toHaveLength(1);
    h.sockets[0].emit({ message_type: 'session_time_limit_exceeded', error: 'long' });
    h.fire((t) => t.ms === 0);
    expect(h.sockets).toHaveLength(2);
    expect(h.errors).toHaveLength(0);
  });

  it('commits by hand when the server stays silent after a partial transcript (end-of-turn fallback)', async () => {
    const h = harness();
    const session = await h.provider.start(h.handlers);
    const socket = h.sockets[0];
    socket.emit({ message_type: 'session_started', session_id: 's' });
    socket.emit({ message_type: 'partial_transcript', text: 'another hint' });
    h.fire((t) => t.ms === 1000);
    expect(socket.sent[socket.sent.length - 1]).toMatchObject({ commit: true, audio_base_64: '' });

    // A server commit cancels the fallback
    socket.sent.length = 0;
    socket.emit({ message_type: 'partial_transcript', text: 'got it' });
    socket.emit({ message_type: 'committed_transcript', text: 'got it' });
    h.fire((t) => t.ms === 1000);
    expect(socket.sent).toHaveLength(0);
    session.close();
  });

  it('stops everything when closed, including pending reconnects', async () => {
    const h = harness();
    const session = await h.provider.start(h.handlers);
    h.sockets[0].drop();
    session.close();
    h.fire();
    expect(h.sockets).toHaveLength(1);
    expect(h.errors).toHaveLength(0);
  });
});

describe('selectVoiceProviders', () => {
  const deps = { socketFactory: (() => new FakeSocket('', {})) as SocketFactory };
  const both = { stt: 'elevenlabs', tts: 'elevenlabs' } as const;

  it('DEMO_MODE forces the mocks, even with a key', () => {
    const c = selectVoiceProviders({ DEMO_MODE: '1', ELEVENLABS_API_KEY: 'k', ELEVENLABS_VOICE_ID: 'v' }, both, deps);
    expect(c.stt).toBeInstanceOf(MockSttProvider);
    expect(c.tts).toBeInstanceOf(MockTtsProvider);
    expect(c.note).toBeNull();
  });

  it('no key means mocks and a friendly note', () => {
    const c = selectVoiceProviders({}, both, deps);
    expect(c.stt.name).toBe('mock');
    expect(c.note).toBe(NO_KEY_NOTE);
    expect(c.hasKey).toBe(false);
  });

  it('a key and a voice id select ElevenLabs; a missing voice id keeps TTS on the mock with a note', () => {
    const ok = selectVoiceProviders({ ELEVENLABS_API_KEY: 'k', ELEVENLABS_VOICE_ID: 'v' }, both, deps);
    expect([ok.stt.name, ok.tts.name, ok.note]).toEqual(['elevenlabs', 'elevenlabs', null]);
    const noVoice = selectVoiceProviders({ ELEVENLABS_API_KEY: 'k' }, both, deps);
    expect([noVoice.stt.name, noVoice.tts.name, noVoice.note]).toEqual(['elevenlabs', 'mock', NO_VOICE_ID_NOTE]);
  });

  it('honors the provider settings', () => {
    const c = selectVoiceProviders({ ELEVENLABS_API_KEY: 'k', ELEVENLABS_VOICE_ID: 'v' }, { stt: 'mock', tts: 'elevenlabs' }, deps);
    expect([c.stt.name, c.tts.name]).toEqual(['mock', 'elevenlabs']);
  });
});
