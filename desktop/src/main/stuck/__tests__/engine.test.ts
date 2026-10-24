import { describe, expect, it } from 'vitest';
import { SettingsDefaults, type MascotStateType, type NudgeInput, type NudgeResponse, type StruggleSignal } from '@wolfie/shared';
import { TypedEmitter } from '../../typed-emitter.js';
import { stuckBus as busType } from '../bus.js';
import { EscalationEngine, MIN_SIGNAL_LIFETIME_MS, OFFER_TEXT, PUSH_RETRY_MS, type EngineDeps } from '../engine.js';
import { ACTIONS } from '../actions.js';

type Bus = typeof busType;

function setup(opts: { voice?: boolean; session?: boolean } = {}) {
  const clock = { t: 1_000_000 };
  const bus = new TypedEmitter<{
    signal: [StruggleSignal];
    input: [number];
    'help-requested': ['auto' | 'manual' | 'voice'];
    'problem-changed': [string | null];
  }>() as unknown as Bus;
  const sessionChange = new TypedEmitter<{ change: [] }>();
  const responses = new TypedEmitter<{ response: [NudgeResponse] }>();
  const env = {
    session: opts.session === false ? null : { id: 's1' },
    paused: false,
    snoozed: false,
    voice: opts.voice ?? true,
    pushResult: 'n1' as string | null
  };
  const pushed: NudgeInput[] = [];
  const mascot: MascotStateType[] = [];
  const spoken: string[] = [];
  const logs: Array<{ type: string; payload: Record<string, unknown> }> = [];
  const helpEvents: string[] = [];
  bus.on('help-requested', (t) => void helpEvents.push(t));

  const deps: EngineDeps = {
    now: () => clock.t,
    bus,
    getSession: () => env.session,
    onSessionChange: (fn) => sessionChange.on('change', fn),
    isPaused: () => env.paused,
    isSnoozed: () => env.snoozed,
    voiceMode: () => env.voice,
    thresholds: () => SettingsDefaults['stuck.thresholds'],
    idleMinutes: () => 4,
    push: (n) => {
      pushed.push(n);
      return env.pushResult;
    },
    onNudgeResponse: (fn) => responses.on('response', fn),
    setMascotState: (s) => void mascot.push(s),
    speak: (t) => void spoken.push(t),
    log: (type, payload) => void logs.push({ type, payload })
  };
  const engine = new EscalationEngine(deps);
  engine.start(10 ** 9); // ticks are driven by the tests
  const at = (sec: number) => {
    clock.t = 1_000_000 + sec * 1000;
  };
  const advance = (sec: number) => {
    at(sec);
    engine.tick();
  };
  const strong = (type: StruggleSignal['type'] = 'wrong_answer_loop', problemId?: string): StruggleSignal => ({
    type,
    strength: 'strong',
    timestamp: clock.t,
    problemId
  });
  const weak = (type: StruggleSignal['type']): StruggleSignal => ({ type, strength: 'weak', timestamp: clock.t });
  return { engine, bus, env, pushed, mascot, spoken, logs, helpEvents, responses, sessionChange, clock, at, advance, strong, weak };
}

const lastMascot = (t: ReturnType<typeof setup>) => t.mascot[t.mascot.length - 1];

describe('EscalationEngine', () => {
  it('climbs glance -> ? -> offer, one step per 45 s', () => {
    const t = setup();
    t.at(0);
    t.bus.emit('signal', t.strong());
    expect(lastMascot(t)).toBe('glance');
    t.advance(30);
    expect(lastMascot(t)).toBe('glance');
    t.advance(46);
    expect(lastMascot(t)).toBe('question-mark');
    expect(t.pushed).toHaveLength(0);
    t.advance(92);
    expect(t.pushed).toHaveLength(1);
    expect(t.pushed[0]).toMatchObject({ kind: 'stuck', level: 3, text: OFFER_TEXT });
    expect(t.pushed[0].buttons?.map((b) => b.action)).toEqual([ACTIONS.ACCEPT_HINT, ACTIONS.DECLINE, ACTIONS.IM_GOOD]);
    expect(t.logs.filter((l) => l.type === 'stuck.level').map((l) => l.payload.level)).toEqual([1, 2, 3]);
  });

  it('a dead_control_clicks signal (20 s window) survives the 90 s climb to the offer', () => {
    const t = setup();
    t.at(0);
    t.bus.emit('signal', t.strong('dead_control_clicks'));
    t.advance(46);
    t.advance(92);
    expect(t.pushed).toHaveLength(1);
    // ...but not past max(window, 5 min) unless re-emitted
    t.advance(92 + MIN_SIGNAL_LIFETIME_MS / 1000 + 1);
    expect(t.engine.snapshot().signals).toEqual([]);
    expect(lastMascot(t)).toBe('idle');
  });

  it('re-emitting a signal refreshes its lifetime', () => {
    const t = setup();
    t.at(0);
    t.bus.emit('signal', t.strong());
    t.at(200);
    t.bus.emit('signal', t.strong());
    t.advance(450); // 250 s after the refresh, 450 s after the first
    expect(t.engine.snapshot().signals).toEqual(['wrong_answer_loop']);
  });

  it('weak signals alone cap at the "?"', () => {
    const t = setup();
    t.at(0);
    t.bus.emit('signal', t.weak('idle_on_work'));
    t.advance(46);
    t.advance(200);
    t.advance(290);
    expect(lastMascot(t)).toBe('question-mark');
    expect(t.pushed).toHaveLength(0);
  });

  it('accept: starts the hint flow (auto), clears signals, and holds level 0 while a ladder is open', () => {
    const t = setup();
    t.at(0);
    t.bus.emit('signal', t.strong());
    t.advance(46);
    t.advance(92);
    t.responses.emit('response', { id: 'n1', action: ACTIONS.ACCEPT_HINT, via: 'button' });
    expect(t.helpEvents).toEqual(['auto']);
    expect(t.engine.snapshot().signals).toEqual([]);
    expect(lastMascot(t)).toBe('idle');
    expect(t.logs.some((l) => l.type === 'offer.accepted')).toBe(true);

    t.engine.setLadderOpen(true);
    t.bus.emit('signal', t.strong());
    t.advance(300);
    expect(t.engine.snapshot().signals).toEqual([]);
    expect(t.pushed).toHaveLength(1);
    t.engine.setLadderOpen(false);
    t.bus.emit('signal', t.strong());
    expect(t.engine.snapshot().signals).toEqual(['wrong_answer_loop']);
  });

  it('decline: 3 min of nothing, then re-escalates one level lower, then fully after 10 min', () => {
    const t = setup();
    t.at(0);
    t.bus.emit('signal', t.strong());
    t.advance(46);
    t.advance(92);
    t.responses.emit('response', { id: 'n1', action: ACTIONS.DECLINE, via: 'button' });
    expect(t.logs.some((l) => l.type === 'offer.declined')).toBe(true);
    const declinedAt = 92;

    t.advance(declinedAt + 60);
    t.bus.emit('signal', t.strong());
    t.advance(declinedAt + 120);
    expect(lastMascot(t)).toBe('idle'); // inside the 3 min cooldown

    t.bus.emit('signal', t.strong());
    t.advance(declinedAt + 181);
    expect(lastMascot(t)).toBe('glance');
    t.advance(declinedAt + 181 + 46);
    expect(lastMascot(t)).toBe('question-mark');
    t.bus.emit('signal', t.strong());
    t.advance(declinedAt + 181 + 100);
    expect(t.pushed).toHaveLength(1); // still penalized: target is 2

    t.at(declinedAt + 601);
    t.bus.emit('signal', t.strong());
    t.advance(declinedAt + 650);
    expect(t.pushed).toHaveLength(2);
  });

  it('a null push is not counted as shown and is retried after a pause', () => {
    const t = setup();
    t.env.pushResult = null;
    t.at(0);
    t.bus.emit('signal', t.strong());
    t.advance(46);
    t.advance(92);
    expect(t.pushed).toHaveLength(1);
    expect(t.engine.snapshot().level).toBe(2);
    expect(lastMascot(t)).toBe('question-mark');
    expect(t.logs.filter((l) => l.type === 'stuck.level').map((l) => l.payload.level)).toEqual([1, 2]);

    t.advance(92 + PUSH_RETRY_MS / 1000 - 1);
    expect(t.pushed).toHaveLength(1); // backing off
    t.env.pushResult = 'n2';
    t.advance(92 + PUSH_RETRY_MS / 1000 + 1);
    expect(t.pushed).toHaveLength(2);
    expect(t.engine.snapshot().level).toBe(3);
  });

  it('level 4 speaks the same offer, only with voice on, after 60 s unanswered', () => {
    const t = setup({ voice: true });
    t.at(0);
    t.bus.emit('signal', t.strong());
    t.advance(46);
    t.advance(92);
    t.responses.emit('response', { id: 'n1', action: 'timeout', via: 'auto' }); // not a decline
    t.advance(92 + 59);
    expect(t.spoken).toEqual([]);
    t.advance(92 + 61);
    expect(t.spoken).toEqual([OFFER_TEXT]);
    expect(t.pushed).toHaveLength(1);

    const q = setup({ voice: false });
    q.at(0);
    q.bus.emit('signal', q.strong());
    q.advance(46);
    q.advance(92);
    q.advance(250);
    expect(q.spoken).toEqual([]);
    expect(q.engine.snapshot().level).toBe(3);
  });

  it('"I\'m good" without a problem id uses session:<id> and suppresses offers', () => {
    const t = setup();
    t.at(0);
    t.bus.emit('signal', t.strong());
    t.advance(46);
    t.advance(92);
    t.responses.emit('response', { id: 'n1', action: ACTIONS.IM_GOOD, via: 'button' });
    expect(t.engine.snapshot().state.imGoodProblemIds).toEqual(['session:s1']);

    t.bus.emit('signal', t.strong());
    t.advance(200);
    t.advance(260);
    t.advance(320);
    expect(t.pushed).toHaveLength(1);
    expect(lastMascot(t)).toBe('question-mark');
  });

  it('"I\'m good" for a known problem only covers that problem', () => {
    const t = setup();
    t.bus.emit('problem-changed', 'demo-algebra-problem');
    t.at(0);
    t.bus.emit('signal', t.strong('wrong_answer_loop', 'demo-algebra-problem'));
    t.advance(46);
    t.advance(92);
    t.engine.imGood();
    expect(t.engine.snapshot().state.imGoodProblemIds).toEqual(['demo-algebra-problem']);

    t.bus.emit('problem-changed', 'demo-disabled-button');
    expect(t.engine.snapshot().signals).toEqual([]);
    t.at(100);
    t.bus.emit('signal', t.strong('dead_control_clicks', 'demo-disabled-button'));
    t.advance(150);
    t.advance(200);
    expect(t.pushed).toHaveLength(2);
  });

  it('dismissing the bubble counts as a decline, a timeout does not', () => {
    const t = setup();
    t.at(0);
    t.bus.emit('signal', t.strong());
    t.advance(46);
    t.advance(92);
    t.responses.emit('response', { id: 'n1', action: 'timeout', via: 'auto' });
    expect(t.logs.some((l) => l.type === 'offer.declined')).toBe(false);
    expect(t.engine.hasOpenOffer()).toBe(true);
    t.responses.emit('response', { id: 'n1', action: 'dismissed', via: 'button' });
    expect(t.logs.some((l) => l.type === 'offer.declined')).toBe(true);
    expect(t.engine.hasOpenOffer()).toBe(false);
  });

  it('ignores responses for other nudges', () => {
    const t = setup();
    t.at(0);
    t.bus.emit('signal', t.strong());
    t.advance(46);
    t.advance(92);
    t.responses.emit('response', { id: 'other', action: ACTIONS.DECLINE, via: 'button' });
    expect(t.engine.hasOpenOffer()).toBe(true);
  });

  it('manual help (hotkey / click / voice) starts the flow and resets the climb', () => {
    const t = setup();
    t.at(0);
    t.bus.emit('signal', t.strong());
    t.advance(46);
    t.bus.emit('help-requested', 'manual');
    expect(t.engine.snapshot().signals).toEqual([]);
    expect(lastMascot(t)).toBe('idle');
    expect(t.logs.some((l) => l.type === 'offer.accepted')).toBe(false);
  });

  it('never offers within 5 s of input, and respects snooze and pause', () => {
    const t = setup();
    t.at(0);
    t.bus.emit('signal', t.strong());
    t.advance(46);
    t.at(90);
    t.bus.emit('input', t.clock.t - 2000);
    t.advance(91);
    expect(t.pushed).toHaveLength(0);
    t.advance(96);
    expect(t.pushed).toHaveLength(1);

    const s = setup();
    s.env.snoozed = true;
    s.at(0);
    s.bus.emit('signal', s.strong());
    s.advance(100);
    expect(s.mascot.filter((m) => m !== 'idle')).toEqual([]);

    const p = setup();
    p.env.paused = true;
    p.mascot.length = 0;
    p.at(0);
    p.bus.emit('signal', p.strong());
    p.advance(100);
    expect(p.mascot).toEqual([]); // sleeping sprite is main's; the engine leaves it alone
    expect(p.pushed).toHaveLength(0);
  });

  it('resets on every session change and ignores signals outside a session', () => {
    const t = setup();
    t.at(0);
    t.bus.emit('signal', t.strong());
    t.advance(46);
    expect(t.engine.snapshot().level).toBe(2);
    t.sessionChange.emit('change');
    expect(t.engine.snapshot()).toMatchObject({ level: 0, signals: [] });
    expect(lastMascot(t)).toBe('idle');

    t.env.session = null;
    t.sessionChange.emit('change');
    t.bus.emit('signal', t.strong());
    t.advance(100);
    expect(t.engine.snapshot().signals).toEqual([]);
  });

  it('a real problem change clears signals; a repeated id does not', () => {
    const t = setup();
    t.bus.emit('problem-changed', 'p1');
    t.at(0);
    t.bus.emit('signal', t.strong('wrong_answer_loop', 'p1'));
    t.bus.emit('problem-changed', 'p1');
    expect(t.engine.snapshot().signals).toEqual(['wrong_answer_loop']);
    t.bus.emit('problem-changed', 'p2');
    expect(t.engine.snapshot().signals).toEqual([]);
    // late signal for the old problem is dropped
    t.bus.emit('signal', t.strong('wrong_answer_loop', 'p1'));
    expect(t.engine.snapshot().signals).toEqual([]);
  });

  it('logs the signal once, without content', () => {
    const t = setup();
    t.at(0);
    t.bus.emit('signal', { ...t.strong(), metadata: { text: 'secret page text' } });
    t.bus.emit('signal', t.strong());
    const sig = t.logs.filter((l) => l.type === 'stuck.signal');
    expect(sig).toHaveLength(1);
    expect(JSON.stringify(t.logs)).not.toContain('secret');
  });
});

describe('EscalationEngine: Watch-mode signals', () => {
  it('a weaker model_stuck does not downgrade an active strong one', () => {
    const t = setup({ voice: false });
    t.bus.emit('signal', t.strong('model_stuck'));
    t.advance(45);
    t.bus.emit('signal', t.weak('model_stuck'));
    t.advance(90);
    t.bus.emit('signal', t.weak('model_stuck'));
    t.advance(135);
    // Weak alone would cap at "?"; the strong signal still allows the offer
    expect(t.pushed.some((n) => n.level === 3)).toBe(true);
  });
});
