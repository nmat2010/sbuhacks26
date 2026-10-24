// Agent B (Intelligence) wires its modules here: LLM client, escalation runtime, hint service,
// voice providers/router, plan, papers, reading. main.ts calls this once after the DB and
// NudgeQueue are ready. Only register files may import `electron` or `../ipc.js`; logic modules
// get them injected.

import { join } from 'path';
import WebSocket from 'ws';
import { app, BrowserWindow, desktopCapturer, dialog, globalShortcut, nativeImage, systemPreferences } from 'electron';
import type { NudgeResponse } from '@wolfie/shared';
import { stuckBus } from '../stuck/bus.js';
import { ACTIONS } from '../stuck/actions.js';
import { EscalationEngine } from '../stuck/engine.js';
import { getDatabase } from '../db/index.js';
import { logEvent } from '../events.js';
import { setMascotState } from '../overlay/state.js';
import { requestPageSummary } from '../sync/context.js';
import { captureActiveWindow } from '../hints/capture.js';
import { HintFlow } from '../hints/flow.js';
import { configureHintService, getHintService } from '../hints/index.js';
import { getPlanService, getPlanSnapshot, planEvents } from '../plan/index.js';
import { notifySnapshotsChanged, setPlanSnapshotProvider } from '../sync/snapshots.js';
import { getIdeasService, getPapersService } from '../papers/index.js';
import { configureReading, getReadingService } from '../reading/index.js';
import { ReadingStore } from '../reading/store.js';
import { firstSentences } from '../voice/text.js';
import { registerHelpHotkey } from './hotkey.js';
import { handle, broadcast } from '../ipc.js';
import { getNudgeQueue } from '../nudge/index.js';
import { getActiveSession, isPaused, sessionEvents } from '../session/index.js';
import { getSetting, setSetting, settingsEvents } from '../settings.js';
import { initLLMClient } from '../llm/client.js';
import { voiceBus } from '../voice/bus.js';
import { selectVoiceProviders, type VoiceProviderChoice } from '../voice/providers.js';
import type { SocketFactory } from '../voice/elevenlabs-stt.js';
import { attachNudgeSpeech } from '../voice/nudge-speech.js';
import { createVoiceService, type VoiceService } from '../voice/service.js';
import type { IntentHandler } from '../voice/router.js';
import type { VoiceIntent } from '../voice/intents.js';
import { getLLMClient, LLMClient } from '../llm/client.js';
import { PrefixedUsageStore, SqliteUsageStore } from '../llm/usage.js';
import { getForeground } from '../foreground.js';
import { getLatestPageSummary } from '../sync/context.js';
import { isExcludedDomain } from '../sync/desk-state.js';
import type { WatchHooks } from '../hints/flow.js';
import { SessionMemory } from '../watch/memory.js';
import { Watcher } from '../watch/watcher.js';
import { WatchController } from '../watch/controller.js';
import { WatchAnswerService } from '../watch/answer.js';

const cleanups: Array<() => void> = [];
let voice: VoiceService | null = null;
let engine: EscalationEngine | null = null;
let flow: HintFlow | null = null;
let watcher: Watcher | null = null;
let watchController: WatchController | null = null;
let watchAnswers: WatchAnswerService | null = null;
let watchHooks: WatchHooks | undefined;
/** The paper open in the reading view; spoken questions are answered from it. */
let focusedPaperId: string | null = null;

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
  configureReading({ papersDir: join(app.getPath('userData'), 'papers') });
  registerVoice();
  registerEscalation();
  registerWatch();
  registerHintFlow();
  registerPlan();
  registerReading();
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
    log: safeLog,
    watch: watchHooks
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

/** Domain suffix match, the same rule the hint service uses for assessment domains. */
function domainListed(domain: string | null, list: string[]): boolean {
  if (!domain) return false;
  const d = domain.toLowerCase();
  return list.some((entry) => {
    const e = entry.trim().toLowerCase().replace(/^https?:\/\//, '').replace(/\/.*$/, '');
    return e !== '' && (d === e || d.endsWith(`.${e}`));
  });
}

// Watch mode (WATCH_MODE.md): watcher + session memory + answers, and the hooks the hint flow uses.
function registerWatch(): void {
  const memory = new SessionMemory();
  // Its own daily budget (watch.calls_per_day), counted separately from hints and plans
  const client = new LLMClient({
    provider: getLLMClient().provider,
    usage: new PrefixedUsageStore(new SqliteUsageStore(), 'watch:'),
    dailyCap: () => getSetting('watch.calls_per_day'),
    timeoutMs: 20_000
  });
  const capture = () =>
    captureActiveWindow({
      desktopCapturer,
      screenAccess: () => systemPreferences.getMediaAccessStatus('screen'),
      thumbnailSize: { width: 1024, height: 640 },
      jpegQuality: 60,
      windowOnly: true
    });

  const w = new Watcher({
    now: Date.now,
    isActive: () => watchController?.isActive() ?? false,
    intervalMs: () => getSetting('watch.interval_seconds') * 1000,
    getForeground,
    isExcludedApp: (name) => {
      const n = name.trim().toLowerCase();
      return getSetting('watch.excluded_apps').some((a) => a.trim().toLowerCase() === n);
    },
    isExcludedDomain: (domain) => isExcludedDomain(domain, getSetting('monitored.excluded_domains')),
    getPageSummary: getLatestPageSummary,
    capture,
    llm: () => client,
    memory,
    // The escalation engine logs stuck.signal itself
    emitSignal: (signal) => stuckBus.emit('signal', signal),
    onContentUrl: (url) => watchController?.onContentUrl(url),
    onState: (state) => watchController?.onWatcherState(state),
    log: safeLog
  });
  watcher = w;

  const controller = new WatchController({
    now: Date.now,
    getSetting,
    setSetting,
    getSession: getActiveSession,
    isPaused,
    memory,
    watcher: w,
    importPaper: async (url) => {
      const res = await getReadingService().importPdfUrl(url);
      return res.success && res.data ? { paperId: res.data.paper.id, title: res.data.paper.title } : null;
    },
    log: safeLog
  });
  watchController = controller;

  // Questions use the main budget (api.call_limit_per_day, same usage rows as hints) but a longer
  // timeout, because Gemini may be watching a whole video to answer
  const answerClient = new LLMClient({
    provider: getLLMClient().provider,
    usage: new SqliteUsageStore(),
    dailyCap: () => getSetting('api.call_limit_per_day'),
    timeoutMs: 45_000
  });
  const answers = new WatchAnswerService({
    now: Date.now,
    memory,
    llm: () => answerClient,
    excerpts: (paperId, query, limit) => getReadingService().excerpts(paperId, query, limit),
    paperTitle: (paperId) => memory.listSources().find((s) => s.paperId === paperId)?.title ?? null,
    currentFrame: (maxAgeMs) => w.captureNow(maxAgeMs),
    assessment: () =>
      (getActiveSession()?.assessmentMode ?? false) || domainListed(getForeground()?.domain ?? null, getSetting('assessment.domains')),
    log: safeLog
  });
  watchAnswers = answers;

  watchHooks = {
    active: () => controller.isActive(),
    mode: () => answers.mode(),
    contextText: () => memory.toPromptText(6000),
    currentFrame: () => w.captureNow(20_000),
    explain: async (question) => {
      const res = await answers.ask({ question: question ?? '', inputMode: 'text', proactive: question === null });
      return res.success && res.data
        ? { ok: true as const, text: res.data.answer, label: res.data.label }
        : { ok: false as const, message: res.error ?? FALLBACK_WATCH_ERROR };
    }
  };

  cleanups.push(controller.events.on('status', (status) => broadcast('watch-state', status)));
  const refresh = () => controller.refresh();
  cleanups.push(sessionEvents.on('change', refresh));
  cleanups.push(sessionEvents.on('pause', refresh));
  cleanups.push(
    settingsEvents.on('change', (key) => {
      if (key === 'watch.enabled' || key === 'watch.consented_at') refresh();
    })
  );

  handle('watch-get', async () => controller.status());
  handle('watch-set', async (patch) => controller.set(patch ?? {}));
  handle('watch-consent', async (accepted) => controller.consent(accepted === true));
  handle('watch-memory-get', async () => controller.memoryView());
  handle('watch-memory-clear', async () => controller.clearMemory());
  handle('watch-ask', async (input) => {
    if (!controller.isOn()) return { success: false, error: 'Turn on Watch mode first, so I can follow what you are studying.' };
    return answers.ask({ question: String(input?.question ?? ''), inputMode: input?.inputMode === 'voice' ? 'voice' : 'text' });
  });

  refresh();
}

const FALLBACK_WATCH_ERROR = "Sorry, I couldn't put that together. Please try again in a moment.";

function registerPlan(): void {
  const plan = () => getPlanService();
  setPlanSnapshotProvider(getPlanSnapshot);
  cleanups.push(planEvents.on('changed', () => notifySnapshotsChanged('plan')));
  handle('plan-onboarding-get', async () => plan().getOnboarding());
  handle('plan-onboarding-save', async (input) => plan().saveOnboarding(input));
  handle('plan-get', async () => plan().view());
  handle('plan-generate', async (opts) => plan().generate(opts ?? {}));
  handle('plan-item-add', async (goalId, item) => plan().addItem(goalId, item));
  handle('plan-item-update', async (id, patch) => plan().updateItem(id, patch));
  handle('plan-item-delete', async (id) => plan().deleteItem(id));
  handle('plan-reorder', async (goalId, ids) => plan().reorder(goalId, ids));
  handle('plan-item-regenerate', async (id) => plan().regenerateItem(id));

  handle('ideas-suggest', async (goalId) => getIdeasService().suggest(goalId));
  handle('paper-add', async (input) => getPapersService().add(input));
  handle('papers-list', async () => getPapersService().list());
  handle('paper-set-status', async (id, status) => getPapersService().setStatus(id, status));
  handle('paper-delete', async (id) => getPapersService().delete(id));
}

/** What Wolfie says out loud for a paper answer: the first two sentences, without the source line. */
function spokenAnswer(answer: string): string {
  return firstSentences(answer.split('\n\nSource:')[0]);
}

function registerReading(): void {
  const reading = () => getReadingService();

  handle('paper-import-pdf', async () => {
    const parent = BrowserWindow.getFocusedWindow() ?? undefined;
    const options = { title: 'Choose a paper (PDF)', properties: ['openFile' as const], filters: [{ name: 'PDF', extensions: ['pdf'] }] };
    const picked = parent ? await dialog.showOpenDialog(parent, options) : await dialog.showOpenDialog(options);
    if (picked.canceled || picked.filePaths.length === 0) return { success: false };
    return reading().importPdfFile(picked.filePaths[0]);
  });
  handle('paper-import-arxiv', async (urlOrId, goalId) => reading().importArxiv(urlOrId, goalId));
  handle('paper-make-readable', async (id) => reading().makeReadable(id));
  handle('paper-content', async (id) => reading().content(id));
  handle('paper-questions', async (paperId) => new ReadingStore(getDatabase).listQuestions(paperId));
  handle('paper-focus', async (id) => {
    focusedPaperId = id;
  });
  handle('paper-ask', async (input) => {
    const res = await reading().ask(input);
    if (res.success && res.data && input.inputMode === 'voice') void voice?.speakIfVoice(spokenAnswer(res.data.answer));
    return res;
  });
}

function registerVoice(): void {
  // ElevenLabs when a key is set (and not DEMO_MODE), mock otherwise; `ws` is used so the
  // xi-api-key header can be sent.
  const socketFactory: SocketFactory = (url, headers) => new WebSocket(url, { headers }) as unknown as ReturnType<SocketFactory>;
  const choose = (): VoiceProviderChoice =>
    selectVoiceProviders(process.env, { stt: getSetting('voice.stt_provider'), tts: getSetting('voice.tts_provider') }, { socketFactory });
  let providers = choose();
  const announceNote = () => {
    if (providers.note && getSetting('voice.enabled')) broadcast('voice-trouble', providers.note);
  };

  voiceHandlers.snooze = () => getNudgeQueue().snooze();
  voiceHandlers.mute = () => {
    setSetting('voice.enabled', false);
    broadcast('voice-toggle', false);
  };

  voice = createVoiceService({
    now: Date.now,
    stt: () => providers.stt,
    tts: () => providers.tts,
    voiceEnabled: () => getSetting('voice.enabled'),
    sessionActive: () => getActiveSession() !== null,
    isPaused,
    handlers: voiceHandlers,
    hasOpenLadder: () => flow?.hasOpenLadder() ?? false,
    onFollowup: (utterance) => flow?.followup(utterance),
    onFreeSpeech: async (utterance) => {
      // A follow-up to a Watch-mode explanation stays in that conversation
      if (flow?.hasOpenExplanation() && (await flow.followupExplanation(utterance))) return true;
      // Watch mode answers from the whole session (the reading view's paper wins while it is open)
      if (!focusedPaperId && watchController?.isActive() && watchAnswers) {
        const res = await watchAnswers.ask({ question: utterance, inputMode: 'voice' });
        if (res.success && res.data) {
          broadcast('watch-answer', res.data);
          // Also as a bubble until the overlay chat panel (Thu, U2) shows watch-answer itself
          getNudgeQueue().push(
            {
              kind: 'other',
              level: 1,
              text: `${res.data.answer}\n\n${res.data.label}`,
              spokenText: firstSentences(res.data.answer),
              buttons: [{ label: 'Got it', action: ACTIONS.GOT_IT, variant: 'primary' }],
              priority: 8
            },
            { userInitiated: true }
          );
        } else if (res.error) {
          broadcast('voice-trouble', res.error);
        }
        return true;
      }
      if (!focusedPaperId) return false;
      const res = await getReadingService().ask({ paperId: focusedPaperId, mode: 'explain', inputMode: 'voice', question: utterance });
      if (res.success && res.data) {
        broadcast('paper-answer', res.data);
        void voice?.speakIfVoice(spokenAnswer(res.data.answer));
      } else if (res.error) {
        broadcast('voice-trouble', res.error);
      }
      return true;
    },
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
      if (key === 'voice.enabled') {
        announceNote();
        refresh();
      }
      if (key === 'voice.stt_provider' || key === 'voice.tts_provider') {
        voice?.controller.stop();
        providers = choose();
        refresh();
      }
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
    sttProvider: providers.stt.name,
    ttsProvider: providers.tts.name,
    micLive: voice!.controller.micLive,
    hasVoiceKey: providers.hasKey,
    note: providers.note
  }));
  handle('voice-audio-in', async (pcm) => voice?.writeAudio(pcm));

  announceNote();
  refresh();
}

/** Called on quit. */
export function unregisterIntelligence(): void {
  while (cleanups.length) cleanups.pop()!();
  watcher?.stop();
  watcher = null;
  watchController = null;
  watchAnswers = null;
  watchHooks = undefined;
  flow?.stop();
  flow = null;
  engine?.stop();
  engine = null;
  voice?.stop();
  voice = null;
}
