import { describe, expect, it } from 'vitest';
import type { StruggleSignal } from '@wolfie/shared';
import { BacktrackDetector, normalizeUrl } from '../../lib/backtrack';
import { classifyFeedback, SignalDetectors, type DetectorConfig } from '../detectors';

const config: DetectorConfig = {
  wrongAnswerCount: 2,
  deadClickCount: 3,
  deadClickWindowMs: 20_000,
  validationErrorCount: 3,
  validationWindowMs: 120_000
};

function harness() {
  let now = 0;
  const signals: StruggleSignal[] = [];
  const detectors = new SignalDetectors({ now: () => now, emit: (s) => signals.push(s), config });
  return {
    detectors,
    signals,
    at: (t: number) => {
      now = t;
    }
  };
}

const failed = { failed: true, validation: false, success: false };
const invalid = { failed: false, validation: true, success: false };
const ok = { failed: false, validation: false, success: true };

describe('classifyFeedback', () => {
  it('tells wrong answers, validation errors and successes apart', () => {
    expect(classifyFeedback(['Incorrect, try again.'])).toEqual(failed);
    expect(classifyFeedback(['Wrong answer on test case 2'])).toEqual(failed);
    expect(classifyFeedback(['TypeError: x is not a function'])).toMatchObject({ failed: false }); // no keyword
    expect(classifyFeedback(['Runtime Error'])).toEqual(failed);
    expect(classifyFeedback(['3 of 5 tests passed, 2 failed'])).toEqual(failed);
    expect(classifyFeedback(['This field is required'])).toEqual(invalid);
    expect(classifyFeedback(['Please enter a number'])).toEqual(invalid);
    expect(classifyFeedback(['Correct! Well done.'])).toEqual(ok);
    expect(classifyFeedback(['All test cases passed'])).toEqual(ok);
    expect(classifyFeedback(['Incorrect'])).toMatchObject({ success: false }); // "correct" inside "Incorrect"
    expect(classifyFeedback([])).toEqual({ failed: false, validation: false, success: false });
  });
});

describe('wrong_answer_loop', () => {
  it('fires (strong) from the second failed check on the same problem, and keeps refreshing', () => {
    const { detectors, signals, at } = harness();
    detectors.setProblem('p1');
    at(1000);
    detectors.noteResult(failed);
    expect(signals).toEqual([]);
    at(30_000);
    detectors.noteResult(failed);
    expect(signals).toHaveLength(1);
    expect(signals[0]).toMatchObject({ type: 'wrong_answer_loop', strength: 'strong', problemId: 'p1', timestamp: 30_000, metadata: { attempts: 2 } });
    at(60_000);
    detectors.noteResult(failed);
    expect(signals).toHaveLength(2); // refreshed
  });

  it('a success resets the count, and a different problem has its own count', () => {
    const { detectors, signals } = harness();
    detectors.setProblem('p1');
    detectors.noteResult(failed);
    detectors.noteResult(ok);
    detectors.noteResult(failed);
    expect(signals).toEqual([]);
    detectors.setProblem('p2');
    detectors.noteResult(failed);
    expect(signals).toEqual([]);
    detectors.noteResult(failed);
    expect(signals).toHaveLength(1);
    expect(signals[0].problemId).toBe('p2');
  });

  it('does not count validation errors as wrong answers', () => {
    const { detectors, signals } = harness();
    detectors.noteResult(invalid);
    detectors.noteResult(invalid);
    expect(signals.filter((s) => s.type === 'wrong_answer_loop')).toEqual([]);
  });
});

describe('validation_errors', () => {
  it('fires (weak) at 3 errors within 2 minutes, not when spread out', () => {
    const a = harness();
    for (const t of [0, 50_000, 100_000]) {
      a.at(t);
      a.detectors.noteResult(invalid);
    }
    expect(a.signals).toHaveLength(1);
    expect(a.signals[0]).toMatchObject({ type: 'validation_errors', strength: 'weak' });

    const b = harness();
    for (const t of [0, 70_000, 140_000, 210_000]) {
      b.at(t);
      b.detectors.noteResult(invalid);
    }
    expect(b.signals).toEqual([]);
  });
});

describe('dead_control_clicks', () => {
  it('fires (strong) at 3 clicks on one control within 20 s', () => {
    const { detectors, signals, at } = harness();
    for (const t of [0, 5000, 10_000]) {
      at(t);
      detectors.noteDeadClick('continue');
    }
    expect(signals).toHaveLength(1);
    expect(signals[0]).toMatchObject({ type: 'dead_control_clicks', strength: 'strong', metadata: { controlId: 'continue', clicks: 3 } });
  });

  it('does not fire when slow, or when clicks are spread over different controls', () => {
    const slow = harness();
    for (const t of [0, 15_000, 30_000, 45_000]) {
      slow.at(t);
      slow.detectors.noteDeadClick('continue');
    }
    expect(slow.signals).toEqual([]);

    const spread = harness();
    for (const [i, id] of ['a', 'b', 'c', 'a', 'b'].entries()) {
      spread.at(i * 1000);
      spread.detectors.noteDeadClick(id);
    }
    expect(spread.signals).toEqual([]);
  });

  it('signals carry no page text', () => {
    const { detectors, signals } = harness();
    for (let i = 0; i < 3; i++) detectors.noteDeadClick('btn');
    expect(Object.keys(signals[0].metadata ?? {}).sort()).toEqual(['clicks', 'controlId']);
  });
});

describe('backtracking', () => {
  function bt(count = 3, windowMs = 120_000) {
    let now = 0;
    const signals: StruggleSignal[] = [];
    const d = new BacktrackDetector({ count, windowMs, now: () => now, emit: (s) => signals.push(s) });
    return {
      signals,
      visit: (url: string, at: number) => {
        now = at;
        d.visit(url);
      }
    };
  }
  const A = 'https://docs.example.com/lesson';
  const B = 'https://stackoverflow.com/q/1';

  it('fires (weak) after A B A B A B A within 2 minutes', () => {
    const t = bt();
    [A, B, A, B, A, B].forEach((u, i) => t.visit(u, i * 10_000));
    expect(t.signals).toEqual([]);
    t.visit(A, 60_000);
    expect(t.signals).toHaveLength(1);
    expect(t.signals[0]).toMatchObject({ type: 'backtracking', strength: 'weak' });
  });

  it('ignores repeated reports of one URL, queries and fragments', () => {
    const t = bt();
    const seq = [A, `${A}?x=1#top`, B, `${B}/`, A, B, A]; // = A B A B A
    seq.forEach((u, i) => t.visit(u, i * 5000));
    expect(t.signals).toHaveLength(0); // two round trips so far
    t.visit(B, 50_000);
    t.visit(A, 55_000);
    expect(t.signals.length).toBeGreaterThan(0);
  });

  it('does not fire when slow or when browsing a hub', () => {
    const slow = bt();
    [A, B, A, B, A, B, A].forEach((u, i) => slow.visit(u, i * 30_000));
    expect(slow.signals).toEqual([]);

    const hub = bt();
    const search = 'https://google.com/search';
    [search, 'https://a.com/1', search, 'https://b.com/2', search, 'https://c.com/3', search].forEach((u, i) => hub.visit(u, i * 5000));
    expect(hub.signals).toEqual([]);
  });

  it('normalizes URLs and rejects non-web ones', () => {
    expect(normalizeUrl('https://x.com/a/?q=1#h')).toBe('https://x.com/a');
    expect(normalizeUrl('https://x.com')).toBe('https://x.com/');
    expect(normalizeUrl('chrome://settings')).toBeNull();
    expect(normalizeUrl('junk')).toBeNull();
  });
});
