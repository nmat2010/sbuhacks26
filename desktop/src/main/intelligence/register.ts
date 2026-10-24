// Agent B (Intelligence) wires its modules here: LLM client, escalation runtime, hint service,
// voice providers/router, plan, papers, reading. main.ts calls this once after the DB and
// NudgeQueue are ready. Only register files may import `electron` or `../ipc.js`; logic modules
// get them injected.

import { join } from 'path';
import { app, desktopCapturer, dialog, globalShortcut, nativeImage, systemPreferences } from 'electron';
import type { NudgeResponse } from '@wolfie/shared';
import { stuckBus } from '../stuck/bus.js';
import { ACTIONS } from '../stuck/actions.js';
import { EscalationEngine } from '../stuck/engine.js';
import { logEvent } from '../events.js';
import { setMascotState } from '../overlay/state.js';
import { requestPageSummary } from '../sync/context.js';
import { captureActiveWindow } from '../hints/capture.js';
import { HintFlow } from '../hints/flow.js';
import { configureHintService, getHintService } from '../hints/index.js';
import { registerHelpHotkey } from './hotkey.js';
import { handle, broadcast } from '../ipc.js';
import { getNudgeQueue } from '../nudge/index.js';
import { getActiveSession, isPaused, sessionEvents } from '../session/index.js';
import { getSetting, setSetting, settingsEvents } from '../settings.js';
import { initLLMClient } from '../llm/client.js';
import { voiceBus } from '../voice/bus.js';
import { MockSttProvider, MockTtsProvider } from '../voice/mock.js';
import { attachNudgeSpeech } from '../voice/nudge-speech.js';
import { createVoiceService, type VoiceService } from '../voice/service.js';
import type { IntentHandler } from '../voice/router.js';
import type { VoiceIntent } from '../voice/intents.js';

const cleanups: Array<() => void> = [];
let voice: VoiceService | null = null;
let engine: EscalationEngine | null = null;
let flow: HintFlow | null = null;

/** Voice intent handlers, filled in below as the modules they act on are created. */
const voiceHandlers: Partial<Record<Exclude<VoiceIntent, 'stop' | 'repeat' | 'stuck'>, IntentHandler>> = {};

function safeLog(type: Parameters<typeof logEvent>[0], payload: Record<string, unknown>): void {
  try {
    logEvent(type, payload);
  } catch (error) {
    console.error(`[intelligence] could not log ${type}:`, error);
  }
}

export function registerIntelligence(): void {
  initLLMClient();
  configureHintService({ imageDir: join(app.getPath('userData'), 'images') });
  registerVoice();
  registerEscalation();
  registerHintFlow();
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
    log: safeLog
  });
  engine.start();

  const off = registerHelpHotkey(globalShortcut, (trigger) => stuckBus.emit('help-requested', trigger));
  if (off) cleanups.push(off);
}

function registerHintFlow(): void {
  const queue = getNudgeQueue();
  const hints = getHintService();

  flow = new HintFlow({
    now: Date.now,
    bus: stuckBus,
    getSession: () => {
      const s = getActiveSession();
      return s ? { id: s.id, assessmentMode: s.assessmentMode } : null;
    },
    isPaused,
    requestPageSummary,
    capture: () =>
      captureActiveWindow({
        desktopCapturer,
        screenAccess: () => systemPreferences.getMediaAccessStatus('screen'),
        thumbnailSize: { width: 1280, height: 800 }
      }),
    // First capture per session: show what will be sent and ask (SPEC 4e.1)
    confirmCapture: async (dataUrl) => {
      const { response } = await dialog.showMessageBox({
        type: 'question',
        title: 'Wolfie',
        message: 'Can I look at your screen?',
        detail: 'This picture goes to the AI so Wolfie can help with your hint. It is not saved unless you turn that on in settings.',
        buttons: ['Send it', 'Not now'],
        defaultId: 0,
        cancelId: 1,
        icon: nativeImage.createFromDataURL(dataUrl).resize({ width: 256 })
      });
      return response === 0;
    },
    requestHints: (c, s, a) => hints.requestHints(c, s, a),
    requestFollowup: (f, c, s, a) => hints.requestFollowup(f, c, s, a),
    logLevelShown: (entry) => hints.logLevelShown(entry),
    push: (nudge) => queue.push(nudge, { userInitiated: true }),
    respond: (response) => queue.respond(response),
    onNudgeResponse: (fn) => {
      const listener = (response: NudgeResponse) => fn(response);
      queue.on('response', listener);
      return () => void queue.off('response', listener);
    },
    onSessionChange: (fn) => sessionEvents.on('change', fn),
    setLadderOpen: (open) => engine?.setLadderOpen(open),
    markImGood: () => engine?.imGood(),
    log: safeLog
  });
  flow.start();
  const idleTimer = setInterval(() => flow?.tick(), 5_000);
  cleanups.push(() => clearInterval(idleTimer));

  // Voice answers act on whatever is on screen: an open ladder first, else the level-3 offer
  voiceHandlers.another_hint = () => flow?.answer(ACTIONS.ANOTHER_HINT) ?? false;
  voiceHandlers.got_it = () => flow?.answer(ACTIONS.GOT_IT) ?? false;
  voiceHandlers.show_answer = () => flow?.answer(ACTIONS.SHOW_ANSWER) ?? false;
  voiceHandlers.im_good = () => {
    if (flow?.answer(ACTIONS.IM_GOOD)) return true;
    const offerId = engine?.offerId();
    if (!offerId) return false;
    queue.respond({ id: offerId, action: ACTIONS.IM_GOOD, via: 'voice' });
    return true;
  };

  // Any nudge with spokenText is spoken in voice mode (hint bubbles carry the first two sentences)
  cleanups.push(attachNudgeSpeech(queue, (text) => voice?.speakIfVoice(text) ?? false));
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
    hasOpenLadder: () => flow?.hasOpenLadder() ?? false,
    onFollowup: (utterance) => flow?.followup(utterance),
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
  flow?.stop();
  flow = null;
  engine?.stop();
  engine = null;
  voice?.stop();
  voice = null;
}
