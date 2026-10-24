import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type Database from 'better-sqlite3';
import {
  HINT_LEVEL_KEYS,
  SettingsDefaults,
  type MascotStateType,
  type Nudge,
  type PageSummary,
  type SettingsKey,
  type SettingsValues,
  type StruggleSignal
} from '@wolfie/shared';
import { openDatabase } from '../../db/index.js';
import { HintFlow } from '../../hints/flow.js';
import { HintService } from '../../hints/service.js';
import { LLMClient, selectProvider } from '../../llm/client.js';
import { MOCK_HINTS, MockLLMProvider } from '../../llm/mock-provider.js';
import { NudgeQueue } from '../../nudge/queue.js';
import { ACTIONS } from '../../stuck/actions.js';
import { stuckBus } from '../../stuck/bus.js';
import { EscalationEngine } from '../../stuck/engine.js';
import { getLatestPageSummary, requestPageSummary, setLatestPageSummary, setPageSummaryRequester } from '../../sync/context.js';
import { TypedEmitter } from '../../typed-emitter.js';

// M2-int: demo scenario A (SPEC 4f, 8) with DEMO_MODE=1 and no network. Page events come in the
// way Agent A's extension link delivers them (setLatestPageSummary + stuckBus signals/problem
// changes); everything after that is B's code and the real NudgeQueue: signals climb to the
// offer, accepting it starts the hint flow, and the five ladder levels appear one at a time.

const PROBLEM = 'demo-algebra-problem';
let db: Database.Database;
let clock: { t: number };

beforeEach(() => {
  db = openDatabase(':memory:');
  clock = { t: 1_700_000_000_000 };
  stuckBus.removeAllListeners();
});
afterEach(() => {
  stuckBus.removeAllListeners();
  setLatestPageSummary(null);
  setPageSummaryRequester(null);
  db.close();
});

const algebraPage = (): PageSummary => ({
  url: 'http://localhost:5174/algebra.html',
  domain: 'localhost',
  title: 'Algebra practice',
  headings: ['Solve for x'],
  visibleText: 'Solve 2x + 5 = 13. Enter your answer and press Check.',
  controls: [
    { id: 'answer', role: 'textbox', label: 'Answer', state: 'enabled' },
    { id: 'check', role: 'button', label: 'Check', state: 'enabled' }
  ],
  errorMessages: ['Incorrect. Try again.'],
  openDialogs: [],
  problemRegion: 'Solve 2x + 5 = 13',
  problemId: PROBLEM,
  timestamp: clock.t
});

const wrongAnswerLoop = (): StruggleSignal => ({ type: 'wrong_answer_loop', strength: 'strong', timestamp: clock.t, problemId: PROBLEM });

function scenario(opts: { assessment?: boolean; voice?: boolean } = {}) {
  // DEMO_MODE=1 forces the mock even when a Gemini key is present
  const provider = selectProvider({ DEMO_MODE: '1', GEMINI_API_KEY: 'would-be-used-without-demo-mode', GEMINI_MODEL: 'gemini-3.6-flash' });
  expect(provider.name).toBe('mock');
  const llm = new LLMClient({ provider: new MockLLMProvider({ delayMs: 0 }), log: () => {} });

  db.prepare("INSERT INTO sessions (id, device, started_at, assessment_mode) VALUES ('s1', 'desktop', 1, ?)").run(opts.assessment ? 1 : 0);
  const session = { id: 's1', assessmentMode: opts.assessment ?? false };
  const queue = new NudgeQueue();
  const shown: Nudge[] = [];
  queue.on('show', (n: Nudge) => shown.push(n));
  const mascot: MascotStateType[] = [];
  const spoken: string[] = [];
  const sessionChange = new TypedEmitter<{ change: [] }>();
  const settings = { 'voice.enabled': opts.voice ?? false } as Record<string, unknown>;

  const hints = new HintService({
    llm: () => llm,
    db: () => db,
    now: () => clock.t,
    getSetting: <K extends SettingsKey>(key: K) => (key in settings ? settings[key] : SettingsDefaults[key]) as SettingsValues[K],
    activeSession: () => session,
    imageDir: () => null,
    log: () => undefined,
    console: () => undefined
  });

  const engine = new EscalationEngine({
    now: () => clock.t,
    bus: stuckBus,
    getSession: () => session,
    onSessionChange: (fn) => sessionChange.on('change', fn),
    isPaused: () => false,
    isSnoozed: () => queue.isSnoozed(),
    voiceMode: () => settings['voice.enabled'] === true,
    thresholds: () => SettingsDefaults['stuck.thresholds'],
    idleMinutes: () => 4,
    push: (n) => queue.push(n),
    onNudgeResponse: (fn) => {
      queue.on('response', fn);
      return () => void queue.off('response', fn);
    },
    setMascotState: (s) => void mascot.push(s),
    speak: (t) => void spoken.push(t),
    log: () => undefined
  });
  engine.start(10 ** 9);

  const flow = new HintFlow({
    now: () => clock.t,
    bus: stuckBus,
    getSession: () => session,
    isPaused: () => false,
    requestPageSummary,
    capture: async () => {
      throw new Error('the page summary must be used, not a screenshot');
    },
    confirmCapture: async () => true,
    requestHints: (c, s, a) => hints.requestHints(c, s, a),
    requestFollowup: (f, c, s, a) => hints.requestFollowup(f, c, s, a),
    logLevelShown: (e) => hints.logLevelShown(e),
    push: (n) => queue.push(n, { userInitiated: true }),
    respond: (r) => queue.respond(r),
    onNudgeResponse: (fn) => {
      queue.on('response', fn);
      return () => void queue.off('response', fn);
    },
    onSessionChange: (fn) => sessionChange.on('change', fn),
    setLadderOpen: (open) => engine.setLadderOpen(open),
    markImGood: () => engine.imGood(),
    log: () => undefined,
    thinkingDelayMs: 10 ** 9
  });
  flow.start();

  const advance = (sec: number) => {
    clock.t += sec * 1000;
    engine.tick();
  };
  const press = (action: string) => queue.respond({ id: shown[shown.length - 1].id!, action, via: 'button' });
  const settle = () => new Promise((r) => setTimeout(r, 30));
  return { engine, flow, queue, shown, mascot, spoken, advance, press, settle, hints };
}

/** The page loads, the student gets two answers wrong. */
function studentStruggles() {
  setLatestPageSummary(algebraPage());
  // Like Agent A's extension link: asking for a summary returns a fresh one from the open tab
  setPageSummaryRequester(async () => algebraPage());
  stuckBus.emit('problem-changed', PROBLEM);
  stuckBus.emit('signal', wrongAnswerLoop());
}

describe('M2-int: demo scenario A with DEMO_MODE=1, offline', () => {
  it('two wrong answers climb to the offer; accepting shows five distinct ladder levels one at a time', async () => {
    const s = scenario();
    studentStruggles();

    // glance -> "?" -> offer, one step every 45 s
    expect(s.mascot[s.mascot.length - 1]).toBe('glance');
    s.advance(46);
    expect(s.mascot[s.mascot.length - 1]).toBe('question-mark');
    expect(s.shown).toHaveLength(0);
    s.advance(46);
    expect(s.shown).toHaveLength(1);
    expect(s.shown[0]).toMatchObject({ kind: 'stuck', level: 3 });
    expect(s.shown[0].buttons?.map((b) => b.action)).toEqual([ACTIONS.ACCEPT_HINT, ACTIONS.DECLINE, ACTIONS.IM_GOOD]);

    // Accept: the page summary (not a screenshot) becomes the context
    s.press(ACTIONS.ACCEPT_HINT);
    await s.settle();
    const expected = HINT_LEVEL_KEYS.map((k) => MOCK_HINTS[PROBLEM].hint_levels[k]);
    expect(s.shown).toHaveLength(2);
    expect(s.shown[1].text).toBe(expected[0]);
    expect(s.engine.isLadderOpen()).toBe(true);

    for (let level = 2; level <= 5; level++) {
      s.press(ACTIONS.ANOTHER_HINT);
      expect(s.shown).toHaveLength(level + 1);
      expect(s.shown[level].text).toBe(expected[level - 1]);
    }
    const ladder = s.shown.slice(1).map((n) => n.text);
    expect(new Set(ladder).size).toBe(5);

    // Outside assessment mode every ladder bubble offers "Show the answer"
    expect(s.shown.slice(1).every((n) => n.buttons?.some((b) => b.action === ACTIONS.SHOW_ANSWER))).toBe(true);

    // The levels were logged
    expect(db.prepare('SELECT hint_level FROM hint_requests ORDER BY id').all()).toEqual([1, 2, 3, 4, 5].map((hint_level) => ({ hint_level })));

    // Done: the engine is released and Wolfie goes back to idle
    s.press(ACTIONS.GOT_IT);
    expect(s.engine.isLadderOpen()).toBe(false);
    expect(s.mascot[s.mascot.length - 1]).toBe('idle');
  });

  it('in assessment mode "Show the answer" never appears and level 5 is a next step only', async () => {
    const s = scenario({ assessment: true });
    studentStruggles();
    s.advance(46);
    s.advance(46);
    s.press(ACTIONS.ACCEPT_HINT);
    await s.settle();
    for (let i = 0; i < 4; i++) s.press(ACTIONS.ANOTHER_HINT);
    const ladder = s.shown.slice(1);
    expect(ladder).toHaveLength(5);
    expect(ladder.some((n) => n.buttons?.some((b) => b.action === ACTIONS.SHOW_ANSWER))).toBe(false);
    expect(ladder[4].text).not.toMatch(/2x = 8/);
    expect(ladder.every((n) => !/x = 4/.test(n.text))).toBe(true);
  });

  it('declining the offer starts the 3 minute cooldown', async () => {
    const s = scenario();
    studentStruggles();
    s.advance(46);
    s.advance(46);
    s.press(ACTIONS.DECLINE);
    stuckBus.emit('signal', wrongAnswerLoop());
    s.advance(60);
    expect(s.shown).toHaveLength(1); // nothing new inside the cooldown
    expect(s.mascot[s.mascot.length - 1]).toBe('idle');
    expect(s.engine.isLadderOpen()).toBe(false);
  });

  it('"I am good" on the offer suppresses further offers for that problem', async () => {
    const s = scenario();
    studentStruggles();
    s.advance(46);
    s.advance(46);
    s.press(ACTIONS.IM_GOOD);
    expect(s.engine.snapshot().state.imGoodProblemIds).toEqual([PROBLEM]);
    stuckBus.emit('signal', wrongAnswerLoop());
    for (let i = 0; i < 4; i++) s.advance(60); // 4 minutes, inside the signal's 5 minute life
    expect(s.shown).toHaveLength(1); // capped at the "?" for this problem
    expect(s.mascot[s.mascot.length - 1]).toBe('question-mark');
  });

  it('voice mode: an unanswered offer is spoken after 60 s; "I\'m stuck" by voice starts the same flow', async () => {
    const s = scenario({ voice: true });
    studentStruggles();
    s.advance(46);
    s.advance(46);
    expect(s.spoken).toEqual([]);
    s.advance(61);
    expect(s.spoken).toHaveLength(1);
    expect(s.spoken[0]).toMatch(/Want a hint/);

    stuckBus.emit('help-requested', 'voice');
    await s.settle();
    expect(s.flow.hasOpenLadder()).toBe(true);
    expect(getLatestPageSummary()?.problemId).toBe(PROBLEM);
  });
});
