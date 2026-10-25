// Agent B (Intelligence) wires its modules here: LLM client, escalation runtime, hint service,
// voice providers/router, plan, papers, reading. main.ts calls this once after the DB and
// NudgeQueue are ready. Only register files may import `electron` or `../ipc.js`; logic modules
// get them injected.

import { join } from 'path';
import WebSocket from 'ws';
import { execFile } from 'child_process';
import { existsSync } from 'fs';
import { promisify } from 'util';
import { app, BrowserWindow, desktopCapturer, dialog, globalShortcut, nativeImage, powerMonitor, shell, systemPreferences } from 'electron';
import type { NudgeResponse } from '@wolfie/shared';
import { stuckBus } from '../stuck/bus.js';
import { ACTIONS } from '../stuck/actions.js';
import { EscalationEngine } from '../stuck/engine.js';
import { getDatabase } from '../db/index.js';
import { logEvent } from '../events.js';
import { setMascotState } from '../overlay/state.js';
import { beginThinking, thinkingEvents, whileThinking } from '../overlay/thinking.js';
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
import { isUnaskedOffer, spokenReply } from '../voice/read-aloud.js';
import { createClipStt } from '../voice/clip-stt.js';
import { SessionTracker } from '../report/tracker.js';
import { ReportService, type SessionSnapshot } from '../report/service.js';
import { ReportStore } from '../report/store.js';
import { getHistory } from '../history/queries.js';
import { createVoiceService, type VoiceService } from '../voice/service.js';
import type { IntentHandler } from '../voice/router.js';
import type { VoiceIntent } from '../voice/intents.js';
import { getLLMClient, LLMClient, selectProvider } from '../llm/client.js';
import { PrefixedUsageStore, SqliteUsageStore } from '../llm/usage.js';
import { foregroundEvents, getForeground, getTabReport } from '../foreground.js';
import { isBrowserApp } from '../monitor/browsers.js';
import { captureWindowById } from '../hints/capture.js';
import { createFrontWindowReader } from '../watch/front-window.js';
import { createBrowserProbe } from '../watch/browser-probe.js';
import { getLatestPageSummary } from '../sync/context.js';
import { isExcludedDomain } from '../sync/desk-state.js';
import type { WatchHooks } from '../hints/flow.js';
import { SessionMemory } from '../watch/memory.js';
import { isStudying, Watcher } from '../watch/watcher.js';
import { WatchController } from '../watch/controller.js';
import { WatchAnswerService } from '../watch/answer.js';
import { createResourceFinder, safeUrl } from '../watch/resources.js';
import { attachChatLog, ChatLog } from '../chat/log.js';

const cleanups: Array<() => void> = [];
let voice: VoiceService | null = null;
let engine: EscalationEngine | null = null;
let flow: HintFlow | null = null;
let watcher: Watcher | null = null;
let watchController: WatchController | null = null;
let watchAnswers: WatchAnswerService | null = null;
let watchHooks: WatchHooks | undefined;
let chatLog: ChatLog | null = null;
/** Follows the problems of the running session, for its report (report/tracker.ts). */
const tracker = new SessionTracker();
let reports: ReportService | null = null;
const notifyChat = () => {
  if (chatLog) broadcast('chat-history-changed', chatLog.list());
};
/** Ends the thinking sprite once a reply's first audio arrives (no idle blink before talking). */
let endReadThinking: (() => void) | null = null;
const stopReadThinking = () => {
  endReadThinking?.();
  endReadThinking = null;
};
/** Reads a chat reply aloud (voice.read_replies; ElevenLabs), interrupting what Wolfie was saying. */
const readReply = (text: string) => {
  if (!voice || !getSetting('voice.read_replies') || isPaused()) return;
  stopReadThinking();
  endReadThinking = beginThinking();
  void voice.speaker.speak(spokenReply(text)).finally(stopReadThinking);
};
/** Set by registerWatch(); the escalation engine asks it before offering help. */
let engagedCheck: (() => boolean) | null = null;
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
  // Wolfie's thinking sprite while a reply the student asked for is on its way (overlay/thinking.ts)
  cleanups.push(thinkingEvents.on('change', (thinking) => broadcast('wolfie-thinking', thinking)));
  registerVoice();
  registerEscalation();
  registerReports();
  registerWatch();
  registerHintFlow();
  registerChat();
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
    isEngaged: () => engagedCheck?.() ?? powerMonitor.getSystemIdleTime() < 10 * 60,
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
  let endFlowThinking: (() => void) | null = null;
  cleanups.push(() => endFlowThinking?.());

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
    onHelpClosed: (help) => tracker.help(help.question, help.deepest, Date.now()),
    thinking: (on) => {
      endFlowThinking?.();
      endFlowThinking = on ? beginThinking() : null;
    },
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
  // Help steps are read in full from the chat when voice.read_replies is on (not twice)
  cleanups.push(
    attachNudgeSpeech(
      queue,
      (text) => voice?.speakIfVoice(text) ?? false,
      (nudge) => getSetting('voice.read_replies') && nudge.kind === 'stuck' && !isUnaskedOffer(nudge)
    )
  );
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
  // Its own daily budget (watch.calls_per_day), counted separately from hints and plans, and
  // optionally its own model (GEMINI_WATCH_MODEL): Gemini quotas are per model, and the watcher
  // makes most of the calls, so a cheaper flash-lite model keeps the main model free for answers
  const watchModel = process.env.GEMINI_WATCH_MODEL?.trim();
  const client = new LLMClient({
    provider: watchModel ? selectProvider({ ...process.env, GEMINI_MODEL: watchModel }) : getLLMClient().provider,
    usage: new PrefixedUsageStore(new SqliteUsageStore(), 'watch:'),
    dailyCap: () => getSetting('watch.calls_per_day'),
    timeoutMs: 30_000
  });
  const run = promisify(execFile) as unknown as (file: string, args: string[], opts: { timeout: number }) => Promise<{ stdout: string }>;
  // Native helper (desktop/native, `npm run build:native`); without it nothing is captured
  // Packaged builds ship it unpacked under Resources (electron-builder extraResources)
  const helper = app.isPackaged
    ? join(process.resourcesPath, 'native', 'bin', 'front-window')
    : join(app.getAppPath(), 'native', 'bin', 'front-window');
  if (!existsSync(helper)) console.warn('[watch] front-window helper missing; run npm run build:native in desktop/');

  const w = new Watcher({
    now: Date.now,
    isActive: () => watchController?.isActive() ?? false,
    intervalMs: () => getSetting('watch.interval_seconds') * 1000,
    idleSeconds: () => powerMonitor.getSystemIdleTime(),
    stallSeconds: () => getSetting('watch.stall_seconds'),
    frontWindow: createFrontWindowReader(run, existsSync(helper) ? helper : null),
    selfPid: process.pid,
    isBrowser: (name) => isBrowserApp(name) || /^(safari|firefox|orion|zen|duckduckgo)/i.test(name.trim()),
    probeBrowser: createBrowserProbe(run),
    tabReport: getTabReport,
    isExcludedApp: (name) => {
      const n = name.trim().toLowerCase();
      return getSetting('watch.excluded_apps').some((a) => a.trim().toLowerCase() === n);
    },
    isExcludedDomain: (domain) => isExcludedDomain(domain, getSetting('monitored.excluded_domains')),
    getPageSummary: getLatestPageSummary,
    capture: (windowId) =>
      captureWindowById(
        { desktopCapturer, screenAccess: () => systemPreferences.getMediaAccessStatus('screen'), thumbnailSize: { width: 1024, height: 640 }, jpegQuality: 60 },
        windowId
      ),
    llm: () => client,
    memory,
    // The escalation engine logs stuck.signal itself
    emitSignal: (signal) => {
      // A thinking pause on a question goes into the session report
      if (signal.metadata?.stall && typeof signal.metadata.question === 'string') tracker.stalled(signal.metadata.question, Date.now());
      stuckBus.emit('signal', signal);
    },
    onObservation: (obs, now) => tracker.observe(obs, now),
    onContentUrl: (url) => watchController?.onContentUrl(url),
    onState: (state) => watchController?.onWatcherState(state),
    onLook: () => watchController?.onLook(),
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
      return res.success && res.data
        ? { ok: true as const, paperId: res.data.paper.id, title: res.data.paper.title }
        : { ok: false as const, error: res.error ?? 'import failed' };
    },
    // The session's report: memory is copied now (it is cleared right after), the problems a
    // moment later, once the hint flow has closed any open ladder for this session
    onSessionEnd: (sessionId) => {
      const content = memorySnapshot(memory);
      setTimeout(() => {
        const snapshot: SessionSnapshot = { ...content, ...tracker.snapshot() };
        tracker.reset();
        void reports?.sessionEnded(sessionId, snapshot).catch((error) => console.error('[report] failed:', error));
      }, 0);
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
      (getActiveSession()?.assessmentMode ?? false) ||
      domainListed(getForeground()?.reportedDomain ?? null, getSetting('assessment.domains')),
    findResources: createResourceFinder({ fetch: globalThis.fetch }),
    log: safeLog
  });
  watchAnswers = answers;

  // "Really working" (for automatic offers): at the keyboard in the last 10 minutes and, when Watch
  // mode has a recent look, on a study task rather than browsing or an unrelated app
  engagedCheck = () => {
    const latest = memory.latest();
    const fresh = !!latest && Date.now() - latest.ts <= 3 * 60_000;
    // No input for 10 min means away, except while watching a lecture or video
    const watchingVideo = fresh && latest!.obs.activity === 'watching_video';
    if (powerMonitor.getSystemIdleTime() >= 10 * 60 && !watchingVideo) return false;
    if (!controller.isActive() || !fresh) return true;
    return isStudying(latest!.obs);
  };

  watchHooks = {
    active: () => controller.isActive(),
    mode: () => answers.mode(),
    contextText: () => memory.toPromptText(8000),
    openIssues: () => w.openIssues(),
    stalledQuestion: () => w.stalledQuestion(),
    currentFrame: () => w.captureNow(20_000),
    explain: async (question, previousAnswer) => {
      const res = await answers.ask({ question: question ?? '', inputMode: 'text', proactive: question === null, previousAnswer });
      return res.success && res.data
        ? { ok: true as const, text: res.data.answer, label: res.data.label }
        : { ok: false as const, message: res.error ?? FALLBACK_WATCH_ERROR };
    }
  };

  cleanups.push(controller.events.on('status', (status) => broadcast('watch-state', status)));
  cleanups.push(foregroundEvents.on('change', () => w.poke()));
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
  handle('chat-send', async (text) => {
    const message = String(text ?? '').trim();
    if (!message) return { kind: 'error' as const, error: 'Type a question first.' };
    // A new question: Wolfie stops reading the last answer
    voice?.speaker.stop();
    if (getActiveSession()) tracker.asked(message);
    const history = chatLog?.recentTurns(6) ?? [];
    chatLog?.add({ role: 'user', text: message });
    notifyChat();
    // Follow-ups stay in the conversation that is open (the reply comes back as a bubble/nudge)
    if (flow?.hasOpenExplanation() && (await flow.followupExplanation(message))) return { kind: 'followup' as const };
    if (flow?.hasOpenLadder()) {
      void flow.followup(message);
      return { kind: 'followup' as const };
    }
    const res = await whileThinking(answers.ask({ question: message, inputMode: 'text', history }));
    if (res.success && res.data) {
      chatLog?.add({ role: 'wolfie', text: res.data.answer, label: res.data.label, citations: res.data.citations, resources: res.data.resources });
      notifyChat();
      readReply(res.data.answer);
      return { kind: 'answer' as const, answer: res.data };
    }
    const error = res.error ?? FALLBACK_WATCH_ERROR;
    chatLog?.add({ role: 'wolfie', text: error });
    notifyChat();
    return { kind: 'error' as const, error };
  });
  handle('watch-ask', async (input) => {
    if (!controller.isOn()) return { success: false, error: 'Turn on Watch mode first, so I can follow what you are studying.' };
    return answers.ask({ question: String(input?.question ?? ''), inputMode: input?.inputMode === 'voice' ? 'voice' : 'text' });
  });

  refresh();
}

const FALLBACK_WATCH_ERROR = "Sorry, I couldn't put that together. Please try again in a moment.";

// The chat history: help-flow steps and offers (shown as bubbles or in the chat), button answers,
// and questions, kept across closing the chat and restarts (chat/log.ts).
function registerChat(): void {
  const log = new ChatLog(getDatabase);
  chatLog = log;
  cleanups.push(attachChatLog(getNudgeQueue(), log, notifyChat, readReply));
  // Closing the chat or turning reading off: stop talking now
  handle('voice-stop-speaking', async () => {
    voice?.speaker.stop();
    return { success: true };
  });

  handle('chat-history', async () => log.list());
  handle('open-link', async (url) => {
    const target = safeUrl(typeof url === 'string' ? url : null);
    if (!target) return { success: false };
    await shell.openExternal(target);
    return { success: true };
  });
  handle('chat-clear', async () => {
    log.clear();
    notifyChat();
    return { success: true };
  });
  handle('chat-help', async () => {
    log.add({ role: 'user', text: 'Help me with this' });
    notifyChat();
    stuckBus.emit('help-requested', 'manual');
    return { success: true };
  });
  // "I'm stuck" beside Wolfie: the question on screen gets help now, without the 60 s wait
  handle('help-stuck', async () => {
    const question = watchController?.isActive() ? (watcher?.stuckNow() ?? null) : null;
    if (question) tracker.stalled(question, Date.now());
    log.add({ role: 'user', text: "I'm stuck" });
    notifyChat();
    stuckBus.emit('help-requested', 'manual');
    return { success: true, question };
  });
}

// Session reports (report/): written when a session ends, shown on the dashboard
function registerReports(): void {
  const store = new ReportStore(getDatabase);
  reports = new ReportService({
    now: Date.now,
    store,
    llm: () => getLLMClient(),
    sessionNumbers: (sessionId) => {
      const db = getDatabase();
      const row = db.prepare('SELECT started_at FROM sessions WHERE id = ?').get(sessionId) as { started_at: number } | undefined;
      if (!row) return null;
      const lists = { aiTools: getSetting('monitored.ai_tools'), distractions: getSetting('monitored.distractions') };
      const s = getHistory(db, { now: Date.now(), lists, sinceTs: row.started_at, limit: 20 }).sessions.find((x) => x.id === sessionId);
      return s ? { startedAt: s.startedAt, endedAt: s.endedAt, seconds: s.seconds, hintCount: s.hintCount, deepestHintLevel: s.deepestHintLevel } : null;
    },
    onUpdated: (sessionId) => broadcast('report-updated', { sessionId }),
    log: (line) => console.log(line)
  });
  handle('report-get', async (sessionId) => store.get(String(sessionId ?? '')));
  handle('report-regenerate', async (sessionId) => {
    const report = await reports?.regenerate(String(sessionId ?? ''));
    return { success: !!report && report.status === 'ready' };
  });
}

/** Watch mode's memory as report facts (copied: the memory is cleared right after). */
function memorySnapshot(memory: SessionMemory): Pick<SessionSnapshot, 'sources' | 'timeline'> {
  return {
    sources: memory
      .listSources()
      .slice(0, 15)
      .map((s) => ({
        kind: s.kind,
        title: s.title,
        url: s.url,
        minutes: Math.round(s.seconds / 60),
        locators: [...s.locators],
        points: s.points.slice(-6)
      })),
    timeline: memory
      .segments()
      .slice(-60)
      .map((t) => ({ from: t.from, to: t.to, activity: t.activity, summary: t.summary }))
  };
}

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
        const history = chatLog?.recentTurns(6) ?? [];
        chatLog?.add({ role: 'user', text: utterance });
        if (getActiveSession()) tracker.asked(utterance);
        const res = await whileThinking(watchAnswers.ask({ question: utterance, inputMode: 'voice', history }));
        if (res.success && res.data) {
          chatLog?.add({ role: 'wolfie', text: res.data.answer, label: res.data.label, citations: res.data.citations, resources: res.data.resources });
          notifyChat();
          readReply(res.data.answer);
          broadcast('watch-answer', res.data);
          // Also as a bubble until the overlay chat panel (Thu, U2) shows watch-answer itself
          getNudgeQueue().push(
            {
              kind: 'other',
              level: 1,
              text: `${res.data.answer}${res.data.resources.length ? `\n\n${res.data.resources.map((r) => `• ${r.title}`).join('\n')}\n(Links are in the chat.)` : ''}\n\n${res.data.label}`,
              // Read in full from the chat when that is on; else voice mode speaks the start
              spokenText: getSetting('voice.read_replies') ? undefined : firstSentences(res.data.answer),
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
    sendAudio: (chunk, meta) => {
      broadcast('voice-audio-out', { ...meta, chunk });
      stopReadThinking(); // talking from here (the audio is sent first, so no idle frame)
    },
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

  // Push-to-talk in the chat: one clip per press, transcribed by ElevenLabs (not the mock in demo
  // mode: there is no fake speech to transcribe)
  const apiKey = process.env.ELEVENLABS_API_KEY?.trim();
  const transcribe = apiKey && process.env.DEMO_MODE !== '1' ? createClipStt({ apiKey, model: process.env.ELEVENLABS_PTT_MODEL?.trim() }) : null;
  handle('voice-mic-ready', async () => {
    if (process.platform !== 'darwin') return { granted: true };
    const status = systemPreferences.getMediaAccessStatus('microphone');
    if (status === 'granted') return { granted: true };
    if (status === 'not-determined') return { granted: await systemPreferences.askForMediaAccess('microphone') };
    void shell.openExternal('x-apple.systempreferences:com.apple.preference.security?Privacy_Microphone');
    return { granted: false, error: 'Allow the microphone for Wolfie in System Settings, then try again.' };
  });
  handle('voice-transcribe', async (clip) => {
    if (!transcribe) return { success: false as const, error: 'Talking to Wolfie needs ELEVENLABS_API_KEY in desktop/.env.' };
    const audio = clip?.audio instanceof Uint8Array ? clip.audio : new Uint8Array(0);
    const res = await transcribe(audio, String(clip?.mimeType ?? ''));
    safeLog('voice.ptt', { ok: res.ok, bytes: audio.byteLength });
    return res.ok ? { success: true as const, text: res.text } : { success: false as const, error: res.error };
  });

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
