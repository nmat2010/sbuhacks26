// Agent B (Intelligence) wires its modules here: LLM client, escalation runtime, hint service,
// voice providers/router, plan, papers, reading. main.ts calls this once after the DB and
// NudgeQueue are ready. Only register files may import `electron` or `../ipc.js`; logic modules
// get them injected.

import { stuckBus } from '../stuck/bus.js';
import { handle, broadcast } from '../ipc.js';
import { getNudgeQueue } from '../nudge/index.js';
import { getActiveSession, isPaused, sessionEvents } from '../session/index.js';
import { getSetting, setSetting, settingsEvents } from '../settings.js';
import { initLLMClient } from '../llm/client.js';
import { voiceBus } from '../voice/bus.js';
import { MockSttProvider, MockTtsProvider } from '../voice/mock.js';
import { createVoiceService, type VoiceService } from '../voice/service.js';
import type { IntentHandler } from '../voice/router.js';
import type { VoiceIntent } from '../voice/intents.js';

const cleanups: Array<() => void> = [];
let voice: VoiceService | null = null;

/** Voice intent handlers other packages fill in (B2: im_good; B3b: another_hint, got_it, show_answer). */
const voiceHandlers: Partial<Record<Exclude<VoiceIntent, 'stop' | 'repeat' | 'stuck'>, IntentHandler>> = {};

export function registerIntelligence(): void {
  initLLMClient();
  registerVoice();
}

function registerVoice(): void {
  // B5b swaps these for ElevenLabs providers when a key is present.
  const stt = new MockSttProvider();
  const tts = new MockTtsProvider();

  voiceHandlers.snooze = () => getNudgeQueue().snooze();
  voiceHandlers.mute = () => {
    setSetting('voice.enabled', false);
    broadcast('voice-toggle', false);
  };

  voice = createVoiceService({
    now: Date.now,
    stt: () => stt,
    tts: () => tts,
    voiceEnabled: () => getSetting('voice.enabled'),
    sessionActive: () => getActiveSession() !== null,
    isPaused,
    handlers: voiceHandlers,
    hasOpenLadder: () => false,
    onFollowup: () => undefined,
    requestHelp: (trigger) => stuckBus.emit('help-requested', trigger),
    announce: (intent, transcript) => voiceBus.emit('intent', intent, transcript),
    sendAudio: (chunk, meta) => broadcast('voice-audio-out', { ...meta, chunk }),
    sendStopPlayback: (utteranceId) => broadcast('voice-stop-playback', { utteranceId }),
    sendMic: (live) => broadcast('voice-mic', live),
    sendTrouble: (message) => broadcast('voice-trouble', message),
    log: (line) => console.log(line)
  });

  const refresh = () => void voice?.refresh();
  cleanups.push(sessionEvents.on('change', refresh));
  cleanups.push(sessionEvents.on('pause', refresh));
  cleanups.push(
    settingsEvents.on('change', (key) => {
      if (key === 'voice.enabled') refresh();
    })
  );

  handle('voice-utterance', async (text) => {
    const result = await voice!.utterance(text);
    const route =
      result.kind === 'intent'
        ? `intent:${result.intent}`
        : result.kind === 'dropped'
          ? `dropped:${result.reason}`
          : result.kind;
    return { success: true, route };
  });
  handle('voice-status', async () => ({
    enabled: getSetting('voice.enabled'),
    sttProvider: stt.name,
    ttsProvider: tts.name,
    micLive: voice!.controller.micLive,
    hasVoiceKey: Boolean(process.env.ELEVENLABS_API_KEY)
  }));
  handle('voice-audio-in', async (pcm) => voice?.writeAudio(pcm));

  refresh();
}

/** Called on quit. */
export function unregisterIntelligence(): void {
  while (cleanups.length) cleanups.pop()!();
  voice?.stop();
  voice = null;
}
