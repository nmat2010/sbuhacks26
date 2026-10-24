// Agent B (Intelligence) wires its modules here: LLM client, escalation runtime, hint service,
// voice providers/router, plan, papers, reading. main.ts calls this once after the DB and
// NudgeQueue are ready. Only register files may import `electron` or `../ipc.js`; logic modules
// get them injected.

import { join } from 'path';
import { app, globalShortcut } from 'electron';
import type { NudgeResponse } from '@wolfie/shared';
import { stuckBus } from '../stuck/bus.js';
import { EscalationEngine } from '../stuck/engine.js';
import { logEvent } from '../events.js';
import { setMascotState } from '../overlay/state.js';
import { configureHintService } from '../hints/index.js';
import { registerHelpHotkey } from './hotkey.js';
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
let engine: EscalationEngine | null = null;

/** Voice intent handlers other packages fill in (B2: im_good; B3b: another_hint, got_it, show_answer). */
const voiceHandlers: Partial<Record<Exclude<VoiceIntent, 'stop' | 'repeat' | 'stuck'>, IntentHandler>> = {};

export function registerIntelligence(): void {
  initLLMClient();
  configureHintService({ imageDir: join(app.getPath('userData'), 'images') });
  registerVoice();
  registerEscalation();
}

function registerEscalation(): void {
  const queue = getNudgeQueue();
  engine = new EscalationEngine({
    now: Date.now,
    bus: stuckBus,
    getSession: getActiveSession,
    onSessionChange: (fn) => sessionEvents.on('change', fn),
    isPaused,
    isSnoozed: () => queue.isSnoozed(),
    voiceMode: () => getSetting('voice.enabled'),
    thresholds: () => getSetting('stuck.thresholds'),
    idleMinutes: () => getSetting('stuck.idle_minutes'),
    push: (nudge) => queue.push(nudge),
    onNudgeResponse: (fn) => {
      const listener = (response: NudgeResponse) => fn(response);
      queue.on('response', listener);
      return () => void queue.off('response', listener);
    },
    setMascotState,
    speak: (text) => void voice?.speakIfVoice(text),
    log: (type, payload) => {
      try {
        logEvent(type, payload);
      } catch (error) {
        console.error('[engine] could not log event:', error);
      }
    }
  });
  engine.start();

  // "I'm good" by voice applies to an open offer or an open ladder
  voiceHandlers.im_good = () => {
    if (!engine || (!engine.hasOpenOffer() && !engine.isLadderOpen())) return false;
    engine.imGood();
    return true;
  };

  const off = registerHelpHotkey(globalShortcut, (trigger) => stuckBus.emit('help-requested', trigger));
  if (off) cleanups.push(off);
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
  engine?.stop();
  engine = null;
  voice?.stop();
  voice = null;
}
