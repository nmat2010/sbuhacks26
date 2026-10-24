import { beforeEach, describe, expect, it } from 'vitest';
import { PageSummarySchema } from '@wolfie/shared';
import { isSensitiveElement, redactText } from '../redact';
import { buildPageSummary, textSimilarity } from '../summary';
import { testSummaryDeps } from './helpers';

const loc = { href: 'https://learn.example.com/algebra/set-1?token=SECRET#frag', hostname: 'learn.example.com' };

function page(body: string, title = 'Linear equations'): Document {
  document.title = title;
  document.body.innerHTML = body;
  return document;
}

beforeEach(() => {
  document.body.innerHTML = '';
});

describe('redaction', () => {
  it('recognizes password, payment and one-time-code controls', () => {
    const make = (html: string) => {
      document.body.innerHTML = html;
      return document.body.firstElementChild!;
    };
    expect(isSensitiveElement(make('<input type="password">'))).toBe(true);
    expect(isSensitiveElement(make('<input type="text" autocomplete="cc-number">'))).toBe(true);
    expect(isSensitiveElement(make('<input autocomplete="cc-exp">'))).toBe(true);
    expect(isSensitiveElement(make('<input autocomplete="one-time-code">'))).toBe(true);
    expect(isSensitiveElement(make('<input name="cardNumber">'))).toBe(true);
    expect(isSensitiveElement(make('<input id="cvv">'))).toBe(true);
    expect(isSensitiveElement(make('<input placeholder="Enter OTP">'))).toBe(true);
    expect(isSensitiveElement(make('<div data-private><input name="x"></div>').querySelector('input')!)).toBe(true);
    expect(isSensitiveElement(make('<input type="text" name="answer">'))).toBe(false);
    expect(isSensitiveElement(make('<button>Check</button>'))).toBe(false);
  });

  it('strips card numbers (Luhn-valid), SSNs and one-time codes from text', () => {
    expect(redactText('Pay with 4242 4242 4242 4242 now')).toBe('Pay with [redacted] now');
    expect(redactText('card 4242-4242-4242-4242.')).toBe('card [redacted].');
    expect(redactText('Order 1234 5678 9012 3456 shipped')).toContain('1234 5678 9012 3456'); // fails Luhn
    expect(redactText('SSN 123-45-6789')).toBe('SSN [redacted]');
    expect(redactText('Your verification code is 482913, do not share')).toBe('Your verification code is [redacted], do not share');
    expect(redactText('2x + 5 = 13, so x = 4')).toBe('2x + 5 = 13, so x = 4');
  });
});

describe('buildPageSummary', () => {
  it('produces a schema-valid summary of an algebra page', () => {
    const doc = page(`
      <h1>Practice: Linear equations</h1><h2>Set 1</h2>
      <div data-problem-id="demo-algebra-problem" class="problem-statement">Solve for x: 2x + 5 = 13</div>
      <label for="ans">Your answer</label><input id="ans" type="text" value="9">
      <button id="check">Check</button><button disabled>Next</button>
      <div class="feedback" role="alert">Incorrect, try again.</div>
      <script>var secret = 1;</script><style>.x{}</style>`);
    const s = buildPageSummary(doc, loc, testSummaryDeps());
    expect(PageSummarySchema.safeParse(s).success).toBe(true);
    expect(s).toMatchObject({
      domain: 'learn.example.com',
      url: 'https://learn.example.com/algebra/set-1', // query and fragment dropped
      title: 'Linear equations',
      headings: ['Practice: Linear equations', 'Set 1'],
      errorMessages: ['Incorrect, try again.'],
      problemId: 'demo-algebra-problem',
      problemRegion: 'Solve for x: 2x + 5 = 13',
      timestamp: 1_000
    });
    expect(s.visibleText).toContain('Solve for x');
    expect(s.visibleText).not.toContain('secret');
    expect(s.controls).toEqual([
      { id: 'ans', role: 'textbox', label: 'Your answer', state: 'enabled', type: 'text' },
      { id: 'check', role: 'button', label: 'Check', state: 'enabled', type: 'button' },
      { id: 'button-1', role: 'button', label: 'Next', state: 'disabled', type: 'button' }
    ]);
  });

  it('never includes values from password, payment or OTP fields, or typed values at all', () => {
    const doc = page(`
      <form>
        <label>Email <input name="email" value="student@example.edu"></label>
        <label>Password <input type="password" value="hunter2-secret"></label>
        <label>Card number <input autocomplete="cc-number" value="4242424242424242"></label>
        <label>Code <input autocomplete="one-time-code" value="918273"></label>
        <textarea>my private notes</textarea>
        <select name="year"><option>Freshman</option></select>
        <div data-private>Account 4242 4242 4242 4242 balance $52,000</div>
        <p>Your code is 556677. Card on file 4242 4242 4242 4242.</p>
        <input type="submit" value="Pay">
      </form>`);
    const s = buildPageSummary(doc, loc, testSummaryDeps());
    const blob = JSON.stringify(s);
    for (const secret of ['hunter2', '4242424242424242', '4242 4242', '918273', '556677', 'student@example.edu', 'private notes', '52,000']) {
      expect(blob).not.toContain(secret);
    }
    const sensitive = s.controls.filter((c) => ['textbox'].includes(c.role) && c.label === '');
    expect(sensitive.length).toBeGreaterThanOrEqual(2); // password + card + code keep no label either
    expect(s.controls.find((c) => c.label === 'Pay')?.role).toBe('button'); // submit caption is not user data
  });

  it('skips hidden elements and closed dialogs, reports open ones', () => {
    const doc = page(`
      <p>Visible text</p>
      <p style="display:none">Hidden by style</p>
      <p data-test-hidden>Hidden by layout</p>
      <div aria-hidden="true">Hidden by aria</div>
      <dialog>Closed dialog text</dialog>
      <div role="dialog">Confirm submission? <button>Yes</button></div>
      <dialog open>Time is almost up</dialog>`);
    const s = buildPageSummary(doc, loc, testSummaryDeps());
    expect(s.visibleText).toContain('Visible text');
    expect(s.visibleText).not.toMatch(/Hidden by|Closed dialog/);
    expect(s.openDialogs).toEqual(['Confirm submission? Yes', 'Time is almost up']);
  });

  it('puts on-screen text first and caps it at 2,500 characters', () => {
    const filler = 'lorem ipsum dolor sit amet '.repeat(40); // ~1,080 chars each
    const doc = page(`
      <p data-top="3000">FAR-A ${filler}</p>
      <p data-top="3500">FAR-B ${filler}</p>
      <p data-top="4000">FAR-C ${filler}</p>
      <p data-top="4500">FAR-D ${filler}</p>
      <p data-top="100">NEAR visible first</p>`);
    const s = buildPageSummary(doc, loc, testSummaryDeps());
    expect(s.visibleText.length).toBeLessThanOrEqual(2500);
    expect(s.visibleText.startsWith('NEAR visible first')).toBe(true);
    expect(s.visibleText).toContain('FAR-A');
    expect(s.visibleText).not.toContain('FAR-D');
  });

  it('caps controls at 120 with unique stable ids, and ids survive a rebuild', () => {
    const html = Array.from({ length: 150 }, (_, i) => `<button>Item ${i}</button>`).join('') + '<button id="same">a</button><button id="same">b</button>';
    const doc = page(html);
    const a = buildPageSummary(doc, loc, testSummaryDeps());
    const b = buildPageSummary(doc, loc, testSummaryDeps());
    expect(a.controls).toHaveLength(120);
    expect(new Set(a.controls.map((c) => c.id)).size).toBe(120);
    expect(a.controls.map((c) => c.id)).toEqual(b.controls.map((c) => c.id));
    const doc2 = page('<button id="same">a</button><button id="same">b</button>');
    expect(buildPageSummary(doc2, loc, testSummaryDeps()).controls.map((c) => c.id)).toEqual(['same', 'same~2']);
  });

  it('lists visible error messages without duplicating wrappers', () => {
    const doc = page(`
      <div class="errors"><span class="error">Required field</span><span class="error">Too short</span></div>
      <div class="error" data-test-hidden>Hidden error</div>
      <div role="alert">Wrong answer</div>`);
    expect(buildPageSummary(doc, loc, testSummaryDeps()).errorMessages).toEqual(['Required field', 'Too short', 'Wrong answer']);
  });

  it('has no problemId when the page marks none', () => {
    const s = buildPageSummary(page('<h1>Wikipedia</h1><p>Text</p>'), loc, testSummaryDeps());
    expect(s.problemId).toBeUndefined();
    expect(s.problemRegion).toBeUndefined();
  });

  it('measures text similarity for the "meaningful change" test', () => {
    expect(textSimilarity('a b c', 'a b c')).toBe(1);
    expect(textSimilarity('solve for x now', 'solve for x today')).toBeCloseTo(0.6, 1);
    expect(textSimilarity('', '')).toBe(1);
  });
});
