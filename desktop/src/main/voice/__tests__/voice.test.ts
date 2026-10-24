import { describe, expect, it, vi } from 'vitest';
import { parseIntent, type VoiceIntent } from '../intents.js';
import { EchoGuard } from '../echo.js';
import { firstSentences, splitSentences } from '../text.js';
import { Speaker } from '../speaker.js';
import { VoiceRouter, type VoiceRouterDeps } from '../router.js';
import { VoiceController } from '../controller.js';
import { MockSttProvider, MockTtsProvider } from '../mock.js';
import type { TtsProvider } from '../types.js';

describe('local intents', () => {
  const cases: Array<[string, VoiceIntent]> = [
    ['stop', 'stop'],
    ['Wait.', 'stop'],
    ['hold on', 'stop'],
    ['Hold on a sec!', 'stop'],
    ['quiet', 'stop'],
    ['snooze', 'snooze'],
    ['Wolfie, snooze please', 'snooze'],
    ['mute', 'mute'],
    ["I'm good", 'im_good'],
    ['im good', 'im_good'],
    ['Okay, I’m good.', 'im_good'],
    ['another hint', 'another_hint'],
    ['Give me another hint please', 'another_hint'],
    ['I got it', 'got_it'],
    ['got it!', 'got_it'],
    ['repeat that', 'repeat'],
    ['say that again', 'repeat'],
    ["I'm stuck", 'stuck'],
    ['Hey Wolfie, I am stuck', 'stuck'],
    ['show me the answer', 'show_answer'],
    ['taking a break', 'taking_a_break'],
    ['I need this for the task', 'need_this'],
    ['ignore for this session', 'ignore']
  ];
  it.each(cases)('%s -> %s', (text, intent) => {
    expect(parseIntent(text)).toBe(intent);
  });

  it('does not treat longer sentences as commands', () => {
    for (const text of [
      "I don't get step 2",
      "I can't stop at step two",
      'wait what does that mean for x',
      'I got it wrong again',
      'why is the answer eight',
      'ignore the negative sign',
      ''
    ]) {
      expect(parseIntent(text)).toBeNull();
    }
  });

  it('answers in well under 200 ms (no model call)', () => {
    const start = performance.now();
    for (let i = 0; i < 1000; i++) parseIntent("I'm good");
    expect((performance.now() - start) / 1000).toBeLessThan(1);
  });
});

describe('first two sentences', () => {
  it('keeps two sentences', () => {
    expect(firstSentences('One here. Two here! Three here.')).toBe('One here. Two here!');
  });
  it('does not split on decimals or abbreviations', () => {
    expect(splitSentences('Use 2.5 as the ratio, e.g. a half. Then divide. Done.')).toEqual([
      'Use 2.5 as the ratio, e.g. a half.',
      'Then divide.',
      'Done.'
    ]);
  });
  it('handles short and empty text', () => {
    expect(firstSentences('Only one')).toBe('Only one');
    expect(firstSentences('')).toBe('');
  });
});

describe('EchoGuard', () => {
  const spoken = 'Subtract five from both sides of the equation to isolate x';

  it('flags Wolfie’s own words while speaking and shortly after', () => {
    const echo = new EchoGuard({ tailMs: 3000 });
    echo.speakingStarted(spoken, 1000);
    expect(echo.isEcho('subtract five from both sides', 1500)).toBe(true);
    echo.speakingEnded(2000);
    expect(echo.isEcho('Subtract 5 from both sides of the equation', 3000)).toBe(true);
    expect(echo.isEcho('subtract five from both sides', 6000)).toBe(false);
  });

  it('lets the student’s own words through', () => {
    const echo = new EchoGuard();
    echo.speakingStarted(spoken, 0);
    expect(echo.isEcho("I don't get step two", 500)).toBe(false);
    expect(echo.isEcho('why does that work', 500)).toBe(false);
  });

  it('never treats a command as an echo, even if Wolfie just said the word', () => {
    const echo = new EchoGuard();
    echo.speakingStarted('Please stop and think about the first step', 0);
    expect(echo.isEcho('stop', 500)).toBe(false);
    expect(echo.isEcho('hold on', 500)).toBe(false);
  });

  it('is quiet when Wolfie has not spoken', () => {
    expect(new EchoGuard().isEcho('subtract five from both sides', 0)).toBe(false);
  });
});

function makeSpeaker(tts: TtsProvider, clock = { t: 0 }) {
  const echo = new EchoGuard();
  const chunks: number[] = [];
  const stops: number[] = [];
  const speaker = new Speaker({
    tts,
    echo,
    now: () => clock.t,
    onAudio: (c) => chunks.push(c.length),
    onStop: (id) => stops.push(id)
  });
  return { speaker, echo, chunks, stops };
}

describe('Speaker', () => {
  it('streams chunks and registers the text for echo suppression', async () => {
    const tts: TtsProvider = {
      name: 'fake',
      format: { mimeType: 'audio/mpeg' },
      async *synthesize() {
        yield new Uint8Array(3);
        yield new Uint8Array(5);
      }
    };
    const { speaker, echo, chunks } = makeSpeaker(tts);
    await speaker.speak('Try isolating the variable first.');
    expect(chunks).toEqual([3, 5]);
    expect(echo.isEcho('try isolating the variable first', 100)).toBe(true);
    expect(speaker.isSpeaking()).toBe(false);
  });

  it('stop() aborts the stream mid-playback (barge-in)', async () => {
    let aborted = false;
    const tts: TtsProvider = {
      name: 'fake',
      format: { mimeType: 'audio/mpeg' },
      async *synthesize(_text, signal) {
        signal.addEventListener('abort', () => (aborted = true));
        yield new Uint8Array(1);
        await new Promise((r) => setTimeout(r, 30));
        if (!signal.aborted) yield new Uint8Array(1);
      }
    };
    const { speaker, chunks, stops } = makeSpeaker(tts);
    const done = speaker.speak('A long explanation of the idea.');
    await new Promise((r) => setTimeout(r, 5));
    expect(speaker.isSpeaking()).toBe(true);
    speaker.stop();
    await done;
    expect(aborted).toBe(true);
    expect(chunks).toEqual([1]);
    expect(stops).toHaveLength(1);
    expect(speaker.isSpeaking()).toBe(false);
  });

  it('falls back to text when TTS fails', async () => {
    const tts: TtsProvider = {
      name: 'fake',
      format: { mimeType: 'audio/mpeg' },
      // eslint-disable-next-line require-yield
      async *synthesize() {
        throw new Error('tts down');
      }
    };
    const { speaker } = makeSpeaker(tts);
    await expect(speaker.speak('Hello there.')).resolves.toBeUndefined();
    expect(speaker.isSpeaking()).toBe(false);
  });

  it('repeat() speaks the last text again; mock TTS records text only', async () => {
    const tts = new MockTtsProvider();
    const { speaker } = makeSpeaker(tts);
    await speaker.speak('First thing.');
    await speaker.repeat();
    expect(tts.spoken).toEqual(['First thing.', 'First thing.']);
  });
});

function makeRouter(over: Partial<VoiceRouterDeps> = {}) {
  const clock = { t: 0 };
  const echo = new EchoGuard();
  const tts = new MockTtsProvider();
  const spoken: Array<{ text: string; stopped: boolean }> = [];
  const speaker = new Speaker({ tts, echo, now: () => clock.t, onAudio: () => {} });
  const calls = { followups: [] as string[], help: [] as string[], announced: [] as string[] };
  const handlers = {
    snooze: vi.fn(),
    mute: vi.fn(),
    im_good: vi.fn(),
    another_hint: vi.fn(),
    got_it: vi.fn(),
    show_answer: vi.fn()
  };
  let paused = false;
  let ladder = false;
  const router = new VoiceRouter({
    speaker,
    echo,
    now: () => clock.t,
    isPaused: () => paused,
    handlers,
    hasOpenLadder: () => ladder,
    onFollowup: (u) => void calls.followups.push(u),
    requestHelp: (t) => void calls.help.push(t),
    announce: (i) => void calls.announced.push(i),
    ...over
  });
  return {
    router,
    speaker,
    echo,
    calls,
    handlers,
    spoken,
    clock,
    setPaused: (v: boolean) => (paused = v),
    setLadder: (v: boolean) => (ladder = v)
  };
}

describe('VoiceRouter', () => {
  it('routes local intents to their handlers without a follow-up', async () => {
    const t = makeRouter();
    t.setLadder(true);
    expect(await t.router.handleTranscript('snooze')).toEqual({ kind: 'intent', intent: 'snooze', applied: true });
    await t.router.handleTranscript("I'm good");
    await t.router.handleTranscript('another hint');
    await t.router.handleTranscript('I got it');
    expect(t.handlers.snooze).toHaveBeenCalledTimes(1);
    expect(t.handlers.im_good).toHaveBeenCalledTimes(1);
    expect(t.handlers.another_hint).toHaveBeenCalledTimes(1);
    expect(t.handlers.got_it).toHaveBeenCalledTimes(1);
    expect(t.calls.followups).toEqual([]);
    expect(t.calls.announced).toEqual(['snooze', 'im_good', 'another_hint', 'got_it']);
  });

  it('"I’m stuck" raises help-requested(voice)', async () => {
    const t = makeRouter();
    await t.router.handleTranscript("I'm stuck");
    expect(t.calls.help).toEqual(['voice']);
  });

  it('sends other speech to the follow-up only while a ladder is open', async () => {
    const t = makeRouter();
    expect((await t.router.handleTranscript("I don't get step 2")).kind).toBe('ignored');
    t.setLadder(true);
    expect((await t.router.handleTranscript("I don't get step 2")).kind).toBe('followup');
    expect(t.calls.followups).toEqual(["I don't get step 2"]);
  });

  it('reports intents that have no handler or do not apply', async () => {
    const t = makeRouter();
    expect(await t.router.handleTranscript('taking a break')).toEqual({ kind: 'intent', intent: 'taking_a_break', applied: false });
    t.handlers.got_it.mockReturnValue(false);
    expect(await t.router.handleTranscript('got it')).toEqual({ kind: 'intent', intent: 'got_it', applied: false });
  });

  it('drops everything while paused', async () => {
    const t = makeRouter();
    t.setPaused(true);
    t.setLadder(true);
    expect(await t.router.handleTranscript('snooze')).toEqual({ kind: 'dropped', reason: 'paused' });
    expect(await t.router.handleTranscript("I'm stuck")).toEqual({ kind: 'dropped', reason: 'paused' });
    expect(t.handlers.snooze).not.toHaveBeenCalled();
    expect(t.calls.help).toEqual([]);
  });

  it('drops Wolfie’s own voice, and barges in on the student’s', async () => {
    const t = makeRouter();
    t.setLadder(true);
    // The mock TTS ends immediately, so register an in-progress utterance directly
    t.echo.speakingStarted('Try subtracting five from both sides of the equation.', 0);
    const stop = vi.spyOn(t.speaker, 'stop');

    t.router.handlePartial('try subtracting five');
    expect(stop).not.toHaveBeenCalled();
    expect(await t.router.handleTranscript('try subtracting five from both sides')).toEqual({ kind: 'dropped', reason: 'echo' });
    expect(t.calls.followups).toEqual([]);

    t.router.handlePartial('wait why');
    expect(stop).toHaveBeenCalled();
    const res = await t.router.handleTranscript('why does subtraction work here');
    expect(res.kind).toBe('followup');
  });

  it('"stop" silences playback and "repeat that" replays it', async () => {
    const tts = new MockTtsProvider();
    const echo = new EchoGuard();
    const speaker = new Speaker({ tts, echo, now: () => 0, onAudio: () => {} });
    const stop = vi.spyOn(speaker, 'stop');
    const t = makeRouter({ speaker });
    await speaker.speak('Say this once.');
    echo.speakingStarted('Say this once.', 0);
    await t.router.handleTranscript('stop');
    expect(stop).toHaveBeenCalled();
    await t.router.handleTranscript('repeat that');
    expect(tts.spoken).toEqual(['Say this once.', 'Say this once.']);
  });
});

describe('VoiceController', () => {
  function setup() {
    const stt = new MockSttProvider();
    const state = { session: true, voice: true, paused: false };
    const transcripts: string[] = [];
    const live: boolean[] = [];
    const troubles: Error[] = [];
    const controller = new VoiceController({
      stt: () => stt,
      shouldListen: () => state.session && state.voice && !state.paused,
      onPartial: () => {},
      onTranscript: (t) => transcripts.push(t),
      onTrouble: (e) => troubles.push(e),
      onMicLive: (l) => live.push(l)
    });
    return { stt, state, controller, transcripts, live, troubles };
  }

  it('opens STT only with a session, voice on, and not paused; closes on pause', async () => {
    const s = setup();
    s.state.session = false;
    await s.controller.refresh();
    expect(s.stt.starts).toBe(0);

    s.state.session = true;
    await s.controller.refresh();
    expect(s.stt.starts).toBe(1);
    expect(s.controller.micLive).toBe(true);

    s.stt.inject('hello');
    expect(s.transcripts).toEqual(['hello']);

    s.state.paused = true;
    await s.controller.refresh();
    expect(s.stt.closes).toBe(1);
    expect(s.controller.micLive).toBe(false);
    expect(s.live).toEqual([true, false]);

    s.state.paused = false;
    await s.controller.refresh();
    expect(s.stt.starts).toBe(2);
  });

  it('drops audio frames when not allowed to listen and surfaces trouble', async () => {
    const s = setup();
    await s.controller.refresh();
    s.controller.write(new Uint8Array([1]));
    s.state.voice = false;
    s.controller.write(new Uint8Array([2]));
    expect(s.stt.audioFrames).toHaveLength(1);

    s.state.voice = true;
    s.stt.fail(new Error('lost'));
    expect(s.troubles).toHaveLength(1);
    expect(s.controller.micLive).toBe(false);
  });

  it('discards a session that finished connecting after being paused', async () => {
    const s = setup();
    const p = s.controller.refresh();
    s.state.paused = true;
    await p;
    expect(s.controller.micLive).toBe(false);
    expect(s.stt.closes).toBe(1);
  });
});

describe('attachNudgeSpeech', () => {
  it('speaks nudges that carry spokenText and ignores the rest', async () => {
    const { EventEmitter } = await import('events');
    const { attachNudgeSpeech } = await import('../nudge-speech.js');
    const queue = new EventEmitter();
    const spoken: string[] = [];
    const off = attachNudgeSpeech(queue, (t) => {
      spoken.push(t);
      return true;
    });
    queue.emit('show', { kind: 'stuck', level: 3, text: 'Full text here. More.', spokenText: 'Full text here.' });
    queue.emit('show', { kind: 'stuck', level: 3, text: 'Offer without speech' });
    expect(spoken).toEqual(['Full text here.']);
    off();
    queue.emit('show', { kind: 'stuck', level: 3, text: 'x', spokenText: 'y' });
    expect(spoken).toHaveLength(1);
  });
});
