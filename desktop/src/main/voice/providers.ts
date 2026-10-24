import { ElevenLabsStt, type SocketFactory } from './elevenlabs-stt.js';
import { ElevenLabsTts, type FetchLike } from './elevenlabs-tts.js';
import { MockSttProvider, MockTtsProvider } from './mock.js';
import type { SttProvider, TtsProvider } from './types.js';

// Chooses real or mock speech providers (SPEC Phase 1): DEMO_MODE=1 forces the mocks; with no
// ElevenLabs key voice stays off with a friendly note and everything still works by text.

export interface VoiceEnv {
  DEMO_MODE?: string;
  ELEVENLABS_API_KEY?: string;
  ELEVENLABS_VOICE_ID?: string;
  ELEVENLABS_TTS_MODEL?: string;
  ELEVENLABS_STT_MODEL?: string;
}

export interface VoiceProviderSettings {
  stt: 'elevenlabs' | 'mock';
  tts: 'elevenlabs' | 'mock';
}

export interface VoiceProviderChoice {
  stt: SttProvider;
  tts: TtsProvider;
  /** Something to tell the student (missing key or voice id); null when all is well. */
  note: string | null;
  hasKey: boolean;
}

export const NO_KEY_NOTE =
  'Voice needs an ElevenLabs key. Add ELEVENLABS_API_KEY to your .env file and restart Wolfie. Typing still works.';
export const NO_VOICE_ID_NOTE =
  'Voice needs a voice id. Add ELEVENLABS_VOICE_ID (from your ElevenLabs account) to your .env file and restart Wolfie. Typing still works.';

export function selectVoiceProviders(
  env: VoiceEnv,
  settings: VoiceProviderSettings,
  deps: { socketFactory: SocketFactory; fetch?: FetchLike }
): VoiceProviderChoice {
  const mock = (note: string | null, hasKey: boolean): VoiceProviderChoice => ({
    stt: new MockSttProvider(),
    tts: new MockTtsProvider(),
    note,
    hasKey
  });
  if (env.DEMO_MODE === '1') return mock(null, Boolean(env.ELEVENLABS_API_KEY));
  const apiKey = env.ELEVENLABS_API_KEY;
  if (!apiKey) return mock(NO_KEY_NOTE, false);

  let note: string | null = null;
  let stt: SttProvider = new MockSttProvider();
  let tts: TtsProvider = new MockTtsProvider();
  if (settings.stt === 'elevenlabs') {
    stt = new ElevenLabsStt({ apiKey, model: env.ELEVENLABS_STT_MODEL || undefined, socketFactory: deps.socketFactory, log: (l) => console.log(l) });
  }
  if (settings.tts === 'elevenlabs') {
    if (env.ELEVENLABS_VOICE_ID) {
      tts = new ElevenLabsTts({ apiKey, voiceId: env.ELEVENLABS_VOICE_ID, model: env.ELEVENLABS_TTS_MODEL || undefined, fetch: deps.fetch });
    } else {
      note = NO_VOICE_ID_NOTE;
    }
  }
  return { stt, tts, note, hasKey: true };
}
