// Hard redaction (SPEC 4a): values and text from password, payment and one-time-code fields are
// never read, and obvious card/SSN/OTP patterns are stripped from whatever text is collected.
// Everything here is DOM-only (no layout), so it works under jsdom.

const SENSITIVE_NAME =
  /pass(word|wd|code|phrase)?|pwd|\bcc[-_ ]?(num|number|exp|cvc|cvv|csc|name)?\b|card[-_ ]?(num|number|no|holder|exp|cvc|cvv)?|cvv|cvc|\bcsc\b|security[-_ ]?code|\biban\b|routing|account[-_ ]?(num|no)|\bssn\b|social[-_ ]?sec|\botp\b|one[-_ ]?time|\b2fa\b|\bmfa\b|verification[-_ ]?code|\bpin\b|secret|api[-_ ]?key|\btoken\b/i;

const FORM_CONTROL = new Set(['INPUT', 'TEXTAREA', 'SELECT']);

/** Containers a page (or a demo) can mark private. */
export const PRIVATE_SELECTOR = '[data-private], [data-wolfie-redact]';

export function isFormControl(el: Element): boolean {
  return FORM_CONTROL.has(el.tagName);
}

/** True for password / payment / one-time-code style controls, and anything marked private. */
export function isSensitiveElement(el: Element): boolean {
  if (el.closest(PRIVATE_SELECTOR)) return true;
  if (!isFormControl(el) && !el.hasAttribute('autocomplete')) return false;
  if (el.tagName === 'INPUT' && (el as HTMLInputElement).type === 'password') return true;
  const tokens = (el.getAttribute('autocomplete') ?? '').toLowerCase().split(/\s+/).filter(Boolean);
  if (tokens.some((t) => t.startsWith('cc-') || t === 'one-time-code' || t.endsWith('-password'))) return true;
  const hints = [
    el.getAttribute('name'),
    el.id,
    el.getAttribute('aria-label'),
    el.getAttribute('placeholder'),
    el.getAttribute('data-testid')
  ];
  return hints.some((h) => !!h && SENSITIVE_NAME.test(h));
}

function luhn(digits: string): boolean {
  let sum = 0;
  let double = false;
  for (let i = digits.length - 1; i >= 0; i--) {
    let d = digits.charCodeAt(i) - 48;
    if (double) {
      d *= 2;
      if (d > 9) d -= 9;
    }
    sum += d;
    double = !double;
  }
  return sum % 10 === 0;
}

/** Strips card numbers (Luhn-valid 13-19 digits), SSNs and "code is 123456" style OTPs. */
export function redactText(text: string): string {
  return text
    .replace(/\b(?:\d[ -]?){12,18}\d\b/g, (m) => {
      const digits = m.replace(/\D/g, '');
      return digits.length >= 13 && digits.length <= 19 && luhn(digits) ? '[redacted]' : m;
    })
    .replace(/\b\d{3}-\d{2}-\d{4}\b/g, '[redacted]')
    .replace(
      /\b(code|otp|passcode|verification|one[- ]time|pin)\b([^0-9\n]{0,24})\b(\d{4,8})\b/gi,
      (_m, word: string, gap: string) => `${word}${gap}[redacted]`
    );
}
