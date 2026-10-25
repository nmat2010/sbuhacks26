import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { PageSummary, StruggleSignal } from '@wolfie/shared';
import type { BrowserTab, ProbeResult } from '../browser-probe.js';
import type { FrontWindow } from '../front-window.js';
import type { CaptureResult } from '../../hints/capture.js';
import type { LlmCall } from '../../llm/client.js';
import { LLMError } from '../../llm/provider.js';
import { SessionMemory } from '../memory.js';
import { AWAY_SECONDS, titlesMatch, Watcher, UNCHANGED_RECHECK_MS, type WatcherDeps } from '../watcher.js';
import type { Observation } from '../types.js';
import { obs } from './helpers.js';

const FRAME_A = 'data:image/jpeg;base64,QUFB';
const FRAME_B = 'data:image/jpeg;base64,QkJC';

let now: number;
let active: boolean;
let front: FrontWindow | null;
let probe: ProbeResult;
let tab: { domain: string; contentUrl: string | null } | null;
let idle: number;
let frame: string;
let reply: Observation | Error;
let calls: Array<LlmCall<unknown>>;
let signals: StruggleSignal[];
let urls: string[];
let captures: number[];
let memory: SessionMemory;

const chrome = (over: Partial<BrowserTab> = {}): ProbeResult => ({
  ok: true,
  tab: { incognito: false, host: 'example.edu', title: 'paper.pdf', contentUrl: 'https://example.edu/paper.pdf', ...over }
});

function make(over: Partial<WatcherDeps> = {}): Watcher {
  return new Watcher({
    now: () => now,
    isActive: () => active,
    intervalMs: () => 8000,
    idleSeconds: () => idle,
    frontWindow: async () => front,
    selfPid: 999,
    isBrowser: (app) => /chrome|safari/i.test(app),
    probeBrowser: async () => probe,
    tabReport: () => tab,
    isExcludedApp: (name) => name === 'Messages',
    isExcludedDomain: (d) => d.endsWith('chase.com'),
    getPageSummary: () => null,
    capture: async (windowId): Promise<CaptureResult> => {
      captures.push(windowId);
      return { ok: true, dataUrl: frame, sourceName: 'window' };
    },
    llm: () => ({
      async generate<T>(call: LlmCall<T>): Promise<T> {
        calls.push(call as LlmCall<unknown>);
        if (reply instanceof Error) throw reply;
        return call.schema.parse(reply);
      }
    }),
    memory,
    emitSignal: (s) => void signals.push(s),
    onContentUrl: (u) => void urls.push(u),
    log: () => {},
    ...over
  });
}

beforeEach(() => {
  now = 1_000_000;
  active = true;
  front = { app: 'Google Chrome', pid: 100, windowId: 7, title: 'paper.pdf' };
  probe = chrome();
  tab = null;
  idle = 0;
  frame = FRAME_A;
  reply = obs();
  calls = [];
  signals = [];
  urls = [];
  captures = [];
  memory = new SessionMemory();
});

describe('Watcher', () => {
  it('captures, asks the model with the frame, and records the observation', async () => {
    const w = make();
    await w.tick();
    expect(calls).toHaveLength(1);
    expect(calls[0].task).toBe('watch_observe');
    expect(calls[0].images?.[0]).toEqual({ mimeType: 'image/jpeg', data: 'QUFB' });
    expect(JSON.parse(calls[0].messages[0].content)).toMatchObject({ app: 'Google Chrome', site: 'example.edu', content_url: 'https://example.edu/paper.pdf' });
    expect(memory.latest()?.obs.subject).toBe('modified transformer attention');
    expect(urls).toEqual(['https://example.edu/paper.pdf']);
    expect(w.getState()).toBe('watching');
  });

  it('does nothing while inactive, and drops the last frame', async () => {
    const w = make();
    await w.tick();
    active = false;
    await w.tick();
    expect(calls).toHaveLength(1);
    expect(w.latestFrame(60_000)).toBeNull();
    expect(w.getState()).toBe('idle');
  });

  it('never captures excluded apps, excluded sites, incognito windows, or a browser page it cannot identify', async () => {
    const w = make();
    front = { app: 'Messages', pid: 200, windowId: 9, title: 'Mom' };
    await w.tick();
    expect(w.getSkipReason()).toBe('excluded_app');
    front = { app: 'Google Chrome', pid: 100, windowId: 7, title: 'Chase' };
    probe = chrome({ host: 'secure.chase.com', title: 'Chase', contentUrl: null });
    await w.tick();
    expect(w.getSkipReason()).toBe('excluded_site');
    front = { app: 'Google Chrome', pid: 100, windowId: 8, title: 'Secret' }; // an incognito window is its own window
    probe = chrome({ incognito: true, title: 'Secret' });
    await w.tick();
    expect(w.getSkipReason()).toBe('private_window');
    front = { app: 'Google Chrome', pid: 100, windowId: 7, title: 'New Tab' };
    probe = chrome({ host: null, title: 'New Tab', contentUrl: null });
    await w.tick();
    expect(w.getSkipReason()).toBe('unknown_tab');
    expect(captures).toEqual([]);
    expect(calls).toHaveLength(0);
    expect(w.getState()).toBe('skipping');
    expect(await w.captureNow(60_000)).toBeNull();
  });

  it('a browser it cannot ask is captured only when the extension tab matches the window', async () => {
    const w = make();
    front = { app: 'Safari', pid: 300, windowId: 11, title: 'Banking' };
    probe = { ok: false, reason: 'unsupported' };
    await w.tick();
    expect(w.getSkipReason()).toBe('unsupported_browser');
    front = { app: 'Google Chrome', pid: 100, windowId: 7, title: 'paper.pdf' };
    probe = { ok: false, reason: 'denied' };
    await w.tick();
    expect(w.getSkipReason()).toBe('browser_access_denied');
    tab = { domain: 'example.edu', contentUrl: 'https://example.edu/paper.pdf' };
    await w.tick();
    expect(captures).toEqual([7]);
    expect(w.getState()).toBe('watching');
  });

  it('never looks at its own windows, and pauses while the student is away', async () => {
    const w = make();
    front = { app: 'Electron', pid: 999, windowId: 3, title: 'Wolfie Overlay' };
    await w.tick();
    expect(captures).toEqual([]);
    front = { app: 'Code', pid: 400, windowId: 5, title: 'main.ts' };
    idle = AWAY_SECONDS;
    await w.tick();
    expect(w.getState()).toBe('away');
    expect(captures).toEqual([]);
    idle = 10;
    await w.tick();
    expect(captures).toEqual([5]);
  });

  it('captures exactly the front window id, apps included', async () => {
    const w = make();
    front = { app: 'Preview', pid: 500, windowId: 42, title: 'lecture.pdf' };
    await w.tick();
    expect(captures).toEqual([42]);
    expect(JSON.parse(calls[0].messages[0].content)).toMatchObject({ app: 'Preview', window_title: 'lecture.pdf', site: null });
  });

  it('browsing or an unrelated app never raises a stuck signal', async () => {
    const w = make();
    reply = obs({ activity: 'browsing', mode: 'other', stuck: { likely: true, confidence: 0.95, reason: 'scrolling' } });
    await w.tick();
    expect(signals).toHaveLength(0);
  });

  it('skips an unchanged screen, but looks again after a minute (long pauses still count)', async () => {
    const w = make();
    await w.tick();
    now += 8000;
    await w.tick();
    expect(calls).toHaveLength(1);
    now += UNCHANGED_RECHECK_MS;
    await w.tick();
    expect(calls).toHaveLength(2);
    expect(JSON.parse(calls[1].messages[0].content).seconds_unchanged).toBeGreaterThanOrEqual(60);
    frame = FRAME_B;
    now += 8000;
    await w.tick();
    expect(calls).toHaveLength(3);
  });

  it('emits a strong model_stuck at high confidence, and a weak one only after two looks in a row', async () => {
    const w = make();
    reply = obs({ stuck: { likely: true, confidence: 0.6, reason: 'on §3.2 for 5 min' } });
    await w.tick();
    expect(signals).toHaveLength(0);
    frame = FRAME_B;
    now += 8000;
    await w.tick();
    expect(signals.map((s) => [s.type, s.strength])).toEqual([['model_stuck', 'weak']]);
    reply = obs({ stuck: { likely: true, confidence: 0.9, reason: 'scrolling back and forth' } });
    frame = FRAME_A;
    now += 8000;
    await w.tick();
    expect(signals.at(-1)).toMatchObject({ type: 'model_stuck', strength: 'strong' });
  });

  it('flags a wrong homework answer once per answer', async () => {
    const w = make();
    reply = obs({
      mode: 'homework',
      activity: 'homework',
      answer_checks: [{ question: null, visible_answer: 'x = 9', looks_correct: false, issue: 'sign error when moving 5' }]
    });
    await w.tick();
    frame = FRAME_B;
    now += 8000;
    await w.tick();
    expect(signals.filter((s) => s.type === 'answer_seen_wrong')).toHaveLength(1);
    expect(signals[0].strength).toBe('strong');
  });

  it('flags a wrong answer in any study activity (e.g. written answers in a Doc), never while browsing', async () => {
    const w = make();
    reply = obs({
      activity: 'writing',
      mode: 'learning',
      answer_checks: [{ question: null, visible_answer: 'learns the training data too well', looks_correct: false, issue: 'This describes overfitting rather than underfitting.' }]
    });
    await w.tick();
    expect(signals).toEqual([
      expect.objectContaining({ type: 'answer_seen_wrong', metadata: { source: 'watch', issue: 'This describes overfitting rather than underfitting.' } })
    ]);
    signals = [];
    reply = obs({ activity: 'browsing', mode: 'other', answer_checks: [{ question: null, visible_answer: '42', looks_correct: false, issue: 'x' }] });
    frame = FRAME_B;
    now += 8000;
    await w.tick();
    expect(signals).toHaveLength(0);
  });

  it('sends the session notes (e.g. the original problem) with each look, as one 30 s try', async () => {
    const w = make();
    await w.tick();
    frame = FRAME_B;
    now += 8000;
    await w.tick();
    const input = JSON.parse(calls[1].messages[0].content);
    expect(input.session_notes).toContain('Niranjan et al. 2026');
    expect(calls[1]).toMatchObject({ noRetry: true, timeoutMs: 30_000 });
    expect(calls[1].system).toContain('copied a problem');
  });

  it('reports the daily limit as a state, not a crash', async () => {
    const w = make();
    reply = new LLMError('cap', 'DAILY_CAP', 'gemini');
    await w.tick();
    expect(w.getState()).toBe('limit_reached');
  });

  it('reports missing Screen Recording permission', async () => {
    const w = make({ capture: async () => ({ ok: false, reason: 'permission' as const }) });
    await w.tick();
    expect(w.getState()).toBe('no_permission');
    expect(calls).toHaveLength(0);
  });

  it('sends the page summary only when it is fresh and for the tab in front', async () => {
    const page = (domain: string, ts: number): PageSummary => ({
      url: `https://${domain}/`,
      domain,
      title: 'Problem set 3',
      headings: [],
      visibleText: 'Q1. Solve 2x + 5 = 13',
      controls: [],
      errorMessages: [],
      openDialogs: [],
      timestamp: ts
    });
    let summary: PageSummary = page('example.edu', now);
    const w = make({ getPageSummary: () => summary });
    await w.tick();
    expect(JSON.parse(calls[0].messages[0].content).page_text).toContain('Solve');
    summary = page('other.com', now);
    frame = FRAME_B;
    now += 8000;
    await w.tick();
    expect(JSON.parse(calls[1].messages[0].content).page_text).toBeUndefined();
  });

  it('captureNow reuses a fresh frame and captures again when it is old', async () => {
    const w = make();
    await w.tick();
    expect(await w.captureNow(20_000)).toBe(FRAME_A);
    expect(captures).toHaveLength(1);
    now += 30_000;
    frame = FRAME_B;
    expect(await w.captureNow(20_000)).toBe(FRAME_B);
    expect(captures).toHaveLength(2);
    // A fresh frame from another window is not reused
    front = { app: 'Preview', pid: 500, windowId: 42, title: 'x.pdf' };
    await w.captureNow(20_000);
    expect(captures).toEqual([7, 7, 42]);
  });

  it('reset() forgets flagged answers so a new session can flag them again', async () => {
    const w = make();
    reply = obs({ mode: 'homework', answer_checks: [{ question: null, visible_answer: 'x = 9', looks_correct: false, issue: 'sign' }] });
    await w.tick();
    w.reset();
    now += 8000;
    await w.tick();
    expect(signals.filter((s) => s.type === 'answer_seen_wrong')).toHaveLength(2);
  });

  it('start() schedules looks and stop() ends them', async () => {
    vi.useFakeTimers();
    try {
      const w = make();
      w.start();
      await vi.advanceTimersByTimeAsync(1);
      expect(calls).toHaveLength(1);
      frame = FRAME_B;
      await vi.advanceTimersByTimeAsync(8000);
      expect(calls).toHaveLength(2);
      w.stop();
      frame = FRAME_A;
      await vi.advanceTimersByTimeAsync(30_000);
      expect(calls).toHaveLength(2);
    } finally {
      vi.useRealTimers();
    }
  });
});

describe('Watcher races and capture limits (review fixes)', () => {
  it('discards a look that finishes after stop(), reset() or deactivation', async () => {
    let release: (o: Observation) => void = () => {};
    const slow = make({
      llm: () => ({
        generate<T>(call: LlmCall<T>): Promise<T> {
          calls.push(call as LlmCall<unknown>);
          return new Promise<T>((res) => (release = (o) => res(call.schema.parse(o))));
        }
      })
    });
    reply = obs({ mode: 'homework', answer_checks: [{ question: null, visible_answer: 'x = 9', looks_correct: false, issue: 'sign' }] });
    const pending = slow.tick();
    await new Promise((r) => setTimeout(r, 0));
    slow.reset(); // e.g. the session ended or memory was cleared
    release(reply as Observation);
    await pending;
    expect(memory.isEmpty()).toBe(true);
    expect(signals).toHaveLength(0);

    const pending2 = slow.tick();
    await new Promise((r) => setTimeout(r, 0));
    active = false;
    release(reply as Observation);
    await pending2;
    expect(memory.isEmpty()).toBe(true);
  });

  it('stop() then start() during a look keeps a single loop', async () => {
    vi.useFakeTimers();
    try {
      let release: () => void = () => {};
      let inFlight = 0;
      const w = make({
        llm: () => ({
          async generate<T>(call: LlmCall<T>): Promise<T> {
            calls.push(call as LlmCall<unknown>);
            inFlight++;
            if (inFlight === 1) await new Promise<void>((r) => (release = r));
            return call.schema.parse(reply);
          }
        })
      });
      w.start();
      await vi.advanceTimersByTimeAsync(1); // first look is now waiting on the model
      w.stop();
      w.start();
      release();
      await vi.advanceTimersByTimeAsync(1);
      const before = calls.length;
      for (let i = 0; i < 3; i++) {
        frame = i % 2 ? FRAME_A : FRAME_B;
        await vi.advanceTimersByTimeAsync(8000);
      }
      // One loop: one look per interval (two loops would give about six)
      expect(calls.length - before).toBe(3);
      w.stop();
    } finally {
      vi.useRealTimers();
    }
  });

  it('an unmatched window is skipped, never replaced by a whole-screen capture', async () => {
    const w = make({ capture: async () => ({ ok: false, reason: 'empty' as const }) });
    await w.tick();
    expect(w.getState()).toBe('skipping');
    expect(calls).toHaveLength(0);
  });
});

describe('Watcher: window binding (third review)', () => {
  it('skips when the browser front tab is not the window the helper named (switch in between)', async () => {
    const w = make();
    front = { app: 'Google Chrome', pid: 100, windowId: 7, title: 'Incognito page' };
    probe = chrome({ title: 'paper.pdf' }); // windows[0] is already a different, normal window
    await w.tick();
    expect(w.getSkipReason()).toBe('window_changed');
    expect(captures).toEqual([]);
  });

  it('drops the frame when the window or tab changed while capturing', async () => {
    let n = 0;
    const w = make({
      frontWindow: async () => (++n === 1 ? front : { ...front!, title: 'Chase - Accounts' })
    });
    await w.tick();
    expect(captures).toEqual([7]);
    expect(calls).toHaveLength(0);
    expect(w.getSkipReason()).toBe('window_changed');
    expect(w.latestFrame(60_000)).toBeNull();
  });

  it('treats any app that opens web links as a browser, even an unknown one', async () => {
    const w = make();
    front = { app: 'Dia', isBrowser: true, pid: 600, windowId: 12, title: 'Bank' };
    probe = { ok: false, reason: 'unsupported' };
    await w.tick();
    expect(captures).toEqual([]);
    expect(w.getSkipReason()).toBe('unsupported_browser');
  });

  it('reuses the browser answer while the same window keeps the same title', async () => {
    let probes = 0;
    const w = make({ probeBrowser: async () => (probes++, probe) });
    await w.tick();
    frame = FRAME_B;
    now += 8000;
    await w.tick();
    expect(probes).toBe(1);
    front = { ...front!, title: 'other tab' };
    probe = chrome({ title: 'other tab', host: 'example.edu' });
    now += 8000;
    await w.tick();
    expect(probes).toBe(2);
  });

  it('is not "away" while the student is watching a video without touching anything', async () => {
    const w = make();
    reply = obs({ activity: 'watching_video', source: { kind: 'video', title: 'Lecture', locator: null } });
    await w.tick();
    idle = AWAY_SECONDS + 60;
    frame = FRAME_B;
    now += 8000;
    await w.tick();
    expect(w.getState()).toBe('watching');
    reply = obs();
    frame = FRAME_A;
    now += 8000;
    await w.tick(); // the last look was reading, so the next one counts as away
    now += 8000;
    await w.tick();
    expect(w.getState()).toBe('away');
  });
});

describe('titlesMatch', () => {
  it('accepts unread counts, audio markers and a browser/profile suffix; rejects other pages', () => {
    expect(titlesMatch('(1) Facebook 🔊', '(1) Facebook')).toBe(true);
    expect(titlesMatch('Coin Change - LeetCode', 'Coin Change - LeetCode')).toBe(true);
    expect(titlesMatch('Coin Change - LeetCode - Work', 'Coin Change - LeetCode')).toBe(true);
    expect(titlesMatch('Google Search – chase', 'Google')).toBe(false);
    expect(titlesMatch('Chase - Accounts', 'paper.pdf')).toBe(false);
    expect(titlesMatch(null, 'x')).toBe(false);
  });
});

describe('Watcher: quick reaction to a window switch', () => {
  it('poke() looks again within the 3 s gap instead of the full interval', async () => {
    vi.useFakeTimers();
    try {
      const w = make();
      w.start();
      await vi.advanceTimersByTimeAsync(1);
      expect(calls).toHaveLength(1);
      front = { app: 'Preview', pid: 500, windowId: 42, title: 'lecture.pdf' };
      frame = FRAME_B;
      w.poke();
      await vi.advanceTimersByTimeAsync(3000);
      expect(calls).toHaveLength(2);
      expect(captures.at(-1)).toBe(42);
      w.stop();
    } finally {
      vi.useRealTimers();
    }
  });

  it('reports the window it is looking at before the model answers', async () => {
    let looks = 0;
    const w = make({ onLook: () => void looks++ });
    await w.tick();
    expect(w.lookingAt()).toMatchObject({ app: 'Google Chrome', title: 'paper.pdf' });
    expect(looks).toBeGreaterThanOrEqual(2); // new window, then the recorded look
    front = { app: 'Messages', pid: 200, windowId: 9, title: 'Mom' };
    await w.tick();
    expect(w.lookingAt()).toBeNull();
  });
});

describe('Watcher: several answers on one screen', () => {
  const twoWrong = obs({
    activity: 'homework',
    mode: 'homework',
    answer_checks: [
      { question: 'What is underfitting?', visible_answer: 'learns the training data too closely', looks_correct: false, issue: 'This describes overfitting rather than underfitting.' },
      { question: '2x + 5 = 13', visible_answer: '2x + 5 = 12 ... x = 3.5', looks_correct: false, issue: "The equation here doesn't match the original (13 vs 12)." }
    ]
  });

  it('flags every wrong answer and keeps them as open issues in screen order', async () => {
    const w = make();
    reply = twoWrong;
    await w.tick();
    expect(signals.filter((s) => s.type === 'answer_seen_wrong')).toHaveLength(2);
    expect(w.openIssues().map((i) => i.question)).toEqual(['What is underfitting?', '2x + 5 = 13']);
  });

  it('drops an issue once that answer is seen corrected', async () => {
    const w = make();
    reply = twoWrong;
    await w.tick();
    reply = obs({
      activity: 'homework',
      mode: 'homework',
      answer_checks: [{ question: 'What is underfitting?', visible_answer: 'too simple to capture the pattern', looks_correct: true, issue: null }]
    });
    frame = FRAME_B;
    now += 8000;
    await w.tick();
    expect(w.openIssues().map((i) => i.question)).toEqual(['2x + 5 = 13']);
  });
});

describe('Watcher: gaps in the looks are explained in the event log', () => {
  it('logs a skip once per reason (no titles), and a failed look with its code', async () => {
    const events: Array<[string, Record<string, unknown>]> = [];
    const w = make({ log: (type, payload) => void events.push([type, payload]) });
    front = { app: 'Google Chrome', pid: 100, windowId: 7, title: 'Secret - Incognito' };
    probe = chrome({ incognito: true, title: 'Secret - Incognito' });
    await w.tick();
    now += 8000;
    await w.tick();
    expect(events).toEqual([['watch.skipped', { state: 'skipping', reason: 'private_window' }]]);
    front = { app: 'Google Chrome', pid: 100, windowId: 7, title: 'paper.pdf' };
    probe = chrome();
    reply = new LLMError('overloaded', 'RATE_LIMITED', 'gemini', true);
    now += 8000;
    await w.tick();
    expect(events.at(-1)).toEqual(['watch.failed', { code: 'RATE_LIMITED' }]);
    expect(JSON.stringify(events)).not.toContain('Secret');
  });
});

describe('Watcher: open issues follow the page (deleted questions, other pages)', () => {
  const wrong = (questions: string[]) =>
    obs({
      activity: 'homework',
      mode: 'homework',
      answer_checks: questions.map((q) => ({ question: q, visible_answer: 'x', looks_correct: false, issue: `${q} looks off` }))
    });
  const look = async (w: Watcher, o: Observation) => {
    reply = o;
    frame = frame === FRAME_A ? FRAME_B : FRAME_A;
    now += 8000;
    await w.tick();
  };

  it('a question deleted from the page stops being open after two looks without it', async () => {
    const w = make();
    await look(w, wrong(['What is underfitting?', '2x + 5 = 13']));
    await look(w, wrong(['What is underfitting?']));
    expect(w.openIssues().map((i) => i.question)).toEqual(['What is underfitting?', '2x + 5 = 13']); // one miss can be noise
    await look(w, wrong(['What is underfitting?']));
    expect(w.openIssues().map((i) => i.question)).toEqual(['What is underfitting?']);
    await look(w, obs({ activity: 'writing', mode: 'other' }));
    await look(w, obs({ activity: 'writing', mode: 'other' }));
    expect(w.openIssues()).toEqual([]);
  });

  it('help on another page does not bring up the problem from the homework page; back on it, it does', async () => {
    const w = make();
    await look(w, wrong(['2x + 5 = 13']));
    front = { app: 'Google Chrome', pid: 100, windowId: 8, title: 'PCA - YouTube' };
    probe = chrome({ host: 'www.youtube.com', title: 'PCA - YouTube', contentUrl: 'https://www.youtube.com/watch?v=HMOI_lkzW08' });
    await look(w, obs({ activity: 'watching_video', mode: 'learning', source: { kind: 'video', title: 'PCA', locator: null } }));
    expect(w.openIssues()).toEqual([]);
    front = { app: 'Google Chrome', pid: 100, windowId: 7, title: 'paper.pdf' };
    probe = chrome();
    await look(w, wrong(['2x + 5 = 13']));
    expect(w.openIssues().map((i) => i.question)).toEqual(['2x + 5 = 13']);
  });
});

describe('Watcher: thinking pause on an unanswered question', () => {
  const onQuestion = obs({ activity: 'homework', mode: 'homework', unanswered_question: 'What is overfitting?' });

  it('"I\'m stuck" makes it a thinking pause right away, and the timed pause does not offer again', async () => {
    const w = make({ stallSeconds: () => 60 });
    expect(w.stuckNow()).toBeNull(); // nothing seen yet
    reply = onQuestion;
    idle = 2;
    await w.tick();
    expect(w.stuckNow()).toBe('What is overfitting?');
    expect(w.stalledQuestion()).toBe('What is overfitting?');
    idle = 61;
    now += 8000;
    await w.tick();
    expect(signals.filter((s) => s.metadata?.stall)).toHaveLength(0);
  });

  it('raises one stall signal after 60 s without input, and names the question', async () => {
    const w = make({ stallSeconds: () => 60 });
    reply = onQuestion;
    idle = 5;
    await w.tick();
    expect(signals).toHaveLength(0);
    idle = 61;
    now += 8000;
    await w.tick();
    const stall = signals.filter((s) => s.metadata?.stall);
    expect(stall).toEqual([expect.objectContaining({ type: 'model_stuck', strength: 'strong', metadata: { source: 'watch', stall: true, question: 'What is overfitting?' } })]);
    expect(w.stalledQuestion()).toBe('What is overfitting?');
    now += 8000;
    await w.tick();
    expect(signals.filter((s) => s.metadata?.stall)).toHaveLength(1); // once per question
  });

  it('does not fire while typing, or once the question is answered', async () => {
    const w = make({ stallSeconds: () => 60 });
    reply = onQuestion;
    idle = 2;
    await w.tick();
    // The student types an answer: the next look sees it answered
    reply = obs({ activity: 'homework', mode: 'homework', unanswered_question: null });
    idle = 1;
    frame = FRAME_B;
    now += 8000;
    await w.tick();
    // ...and then pauses for a long time: not a stall, the question is answered
    idle = 120;
    now += 8000;
    await w.tick();
    expect(signals.filter((s) => s.metadata?.stall)).toHaveLength(0);
  });
});
