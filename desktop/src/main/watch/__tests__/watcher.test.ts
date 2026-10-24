import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { PageSummary, StruggleSignal } from '@wolfie/shared';
import type { ForegroundInfo } from '../../foreground.js';
import type { CaptureResult } from '../../hints/capture.js';
import type { LlmCall } from '../../llm/client.js';
import { LLMError } from '../../llm/provider.js';
import { SessionMemory } from '../memory.js';
import { Watcher, UNCHANGED_RECHECK_MS, type WatcherDeps } from '../watcher.js';
import type { Observation } from '../types.js';
import { obs } from './helpers.js';

const FRAME_A = 'data:image/jpeg;base64,QUFB';
const FRAME_B = 'data:image/jpeg;base64,QkJC';

let now: number;
let active: boolean;
let fg: ForegroundInfo | null;
let frame: string;
let reply: Observation | Error;
let calls: Array<LlmCall<unknown>>;
let signals: StruggleSignal[];
let urls: string[];
let captures: number;
let memory: SessionMemory;

function make(over: Partial<WatcherDeps> = {}): Watcher {
  return new Watcher({
    now: () => now,
    isActive: () => active,
    intervalMs: () => 8000,
    getForeground: () => fg,
    isExcludedApp: (name) => name === 'Messages',
    isExcludedDomain: (d) => d.endsWith('chase.com'),
    getPageSummary: () => null,
    capture: async (): Promise<CaptureResult> => {
      captures++;
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
  fg = { appName: 'Google Chrome', windowTitle: 'paper.pdf', isBrowser: true, domain: 'example.edu', contentUrl: 'https://example.edu/paper.pdf', ts: now };
  frame = FRAME_A;
  reply = obs();
  calls = [];
  signals = [];
  urls = [];
  captures = 0;
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

  it('never captures excluded apps, excluded domains, or a browser page it cannot identify', async () => {
    const w = make();
    fg = { appName: 'Messages', windowTitle: 'Mom', isBrowser: false, domain: null, contentUrl: null, ts: now };
    await w.tick();
    fg = { appName: 'Google Chrome', windowTitle: 'Chase', isBrowser: true, domain: 'secure.chase.com', contentUrl: null, ts: now };
    await w.tick();
    fg = { appName: 'Google Chrome', windowTitle: 'New Tab', isBrowser: true, domain: null, contentUrl: null, ts: now };
    await w.tick();
    expect(captures).toBe(0);
    expect(calls).toHaveLength(0);
    expect(w.getState()).toBe('skipping');
    expect(await w.captureNow(60_000)).toBeNull();
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
      answer_check: { visible_answer: 'x = 9', looks_correct: false, issue: 'sign error when moving 5' }
    });
    await w.tick();
    frame = FRAME_B;
    now += 8000;
    await w.tick();
    expect(signals.filter((s) => s.type === 'answer_seen_wrong')).toHaveLength(1);
    expect(signals[0].strength).toBe('strong');
  });

  it('does not flag answers in learning mode', async () => {
    const w = make();
    reply = obs({ answer_check: { visible_answer: '42', looks_correct: false, issue: 'x' } });
    await w.tick();
    expect(signals).toHaveLength(0);
  });

  it('reports the daily limit as a state, not a crash', async () => {
    const w = make();
    reply = new LLMError('cap', 'DAILY_CAP', 'gemini');
    await w.tick();
    expect(w.getState()).toBe('limit_reached');
  });

  it('reports missing Screen Recording permission', async () => {
    const w = make({ capture: async () => ({ ok: false, reason: 'permission' }) });
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
    expect(captures).toBe(1);
    now += 30_000;
    frame = FRAME_B;
    expect(await w.captureNow(20_000)).toBe(FRAME_B);
    expect(captures).toBe(2);
  });

  it('reset() forgets flagged answers so a new session can flag them again', async () => {
    const w = make();
    reply = obs({ mode: 'homework', answer_check: { visible_answer: 'x = 9', looks_correct: false, issue: 'sign' } });
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
    reply = obs({ mode: 'homework', answer_check: { visible_answer: 'x = 9', looks_correct: false, issue: 'sign' } });
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
    const w = make({ capture: async () => ({ ok: false, reason: 'empty' }) });
    await w.tick();
    expect(w.getState()).toBe('skipping');
    expect(calls).toHaveLength(0);
  });
});
