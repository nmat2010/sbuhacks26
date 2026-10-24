import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { existsSync, readFileSync } from 'fs';
import { dirname, resolve } from 'path';
import { fileURLToPath } from 'url';
import { JSDOM } from 'jsdom';
import type { StruggleSignal } from '@wolfie/shared';
import type { RuntimeMessage } from '../../lib/messages';
import { ContentRuntime } from '../runtime';
import { FakeTime, flush, testSummaryDeps } from './helpers';

// Each demo page (A7) runs its own script in jsdom; the extension's A5 runtime watches it while a
// "student" drives it with DOM events. The expected signal must fire, and the summary must carry
// the problem id that the mock hint bank is keyed on.

const PAGES = resolve(dirname(fileURLToPath(import.meta.url)), '../../../../demo-pages');

let time: FakeTime;
let sent: RuntimeMessage[];
let dom: JSDOM;
let runtime: ContentRuntime;

const signals = (): StruggleSignal[] =>
  sent.filter((m): m is Extract<RuntimeMessage, { type: 'SIGNAL' }> => m.type === 'SIGNAL').map((m) => m.signal);
const lastSummary = () =>
  [...sent].reverse().find((m): m is Extract<RuntimeMessage, { type: 'PAGE_SUMMARY' }> => m.type === 'PAGE_SUMMARY')?.data;

async function open(file: string): Promise<void> {
  const html = readFileSync(resolve(PAGES, file), 'utf8');
  dom = new JSDOM(html, { url: `http://localhost:5174/${file}`, runScripts: 'dangerously', pretendToBeVisual: true });
  const win = dom.window;
  runtime = new ContentRuntime({
    doc: win.document,
    win: win as unknown as Window,
    location: () => ({ href: win.location.href, hostname: win.location.hostname, pathname: win.location.pathname }),
    summaryDeps: testSummaryDeps({ now: () => time.now }),
    send: (m) => sent.push(m),
    now: () => time.now,
    setTimer: time.setTimer,
    clearTimer: time.clearTimer
  });
  runtime.setState({ reporting: true, capturePageText: true });
  await time.advance(100);
}

const $ = (id: string) => dom.window.document.getElementById(id) as HTMLElement & { value: string; disabled: boolean };
const click = (id: string) => $(id).dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true }));
const pointerdown = (id: string) => $(id).dispatchEvent(new dom.window.Event('pointerdown', { bubbles: true }));

beforeEach(() => {
  time = new FakeTime();
  sent = [];
});

afterEach(() => {
  runtime?.dispose();
  dom?.window.close();
});

describe('demo pages', () => {
  it('ships every page the README lists, offline (no external resources)', () => {
    for (const f of ['algebra.html', 'continue.html', 'coding.html', 'index.html', 'distraction.md', 'README.md']) {
      expect(existsSync(resolve(PAGES, f)), f).toBe(true);
    }
    for (const f of ['algebra.html', 'continue.html', 'coding.html']) {
      const html = readFileSync(resolve(PAGES, f), 'utf8');
      expect(html, f).not.toMatch(/(src|href)=["']https?:\/\//);
      expect(html, f).not.toMatch(/@import|url\(https?:/);
    }
  });

  describe('A: algebra.html (wrong-answer loop)', () => {
    it('reports the demo problem id', async () => {
      await open('algebra.html');
      expect(lastSummary()).toMatchObject({ problemId: 'demo-algebra-problem', domain: 'localhost' });
      expect(lastSummary()?.visibleText).toContain('2x + 5 = 13');
    });

    it('two wrong answers raise a strong wrong_answer_loop; one does not', async () => {
      await open('algebra.html');
      $('answer').value = '9';
      click('check');
      await time.advance(1500);
      expect(signals()).toEqual([]);
      expect($('feedback').textContent).toBe('Incorrect, try again.');
      click('check');
      await time.advance(1500);
      expect(signals()).toHaveLength(1);
      expect(signals()[0]).toMatchObject({ type: 'wrong_answer_loop', strength: 'strong', problemId: 'demo-algebra-problem' });
    });

    it('typing the right answer (4) clears the loop and raises nothing', async () => {
      await open('algebra.html');
      $('answer').value = '9';
      click('check');
      await time.advance(1500);
      $('answer').value = '4';
      click('check');
      await time.advance(1500);
      $('answer').value = '9';
      click('check');
      await time.advance(1500);
      expect(signals()).toEqual([]);
    });
  });

  describe('B: continue.html (disabled Continue)', () => {
    it('reports the demo problem id and the disabled control', async () => {
      await open('continue.html');
      const summary = lastSummary()!;
      expect(summary.problemId).toBe('demo-disabled-button');
      expect(summary.controls.find((c) => c.label === 'Continue')?.state).toBe('disabled');
    });

    it('three clicks on the disabled Continue within 20 s raise dead_control_clicks', async () => {
      await open('continue.html');
      for (let i = 0; i < 3; i++) {
        pointerdown('continue');
        await time.advance(2000);
      }
      expect(signals().map((s) => [s.type, s.strength, s.problemId])).toEqual([
        ['dead_control_clicks', 'strong', 'demo-disabled-button']
      ]);
    });

    it('the button enables once the email is valid (the page works as designed)', async () => {
      await open('continue.html');
      $('email').value = 'student@school.edu';
      $('email').dispatchEvent(new dom.window.Event('input', { bubbles: true }));
      expect($('continue').disabled).toBe(false);
    });
  });

  describe('C: coding.html (failing results)', () => {
    it('reports the demo problem id', async () => {
      await open('coding.html');
      expect(lastSummary()?.problemId).toBe('demo-code-error');
    });

    it('running the broken code twice raises wrong_answer_loop', async () => {
      await open('coding.html');
      click('run');
      await time.advance(1500);
      expect($('results').textContent).toContain('expected 5 but got undefined');
      expect(signals()).toEqual([]);
      click('run');
      await time.advance(1500);
      expect(signals().map((s) => [s.type, s.problemId])).toEqual([['wrong_answer_loop', 'demo-code-error']]);
    });

    it('fixing the code makes the tests pass and ends the loop', async () => {
      await open('coding.html');
      click('run');
      await time.advance(1500);
      $('code').value = 'function add(a, b) { return a + b; }';
      click('run');
      await time.advance(1500);
      click('run');
      await time.advance(1500);
      expect($('results').textContent).toContain('All tests passed');
      expect(signals()).toEqual([]);
    });
  });

  it('flushes cleanly', async () => {
    await flush();
  });
});
