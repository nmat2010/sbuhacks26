import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { StruggleSignal } from '@wolfie/shared';
import type { RuntimeMessage } from '../../lib/messages';
import { ContentRuntime, type RuntimeDeps } from '../runtime';
import { FakeTime, testSummaryDeps } from './helpers';

let time: FakeTime;
let sent: RuntimeMessage[];
let runtime: ContentRuntime | null;
let hostname: string;
let pathname: string;

const summaries = () => sent.filter((m): m is Extract<RuntimeMessage, { type: 'PAGE_SUMMARY' }> => m.type === 'PAGE_SUMMARY').map((m) => m.data);
const signals = (): StruggleSignal[] =>
  sent.filter((m): m is Extract<RuntimeMessage, { type: 'SIGNAL' }> => m.type === 'SIGNAL').map((m) => m.signal);

function mount(overrides: Partial<RuntimeDeps> = {}): ContentRuntime {
  runtime = new ContentRuntime({
    doc: document,
    win: window,
    location: () => ({ href: `https://${hostname}${pathname}`, hostname, pathname }),
    summaryDeps: testSummaryDeps({ now: () => time.now }),
    send: (m) => sent.push(m),
    now: () => time.now,
    setTimer: time.setTimer,
    clearTimer: time.clearTimer,
    ...overrides
  });
  return runtime;
}

const ALGEBRA = `
  <h1>Practice: Linear equations</h1>
  <div data-problem-id="demo-algebra-problem" class="problem-statement">Solve for x: 2x + 5 = 13</div>
  <input id="answer" type="text">
  <button id="check">Check</button>
  <div class="feedback" id="feedback"></div>`;

/** The demo page's own behavior: a wrong answer rewrites the feedback line. */
function wireAlgebra(): void {
  const input = document.getElementById('answer') as HTMLInputElement;
  document.getElementById('check')!.addEventListener('click', () => {
    document.getElementById('feedback')!.textContent = input.value.trim() === '4' ? 'Correct! Well done.' : 'Incorrect, try again.';
  });
}

const click = (id: string) => document.getElementById(id)!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
const pointerdown = (id: string) => document.getElementById(id)!.dispatchEvent(new Event('pointerdown', { bubbles: true }));
const answer = (v: string) => ((document.getElementById('answer') as HTMLInputElement).value = v);

beforeEach(() => {
  time = new FakeTime();
  sent = [];
  runtime = null;
  hostname = 'localhost';
  pathname = '/algebra.html';
  document.title = 'Algebra practice';
  document.body.innerHTML = '';
});

afterEach(() => {
  runtime?.dispose();
});

describe('ContentRuntime: gating', () => {
  it('does nothing and reads nothing until reporting AND page text are allowed', async () => {
    document.body.innerHTML = ALGEBRA;
    wireAlgebra();
    const r = mount();
    r.setState({ reporting: false, capturePageText: true });
    r.setState({ reporting: true, capturePageText: false }); // domain-only mode
    expect(r.isActive()).toBe(false);
    await time.advance(5000);
    answer('9');
    click('check');
    click('check');
    click('check');
    await time.advance(10_000);
    expect(sent).toEqual([]);
    expect(time.pending).toBe(0);
  });

  it('stops reading when the desktop turns reporting off (pause, browser lost focus)', async () => {
    document.body.innerHTML = ALGEBRA;
    const r = mount();
    r.setState({ reporting: true, capturePageText: true });
    await time.advance(100);
    expect(summaries()).toHaveLength(1);
    r.setState({ reporting: false, capturePageText: true });
    document.getElementById('feedback')!.textContent = 'Something new on the page, lots of different words appear';
    await time.advance(10_000);
    expect(summaries()).toHaveLength(1);
    expect(time.pending).toBe(0);
  });
});

describe('ContentRuntime: summaries', () => {
  it('sends a summary when it starts, with the problem id', async () => {
    document.body.innerHTML = ALGEBRA;
    mount().setState({ reporting: true, capturePageText: true });
    await time.advance(100);
    expect(summaries()).toHaveLength(1);
    expect(summaries()[0]).toMatchObject({ domain: 'localhost', problemId: 'demo-algebra-problem', title: 'Algebra practice' });
  });

  it('does not resend for trivial changes, but does for meaningful ones, throttled', async () => {
    document.body.innerHTML = ALGEBRA + '<p id="clock">12:00</p>';
    mount().setState({ reporting: true, capturePageText: true });
    await time.advance(100);
    expect(summaries()).toHaveLength(1);

    document.getElementById('clock')!.textContent = '12:01'; // a ticking clock is not meaningful
    await time.advance(5000);
    expect(summaries()).toHaveLength(1);

    document.getElementById('feedback')!.textContent = 'Incorrect, try again.';
    await time.advance(100); // debounced, but inside the 2 s throttle
    expect(summaries()).toHaveLength(1);
    await time.advance(3000);
    expect(summaries()).toHaveLength(2);
    expect(summaries()[1].visibleText).toContain('Incorrect, try again.');
    expect(summaries()[1].errorMessages).toEqual([]); // .feedback is not an error element
  });

  it('requestSummary sends immediately, ignoring the throttle', async () => {
    document.body.innerHTML = ALGEBRA;
    const r = mount();
    r.setState({ reporting: true, capturePageText: true });
    await time.advance(100);
    r.requestSummary();
    expect(summaries()).toHaveLength(2);
  });

  it('takes the problem id from a site adapter when the page does not mark one', async () => {
    hostname = 'leetcode.com';
    pathname = '/problems/two-sum/description/';
    document.body.innerHTML = '<h1>Two Sum</h1><p>Given an array of integers</p>';
    mount().setState({ reporting: true, capturePageText: true });
    await time.advance(100);
    expect(summaries()[0].problemId).toBe('leetcode-two-sum');
  });

  it('never puts sensitive values in anything it sends', async () => {
    document.body.innerHTML =
      ALGEBRA +
      '<input type="password" value="hunter2"><input autocomplete="cc-number" value="4242424242424242"><p>OTP code: 123456</p>';
    mount().setState({ reporting: true, capturePageText: true });
    await time.advance(100);
    const blob = JSON.stringify(sent);
    for (const secret of ['hunter2', '4242424242424242', '123456']) expect(blob).not.toContain(secret);
  });
});

describe('ContentRuntime: wrong_answer_loop', () => {
  beforeEach(() => {
    document.body.innerHTML = ALGEBRA;
    wireAlgebra();
  });

  it('two wrong answers on the same problem produce one strong signal; the first produces none', async () => {
    mount().setState({ reporting: true, capturePageText: true });
    await time.advance(100);
    answer('9');
    click('check');
    await time.advance(1000);
    expect(signals()).toEqual([]);
    await time.advance(10_000);
    click('check');
    await time.advance(1000);
    expect(signals()).toHaveLength(1);
    expect(signals()[0]).toMatchObject({ type: 'wrong_answer_loop', strength: 'strong', problemId: 'demo-algebra-problem' });
  });

  it('Enter in the answer box counts as a check', async () => {
    mount().setState({ reporting: true, capturePageText: true });
    await time.advance(100);
    const input = document.getElementById('answer')!;
    input.addEventListener('keydown', (e) => {
      if ((e as KeyboardEvent).key === 'Enter') document.getElementById('feedback')!.textContent = 'Wrong answer, try again.';
    });
    for (let i = 0; i < 2; i++) {
      input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
      await time.advance(1000);
    }
    expect(signals().map((s) => s.type)).toEqual(['wrong_answer_loop']);
  });

  it('a correct answer resets the loop', async () => {
    mount().setState({ reporting: true, capturePageText: true });
    await time.advance(100);
    answer('9');
    click('check');
    await time.advance(1000);
    answer('4');
    click('check');
    await time.advance(1000);
    answer('7');
    click('check');
    await time.advance(1000);
    expect(signals()).toEqual([]);
  });

  it('a check that changes nothing is a dead click, not a failed check', async () => {
    document.body.innerHTML = ALGEBRA; // no handler wired
    mount().setState({ reporting: true, capturePageText: true });
    await time.advance(100);
    for (let i = 0; i < 3; i++) {
      click('check');
      await time.advance(1500);
    }
    expect(signals().map((s) => s.type)).toEqual(['dead_control_clicks']);
  });
});

describe('ContentRuntime: dead_control_clicks', () => {
  it('3 clicks on a disabled Continue within 20 s fire a strong signal', async () => {
    document.body.innerHTML = '<div data-problem-id="demo-disabled-button">Finish the form</div><button id="continue" disabled>Continue</button>';
    mount().setState({ reporting: true, capturePageText: true });
    await time.advance(100);
    pointerdown('continue');
    await time.advance(4000);
    pointerdown('continue');
    expect(signals()).toEqual([]);
    await time.advance(4000);
    pointerdown('continue');
    expect(signals()).toHaveLength(1);
    expect(signals()[0]).toMatchObject({ type: 'dead_control_clicks', strength: 'strong', problemId: 'demo-disabled-button' });
  });

  it('counts a click once when both pointerdown and click arrive, and handles aria-disabled', async () => {
    document.body.innerHTML = '<button id="continue" aria-disabled="true">Continue</button>';
    mount().setState({ reporting: true, capturePageText: true });
    await time.advance(100);
    for (let i = 0; i < 2; i++) {
      pointerdown('continue');
      click('continue');
      await time.advance(500);
    }
    expect(signals()).toEqual([]);
    pointerdown('continue');
    click('continue');
    expect(signals()).toHaveLength(1);
  });

  it('slow clicking does not fire', async () => {
    document.body.innerHTML = '<button id="continue" disabled>Continue</button>';
    mount().setState({ reporting: true, capturePageText: true });
    await time.advance(100);
    for (let i = 0; i < 4; i++) {
      pointerdown('continue');
      await time.advance(12_000);
    }
    expect(signals()).toEqual([]);
  });

  it('a button that does something is not dead', async () => {
    document.body.innerHTML = '<button id="toggle">Show hint</button><div id="out"></div>';
    document.getElementById('toggle')!.addEventListener('click', () => {
      document.getElementById('out')!.textContent = String(Math.random());
    });
    mount().setState({ reporting: true, capturePageText: true });
    await time.advance(100);
    for (let i = 0; i < 4; i++) {
      click('toggle');
      await time.advance(1500);
    }
    expect(signals()).toEqual([]);
  });
});

describe('ContentRuntime: validation_errors', () => {
  it('3 submits answered by validation errors within 2 minutes fire a weak signal', async () => {
    document.body.innerHTML = `
      <form id="f"><input id="answer" type="text"><button id="go" type="submit">Submit</button><div id="msg" class="error"></div></form>`;
    document.getElementById('f')!.addEventListener('submit', (e) => {
      e.preventDefault();
      document.getElementById('msg')!.textContent = 'This field is required';
    });
    mount().setState({ reporting: true, capturePageText: true });
    await time.advance(100);
    for (let i = 0; i < 3; i++) {
      document.getElementById('f')!.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
      await time.advance(2000);
    }
    expect(signals().map((s) => [s.type, s.strength])).toEqual([['validation_errors', 'weak']]);
  });
});
