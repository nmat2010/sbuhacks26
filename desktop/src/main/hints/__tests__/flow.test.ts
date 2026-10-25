import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type Database from 'better-sqlite3';
import {
  HINT_LEVEL_KEYS,
  SettingsDefaults,
  type MascotStateType,
  type NudgeInput,
  type NudgeResponse,
  type PageSummary,
  type SettingsKey,
  type SettingsValues,
  type HintTriggerType
} from '@wolfie/shared';
import { openDatabase } from '../../db/index.js';
import { LLMClient } from '../../llm/client.js';
import { MockLLMProvider, MOCK_HINTS } from '../../llm/mock-provider.js';
import { LLMError, type LLMProvider } from '../../llm/provider.js';
import { TypedEmitter } from '../../typed-emitter.js';
import { ACTIONS } from '../../stuck/actions.js';
import { stuckBus as busType } from '../../stuck/bus.js';
import { EscalationEngine } from '../../stuck/engine.js';
import { HintService } from '../service.js';
import { HintFlow, FLOW_TEXT, LADDER_IDLE_MS, SUMMARY_MAX_AGE_MS, type HintFlowDeps } from '../flow.js';
import { SHOW_ANSWER_UTTERANCE } from '../constants.js';
import { captureActiveWindow } from '../capture.js';
import { firstSentences } from '../../voice/text.js';

type Bus = typeof busType;

const NOW = 1_700_000_000_000;
let db: Database.Database;

beforeEach(() => {
  db = openDatabase(':memory:');
});
afterEach(() => {
  db.close();
});

const summary = (problemId: string | undefined, over: Partial<PageSummary> = {}): PageSummary => ({
  url: 'http://localhost:5174/algebra.html',
  domain: 'localhost',
  title: 'Algebra',
  headings: ['Solve for x'],
  visibleText: 'Solve 2x + 5 = 13',
  controls: [],
  errorMessages: [],
  openDialogs: [],
  problemId,
  timestamp: NOW,
  ...over
});

function setup(
  opts: {
    session?: { id: string; assessmentMode: boolean } | null;
    summary?: PageSummary | null;
    provider?: LLMProvider;
    capture?: HintFlowDeps['capture'];
    confirm?: HintFlowDeps['confirmCapture'];
    paused?: boolean;
    watch?: HintFlowDeps['watch'];
  } = {}
) {
  const env = { now: NOW, paused: opts.paused ?? false };
  const session = opts.session === undefined ? { id: 's1', assessmentMode: false } : opts.session;
  if (session) db.prepare("INSERT INTO sessions (id, device, started_at, assessment_mode) VALUES (?, 'desktop', 1, ?)").run(session.id, session.assessmentMode ? 1 : 0);

  const bus = new TypedEmitter<{
    signal: [never];
    input: [number];
    'help-requested': [HintTriggerType];
    'problem-changed': [string | null];
  }>() as unknown as Bus;
  const queue = new TypedEmitter<{ response: [NudgeResponse] }>();
  const sessionChange = new TypedEmitter<{ change: [] }>();
  const pushed: Array<NudgeInput & { id: string }> = [];
  const logs: string[] = [];
  const ladderOpen: boolean[] = [];
  const mascot: MascotStateType[] = [];
  const thinking: boolean[] = [];
  let n = 0;

  const client = new LLMClient({ provider: opts.provider ?? new MockLLMProvider({ delayMs: 0 }), retryDelayMs: 1, log: () => {} });
  const hintService = new HintService({
    llm: () => client,
    db: () => db,
    now: () => env.now,
    getSetting: <K extends SettingsKey>(key: K) => SettingsDefaults[key] as SettingsValues[K],
    activeSession: () => session,
    imageDir: () => null,
    log: () => {},
    console: () => {}
  });
  const requestPageSummary = vi.fn(async () => (opts.summary === undefined ? summary('demo-algebra-problem') : opts.summary));
  const capture = vi.fn(opts.capture ?? (async () => ({ ok: true as const, dataUrl: 'data:image/png;base64,QUJD', sourceName: 'screen' })));
  const confirm = vi.fn(opts.confirm ?? (async () => true));
  const markImGood = vi.fn();
  const requestHintsSpy = vi.spyOn(hintService, 'requestHints');

  const flow = new HintFlow({
    now: () => env.now,
    bus,
    getSession: () => session,
    isPaused: () => env.paused,
    requestPageSummary,
    capture,
    confirmCapture: confirm,
    requestHints: (c, s, a) => hintService.requestHints(c, s, a),
    requestFollowup: (f, c, s, a) => hintService.requestFollowup(f, c, s, a),
    logLevelShown: (e) => hintService.logLevelShown(e),
    push: (nudge) => {
      const id = `n${++n}`;
      pushed.push({ ...nudge, id });
      return id;
    },
    respond: (r) => queue.emit('response', r),
    onNudgeResponse: (fn) => queue.on('response', fn),
    onSessionChange: (fn) => sessionChange.on('change', fn),
    setLadderOpen: (open) => void ladderOpen.push(open),
    markImGood,
    log: (type) => void logs.push(type),
    thinkingDelayMs: 10 ** 9,
    thinking: (on) => void thinking.push(on),
    watch: opts.watch
  });
  flow.start();

  const last = () => pushed[pushed.length - 1];
  /** Presses a button on the bubble currently on screen. */
  const press = (action: string) => queue.emit('response', { id: last().id, action, via: 'button' });
  const settle = () => new Promise((r) => setTimeout(r, 30));
  return { flow, bus, queue, sessionChange, pushed, last, press, settle, env, logs, ladderOpen, mascot, thinking, markImGood, capture, confirm, requestPageSummary, requestHintsSpy, db };
}

const labels = (n: NudgeInput) => (n.buttons ?? []).map((b) => b.action);

describe('hint flow: accept -> five ladder levels', () => {
  it('shows the five levels one at a time, with the right buttons', async () => {
    const t = setup();
    t.bus.emit('help-requested', 'auto');
    await t.settle();

    const expected = HINT_LEVEL_KEYS.map((k) => MOCK_HINTS['demo-algebra-problem'].hint_levels[k]);
    expect(t.pushed).toHaveLength(1);
    expect(t.last().text).toBe(expected[0]);
    expect(t.last()).toMatchObject({ kind: 'stuck', level: 3 });
    expect(labels(t.last())).toEqual([ACTIONS.ANOTHER_HINT, ACTIONS.GOT_IT, ACTIONS.IM_GOOD, ACTIONS.SHOW_ANSWER]);
    expect(t.ladderOpen).toEqual([true]);

    for (let level = 2; level <= 5; level++) {
      t.press(ACTIONS.ANOTHER_HINT);
      expect(t.pushed).toHaveLength(level);
      expect(t.last().text).toBe(expected[level - 1]);
    }
    expect(new Set(t.pushed.map((p) => p.text)).size).toBe(5);
    // Nothing left to ask for at level 5
    expect(labels(t.last())).toEqual([ACTIONS.GOT_IT, ACTIONS.IM_GOOD, ACTIONS.SHOW_ANSWER]);

    // Asking again at the end says so instead of inventing a sixth level
    t.press(ACTIONS.ANOTHER_HINT);
    expect(t.last().text).toBe(FLOW_TEXT.lastHint);
    expect(t.flow.currentLevel()).toBe(5);

    // Levels 2-5 are logged as they are shown, level 1 by the hint service
    const rows = db.prepare('SELECT hint_level FROM hint_requests ORDER BY id').all();
    expect(rows).toEqual([1, 2, 3, 4, 5].map((hint_level) => ({ hint_level })));
  });

  it('speaks only the first two sentences', async () => {
    const long = 'First sentence here. Second sentence here. Third sentence here.';
    const provider: LLMProvider = {
      name: 'long',
      countsTowardCap: false,
      generateJson: async () => ({
        what_i_see: 'ok',
        hint_levels: { nudge: long, hint: long, explanation: long, analogous_example: long, direct_step: long }
      })
    };
    const t = setup({ provider });
    t.bus.emit('help-requested', 'auto');
    await t.settle();
    expect(t.last().text).toBe(long);
    expect(t.last().spokenText).toBe('First sentence here. Second sentence here.');
    expect(t.last().spokenText).toBe(firstSentences(long));
  });

  it('"Show the answer" is offered outside assessment mode and asks the fixed question', async () => {
    const t = setup();
    t.bus.emit('help-requested', 'auto');
    await t.settle();
    t.press(ACTIONS.ANOTHER_HINT);
    t.press(ACTIONS.SHOW_ANSWER);
    await t.settle();
    expect(t.last().text).toBe(MOCK_HINTS['demo-algebra-problem'].answer);
    expect(t.flow.currentLevel()).toBe(5);
    expect(SHOW_ANSWER_UTTERANCE).toMatch(/show me the answer/);
  });

  it('"Show the answer" is absent at every level in assessment mode, and ignored if requested', async () => {
    const t = setup({ session: { id: 's1', assessmentMode: true } });
    t.bus.emit('help-requested', 'auto');
    await t.settle();
    const shown = [t.last()];
    for (let i = 0; i < 4; i++) {
      t.press(ACTIONS.ANOTHER_HINT);
      shown.push(t.last());
    }
    expect(shown).toHaveLength(5);
    for (const bubble of shown) {
      expect(labels(bubble)).not.toContain(ACTIONS.SHOW_ANSWER);
      expect(bubble.text).not.toContain('x = 4');
    }
    const count = t.pushed.length;
    t.press(ACTIONS.SHOW_ANSWER);
    await t.settle();
    expect(t.pushed).toHaveLength(count);
  });
});

describe('hint flow: Wolfie thinking while a reply is on its way', () => {
  it('thinks while the ladder is made and while "Show the answer" is asked; not for pre-built steps', async () => {
    const t = setup();
    t.bus.emit('help-requested', 'manual');
    expect(t.thinking).toEqual([true]);
    await t.settle();
    expect(t.thinking).toEqual([true, false]);
    t.press(ACTIONS.ANOTHER_HINT); // the next level is already there: no wait
    expect(t.thinking).toEqual([true, false]);
    t.press(ACTIONS.SHOW_ANSWER);
    expect(t.thinking).toEqual([true, false, true]);
    await t.settle();
    expect(t.thinking).toEqual([true, false, true, false]);
  });
});

describe('context assembly', () => {
  it('prefers a fresh page summary and does not capture the screen', async () => {
    const t = setup();
    t.bus.emit('help-requested', 'auto');
    await t.settle();
    expect(t.capture).not.toHaveBeenCalled();
    expect(t.requestHintsSpy.mock.calls[0][1]).toBe('page');
    expect(t.requestHintsSpy.mock.calls[0][0]).toMatchObject({ problemId: 'demo-algebra-problem', trigger: 'auto', device: 'desktop', sessionId: 's1' });
  });

  it('falls back to a confirmed screenshot for empty, stale or missing summaries', async () => {
    for (const s of [null, summary('x', { visibleText: '', headings: [], controls: [] }), summary('x', { timestamp: NOW - SUMMARY_MAX_AGE_MS - 1 })]) {
      db.exec('DELETE FROM hint_requests; DELETE FROM sessions;');
      const t = setup({ summary: s });
      t.bus.emit('help-requested', 'manual');
      await t.settle();
      expect(t.capture).toHaveBeenCalledTimes(1);
      expect(t.confirm).toHaveBeenCalledTimes(1);
      expect(t.requestHintsSpy.mock.calls[0][1]).toBe('screen');
      expect(t.requestHintsSpy.mock.calls[0][0].imageDataUrl).toBe('data:image/png;base64,QUJD');
    }
  });

  it('asks about the screenshot only the first time in a session', async () => {
    const t = setup({ summary: null });
    t.bus.emit('help-requested', 'manual');
    await t.settle();
    t.press(ACTIONS.GOT_IT);
    t.bus.emit('help-requested', 'manual');
    await t.settle();
    expect(t.confirm).toHaveBeenCalledTimes(1);
    expect(t.capture).toHaveBeenCalledTimes(2);

    // a new session asks again
    t.press(ACTIONS.GOT_IT);
    t.sessionChange.emit('change');
    t.bus.emit('help-requested', 'manual');
    await t.settle();
    expect(t.confirm).toHaveBeenCalledTimes(2);
  });

  it('declining the preview, or missing permission, ends gently without calling the model', async () => {
    const declined = setup({ summary: null, confirm: async () => false });
    declined.bus.emit('help-requested', 'manual');
    await declined.settle();
    expect(declined.last().text).toBe(FLOW_TEXT.declinedCapture);
    expect(declined.requestHintsSpy).not.toHaveBeenCalled();
    expect(declined.flow.hasOpenLadder()).toBe(false);
    expect(declined.ladderOpen).toEqual([true, false]);

    db.exec('DELETE FROM sessions;');
    const denied = setup({ summary: null, capture: async () => ({ ok: false, reason: 'permission' }) });
    denied.bus.emit('help-requested', 'voice');
    await denied.settle();
    expect(denied.last().text).toBe(FLOW_TEXT.noPermission);
    expect(denied.requestHintsSpy).not.toHaveBeenCalled();
  });

  it('is ignored while paused', async () => {
    const t = setup({ paused: true });
    t.bus.emit('help-requested', 'manual');
    await t.settle();
    expect(t.pushed).toHaveLength(0);
    expect(t.ladderOpen).toEqual([]);
  });

  it('shows the offline ladder, labeled, when the model is unreachable', async () => {
    const down: LLMProvider = {
      name: 'down',
      countsTowardCap: false,
      async generateJson() {
        throw new LLMError('no network', 'NETWORK', 'down', true);
      }
    };
    const t = setup({ provider: down });
    t.bus.emit('help-requested', 'auto');
    await t.settle();
    expect(t.last().text).toMatch(/^Offline hint: /);
    t.press(ACTIONS.ANOTHER_HINT);
    expect(t.last().text).toMatch(/^Offline hint: /);
    expect(new Set(t.pushed.map((p) => p.text)).size).toBe(2);
  });
});

describe('closing and re-entry', () => {
  it('"I got it" closes the ladder and releases the engine hold', async () => {
    const t = setup();
    t.bus.emit('help-requested', 'auto');
    await t.settle();
    t.press(ACTIONS.GOT_IT);
    expect(t.flow.hasOpenLadder()).toBe(false);
    expect(t.ladderOpen).toEqual([true, false]);
    expect(t.last().text).toBe(FLOW_TEXT.gotIt);
    expect(t.logs).toEqual(['hint.opened', 'hint.closed']);
  });

  it('"I\'m good" tells the engine, and dismissing the bubble closes the ladder', async () => {
    const a = setup();
    a.bus.emit('help-requested', 'auto');
    await a.settle();
    a.press(ACTIONS.IM_GOOD);
    expect(a.markImGood).toHaveBeenCalledTimes(1);
    expect(a.flow.hasOpenLadder()).toBe(false);

    db.exec('DELETE FROM hint_requests; DELETE FROM sessions;');
    const b = setup();
    b.bus.emit('help-requested', 'auto');
    await b.settle();
    b.press('timeout');
    expect(b.flow.hasOpenLadder()).toBe(true); // fading is not an answer
    b.press('dismissed');
    expect(b.flow.hasOpenLadder()).toBe(false);
  });

  it('a ladder nobody touches closes after the idle limit; a problem change closes it too', async () => {
    const t = setup();
    t.bus.emit('help-requested', 'auto');
    await t.settle();
    t.env.now += LADDER_IDLE_MS - 1000;
    t.flow.tick();
    expect(t.flow.hasOpenLadder()).toBe(true);
    t.env.now += 2000;
    t.flow.tick();
    expect(t.flow.hasOpenLadder()).toBe(false);

    t.bus.emit('help-requested', 'manual');
    await t.settle();
    expect(t.flow.hasOpenLadder()).toBe(true);
    t.bus.emit('problem-changed', 'another-problem');
    expect(t.flow.hasOpenLadder()).toBe(false);
  });

  it('asking for help again while a ladder is open means "another hint"', async () => {
    const t = setup();
    t.bus.emit('help-requested', 'auto');
    await t.settle();
    t.bus.emit('help-requested', 'voice');
    expect(t.pushed).toHaveLength(2);
    expect(t.flow.currentLevel()).toBe(2);
    t.bus.emit('help-requested', 'auto'); // an accepted offer cannot reach an open ladder; ignored
    expect(t.pushed).toHaveLength(2);
  });

  it('spoken answers go through NudgeQueue.respond like button presses', async () => {
    const t = setup();
    const responses: NudgeResponse[] = [];
    t.queue.on('response', (r) => void responses.push(r));
    t.bus.emit('help-requested', 'auto');
    await t.settle();
    expect(t.flow.answer(ACTIONS.ANOTHER_HINT, 'voice')).toBe(true);
    expect(responses[0]).toMatchObject({ id: 'n1', action: ACTIONS.ANOTHER_HINT, via: 'voice' });
    expect(t.pushed).toHaveLength(2);
    expect(t.flow.answer(ACTIONS.GOT_IT)).toBe(true);
    expect(t.flow.answer(ACTIONS.GOT_IT)).toBe(false); // nothing open any more
  });

  it('ignores responses for other bubbles', async () => {
    const t = setup();
    t.bus.emit('help-requested', 'auto');
    await t.settle();
    t.queue.emit('response', { id: 'someone-else', action: ACTIONS.GOT_IT, via: 'button' });
    expect(t.flow.hasOpenLadder()).toBe(true);
  });
});

describe('voice follow-ups', () => {
  it('answers "I don\'t get step 2" with a contextual reply and keeps at most six turns', async () => {
    const t = setup();
    t.bus.emit('help-requested', 'voice');
    await t.settle();
    const followupSpy = vi.spyOn(HintService.prototype, 'requestFollowup');
    for (let i = 0; i < 5; i++) await t.flow.followup("I don't get step 2");
    expect(followupSpy).toHaveBeenCalledTimes(5);
    const lastCall = followupSpy.mock.calls[4][0];
    expect(lastCall.conversationHistory.length).toBeLessThanOrEqual(6);
    expect(lastCall.utterance).toBe("I don't get step 2");
    expect(t.flow.currentLevel()).toBe(5); // each reply is the current level or one up
    expect(labels(t.last())).toContain(ACTIONS.GOT_IT);
    followupSpy.mockRestore();
  });

  it('works with the real engine: accepting the offer starts the flow and holds the engine at level 0', async () => {
    const t = setup();
    const engineBus = t.bus;
    const offerQueue = new TypedEmitter<{ response: [NudgeResponse] }>();
    let pushedOffer: NudgeInput | null = null;
    const engine = new EscalationEngine({
      now: () => t.env.now,
      bus: engineBus,
      getSession: () => ({ id: 's1' }),
      onSessionChange: (fn) => t.sessionChange.on('change', fn),
      isPaused: () => false,
      isSnoozed: () => false,
      voiceMode: () => false,
      thresholds: () => SettingsDefaults['stuck.thresholds'],
      idleMinutes: () => 4,
      push: (n) => {
        pushedOffer = n;
        return 'offer1';
      },
      onNudgeResponse: (fn) => offerQueue.on('response', fn),
      setMascotState: () => undefined,
      speak: () => undefined,
      log: () => undefined
    });
    engine.start(10 ** 9);
    // Same hooks register.ts uses
    const flow2 = t.flow;
    void flow2;
    engineBus.emit('signal', { type: 'wrong_answer_loop', strength: 'strong', timestamp: NOW } as never);
    t.env.now += 46_000;
    engine.tick();
    t.env.now += 46_000;
    engine.tick();
    expect(pushedOffer).toMatchObject({ kind: 'stuck', level: 3 });
    offerQueue.emit('response', { id: 'offer1', action: ACTIONS.ACCEPT_HINT, via: 'button' });
    await t.settle();
    expect(t.flow.hasOpenLadder()).toBe(true);
    expect(t.last().text).toBe(MOCK_HINTS['demo-algebra-problem'].hint_levels.nudge);
    expect(engine.snapshot().signals).toEqual([]);
    engine.stop();
  });
});

describe('screen capture helper', () => {
  const thumb = (empty: boolean, url = 'data:image/png;base64,AAAA') => ({ isEmpty: () => empty, toDataURL: () => url });

  it('refuses without Screen Recording permission', async () => {
    const getSources = vi.fn();
    const r = await captureActiveWindow({ desktopCapturer: { getSources }, screenAccess: () => 'denied' });
    expect(r).toEqual({ ok: false, reason: 'permission' });
    expect(getSources).not.toHaveBeenCalled();
  });

  it('matches the frontmost window by title, else falls back to the screen', async () => {
    const getSources = vi.fn(async ({ types }: { types: string[] }) =>
      types[0] === 'window'
        ? [{ id: 'w1', name: 'Other', thumbnail: thumb(false, 'other') }, { id: 'w2', name: 'Homework - Chrome', thumbnail: thumb(false, 'win') }]
        : [{ id: 's1', name: 'Screen 1', thumbnail: thumb(false, 'screen') }]
    );
    const deps = { desktopCapturer: { getSources }, screenAccess: () => 'granted' as const };
    expect(await captureActiveWindow({ ...deps, frontWindow: () => ({ title: 'homework' }) })).toMatchObject({ ok: true, dataUrl: 'win' });
    expect(await captureActiveWindow({ ...deps, frontWindow: () => ({ title: 'nothing matches' }) })).toMatchObject({ ok: true, dataUrl: 'screen' });
    expect(await captureActiveWindow(deps)).toMatchObject({ ok: true, dataUrl: 'screen' });
  });

  it('reports blank thumbnails and errors', async () => {
    const blank = { getSources: async () => [{ id: 's', name: 's', thumbnail: thumb(true) }] };
    expect(await captureActiveWindow({ desktopCapturer: blank, screenAccess: () => 'granted' })).toEqual({ ok: false, reason: 'empty' });
    const broken = {
      getSources: async () => {
        throw new Error('x');
      }
    };
    expect(await captureActiveWindow({ desktopCapturer: broken, screenAccess: () => 'granted' })).toEqual({ ok: false, reason: 'error' });
  });
});

describe('hint flow with Watch mode on', () => {
  const hooks = (mode: 'learning' | 'homework' | 'other', over: Partial<NonNullable<HintFlowDeps['watch']>> = {}) => {
    const explain = vi.fn(async (_q: string | null) => ({ ok: true as const, text: 'He gates each score with a mask. That keeps heads sparse.', label: 'From your session' }));
    const currentFrame = vi.fn(async () => 'data:image/jpeg;base64,QUFB');
    return {
      explain,
      currentFrame,
      watch: {
        active: () => true,
        mode: () => mode,
        contextText: () => 'Sources this session: [paper] Sparse Gated Attention',
        currentFrame,
        explain,
        ...over
      }
    };
  };

  it('learning mode: clicking Wolfie explains from the session instead of a hint ladder or screenshot prompt', async () => {
    const h = hooks('learning');
    const t = setup({ watch: h.watch });
    t.bus.emit('help-requested', 'manual');
    await t.settle();
    expect(h.explain).toHaveBeenCalledWith(null, undefined);
    expect(t.requestHintsSpy).not.toHaveBeenCalled();
    expect(t.confirm).not.toHaveBeenCalled();
    expect(t.last().text).toContain('He gates each score with a mask.');
    expect(t.last().text).toContain('From your session');
    expect(t.last().spokenText).toBe('He gates each score with a mask. That keeps heads sparse.');
    expect(labels(t.last())).toEqual(['explain_simpler', ACTIONS.GOT_IT, ACTIONS.IM_GOOD]);
    expect(t.flow.hasOpenExplanation()).toBe(true);
    expect(t.ladderOpen).toEqual([true]);
  });

  it('"Explain more simply" asks again; "I got it" closes and lets offers resume', async () => {
    const h = hooks('learning');
    const t = setup({ watch: h.watch });
    t.bus.emit('help-requested', 'manual');
    await t.settle();
    t.press('explain_simpler');
    await t.settle();
    // The follow-up carries the explanation it refers to
    expect(h.explain).toHaveBeenLastCalledWith(FLOW_TEXT.simpler, 'He gates each score with a mask. That keeps heads sparse.');
    t.press(ACTIONS.GOT_IT);
    expect(t.flow.hasOpenExplanation()).toBe(false);
    expect(t.ladderOpen.at(-1)).toBe(false);
    expect(t.last().text).toBe(FLOW_TEXT.gotIt);
  });

  it('dismissing or going idle closes the explanation', async () => {
    const t = setup({ watch: hooks('learning').watch });
    t.bus.emit('help-requested', 'manual');
    await t.settle();
    t.env.now += LADDER_IDLE_MS + 1;
    t.flow.tick();
    expect(t.flow.hasOpenExplanation()).toBe(false);
    expect(t.ladderOpen.at(-1)).toBe(false);
  });

  it('an explanation error is shown and does not leave offers blocked', async () => {
    const t = setup({ watch: hooks('learning', { explain: async () => ({ ok: false as const, message: 'No key' }) }).watch });
    t.bus.emit('help-requested', 'manual');
    await t.settle();
    expect(t.last().text).toBe('No key');
    expect(t.ladderOpen).toEqual([true, false]);
  });

  it('homework mode: the hint ladder gets the session and the current screen, with no confirmation', async () => {
    const h = hooks('homework');
    const t = setup({ watch: h.watch, summary: null });
    t.bus.emit('help-requested', 'manual');
    await t.settle();
    expect(h.explain).not.toHaveBeenCalled();
    expect(t.confirm).not.toHaveBeenCalled();
    expect(t.capture).not.toHaveBeenCalled();
    const [context, source] = t.requestHintsSpy.mock.calls[0];
    expect(source).toBe('screen');
    expect(context.sessionContext).toContain('Sparse Gated Attention');
    expect(context.imageDataUrl).toBe('data:image/jpeg;base64,QUFB');
    expect(t.pushed).toHaveLength(1);
  });

  it('homework mode with a page summary sends both the page and the session', async () => {
    const t = setup({ watch: hooks('homework').watch });
    t.bus.emit('help-requested', 'manual');
    await t.settle();
    const [context, source] = t.requestHintsSpy.mock.calls[0];
    expect(source).toBe('page');
    expect(context.pageSummary?.problemId).toBe('demo-algebra-problem');
    expect(context.sessionContext).toBeTruthy();
  });

  it('falls back to the normal flow when Watch mode has no frame and no page', async () => {
    const h = hooks('homework', { currentFrame: async () => null });
    const t = setup({ watch: h.watch, summary: null });
    t.bus.emit('help-requested', 'manual');
    await t.settle();
    expect(t.capture).toHaveBeenCalled();
    expect(t.confirm).toHaveBeenCalled();
  });

  it('Watch mode off: unchanged behavior', async () => {
    const t = setup({ watch: { ...hooks('learning').watch, active: () => false }, summary: null });
    t.bus.emit('help-requested', 'manual');
    await t.settle();
    expect(t.confirm).toHaveBeenCalled();
    expect(t.requestHintsSpy).toHaveBeenCalled();
  });
});

describe('captureActiveWindow JPEG (Watch mode frames)', () => {
  it('encodes JPEG when asked and the thumbnail supports it, PNG otherwise', async () => {
    const thumb = { isEmpty: () => false, toDataURL: () => 'data:image/png;base64,UE5H', toJPEG: () => Buffer.from('JPG') };
    const getSources = vi.fn(async () => [{ id: 's', name: 'Screen 1', thumbnail: thumb }]);
    const jpeg = await captureActiveWindow({ desktopCapturer: { getSources }, screenAccess: () => 'granted', jpegQuality: 60 });
    expect(jpeg).toMatchObject({ ok: true, dataUrl: `data:image/jpeg;base64,${Buffer.from('JPG').toString('base64')}` });
    const png = await captureActiveWindow({ desktopCapturer: { getSources }, screenAccess: () => 'granted' });
    expect(png).toMatchObject({ ok: true, dataUrl: 'data:image/png;base64,UE5H' });
  });
});

describe('Watch-mode explanation: voice and capture (review fixes)', () => {
  const watch = (explain = vi.fn(async (_q: string | null) => ({ ok: true as const, text: 'Gated attention. It keeps heads sparse.', label: 'From your session' }))) => ({
    explain,
    hooks: {
      active: () => true,
      mode: () => 'learning' as const,
      contextText: () => 'notes',
      currentFrame: async () => null,
      explain
    }
  });

  it('"I got it" / "I\'m good" by voice act on the open explanation', async () => {
    const w = watch();
    const t = setup({ watch: w.hooks });
    t.bus.emit('help-requested', 'manual');
    await t.settle();
    expect(t.flow.answer(ACTIONS.IM_GOOD, 'voice')).toBe(true);
    expect(t.markImGood).toHaveBeenCalled();
    expect(t.flow.hasOpenExplanation()).toBe(false);
    expect(t.ladderOpen.at(-1)).toBe(false);
  });

  it('a spoken follow-up stays in the explanation (same flow, new bubble)', async () => {
    const w = watch();
    const t = setup({ watch: w.hooks });
    t.bus.emit('help-requested', 'manual');
    await t.settle();
    expect(await t.flow.followupExplanation('why does the mask help?')).toBe(true);
    expect(w.explain).toHaveBeenLastCalledWith('why does the mask help?', 'Gated attention. It keeps heads sparse.');
    expect(t.flow.hasOpenExplanation()).toBe(true);
    expect(await setup({ session: { id: 's2', assessmentMode: false } }).flow.followupExplanation('x')).toBe(false); // nothing open
  });
});

describe('captureActiveWindow windowOnly', () => {
  it('never falls back to the whole screen', async () => {
    const thumb = { isEmpty: () => false, toDataURL: () => 'data:image/png;base64,UE5H' };
    const getSources = vi.fn(async ({ types }: { types: string[] }) =>
      types.includes('window') ? [{ id: 'w', name: 'Other window', thumbnail: thumb }] : [{ id: 's', name: 'Screen', thumbnail: thumb }]
    );
    const r = await captureActiveWindow({
      desktopCapturer: { getSources },
      screenAccess: () => 'granted',
      frontWindow: () => ({ title: 'homework.pdf' }),
      windowOnly: true
    });
    expect(r).toEqual({ ok: false, reason: 'empty' });
    expect(getSources.mock.calls.some(([o]) => o.types.includes('screen'))).toBe(false);
  });
});

describe('hint flow: hints follow the flagged wrong answer (two on screen)', () => {
  const issues = [
    { question: 'What is underfitting?', issue: 'This describes overfitting rather than underfitting.' },
    { question: '2x + 5 = 13', issue: "The equation here doesn't match the original." }
  ];
  const watch = (mode: 'learning' | 'homework') => ({
    active: () => true,
    mode: () => mode,
    contextText: () => 'notes',
    currentFrame: async () => 'data:image/jpeg;base64,QUFB',
    explain: vi.fn(async () => ({ ok: true as const, text: 'direct answer', label: 'x' })),
    openIssues: () => issues
  });

  it('the ladder is about the first flagged problem, even in learning mode (hints, never the answer)', async () => {
    const w = watch('learning');
    const t = setup({ watch: w, summary: null });
    t.bus.emit('help-requested', 'auto');
    await t.settle();
    expect(w.explain).not.toHaveBeenCalled();
    const [context] = t.requestHintsSpy.mock.calls[0];
    expect(context.focus).toContain('What is underfitting?');
    expect(context.focus).toContain('overfitting rather than underfitting');
  });

  it('after "I got it", offers hints for the next one, and they focus on it', async () => {
    const t = setup({ watch: watch('homework'), summary: null });
    t.bus.emit('help-requested', 'auto');
    await t.settle();
    t.press(ACTIONS.GOT_IT);
    expect(t.last().text).toContain("one more thing that looks off: the equation here doesn't match the original");
    expect(labels(t.last())).toEqual(['next_issue', ACTIONS.IM_GOOD]);
    t.press('next_issue');
    await t.settle();
    const [context] = t.requestHintsSpy.mock.calls[1];
    expect(context.focus).toContain('2x + 5 = 13');
  });
});

describe('hint flow: thinking pause', () => {
  it('focuses the hints on the unanswered question', async () => {
    const t = setup({
      summary: null,
      watch: {
        active: () => true,
        mode: () => 'homework',
        contextText: () => 'notes',
        currentFrame: async () => 'data:image/jpeg;base64,QUFB',
        explain: vi.fn(),
        openIssues: () => [],
        stalledQuestion: () => 'What is overfitting?'
      }
    });
    t.bus.emit('help-requested', 'auto');
    await t.settle();
    const [context] = t.requestHintsSpy.mock.calls[0];
    expect(context.focus).toContain('What is overfitting?');
    expect(context.focus).toContain('get started');
  });
});
