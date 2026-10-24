import type { PageSummary } from '@wolfie/shared';
import { isFormControl, isSensitiveElement, PRIVATE_SELECTOR, redactText } from './redact';

// Builds the compact PageSummary (SPEC 4a): headings, ~2,500 characters of viewport-first text,
// up to 120 controls with stable ids, visible errors, open dialogs and the problem region. No raw
// DOM is ever sent. jsdom has no layout, so visibility and positions are injected (SummaryDeps).

export interface SummaryDeps {
  isVisible(el: Element): boolean;
  /** Viewport-relative vertical extent, or null if unknown. */
  getRect(el: Element): { top: number; bottom: number } | null;
  viewportHeight: number;
  now(): number;
}

export const LIMITS = { text: 2500, controls: 120, headings: 50, errors: 10, dialogs: 5, region: 300 } as const;

export const SKIP_TAGS = new Set(['SCRIPT', 'STYLE', 'NOSCRIPT', 'TEMPLATE', 'HEAD', 'TITLE', 'META', 'LINK', 'SVG', 'CANVAS', 'IFRAME', 'OBJECT']);

const CONTROL_SELECTOR = [
  'a[href]',
  'button',
  'input:not([type=hidden])',
  'select',
  'textarea',
  'summary',
  '[role=button]',
  '[role=link]',
  '[role=checkbox]',
  '[role=radio]',
  '[role=tab]',
  '[role=menuitem]',
  '[role=switch]',
  '[role=combobox]',
  '[role=textbox]',
  '[contenteditable=""]',
  '[contenteditable="true"]'
].join(',');

export const ERROR_SELECTOR = [
  '[role=alert]',
  '[aria-invalid=true] ~ .error',
  '.error',
  '.errors',
  '.error-message',
  '.invalid-feedback',
  '.field-error',
  '[data-error]',
  '.alert-danger',
  '.alert-error'
].join(',');

export const FEEDBACK_SELECTOR = [
  '[role=alert]',
  '[role=status]',
  '[aria-live]',
  '.feedback',
  '.result',
  '.results',
  '.output',
  '.console',
  '.test-result',
  '.verdict',
  ERROR_SELECTOR
].join(',');

const DIALOG_SELECTOR = 'dialog[open], [role=dialog], [role=alertdialog], [aria-modal=true]';
const REGION_SELECTORS = ['[data-problem-id]', '[data-problem]', '.problem-statement', '.question', '#problem'];

const clean = (s: string | null | undefined): string => (s ?? '').replace(/\s+/g, ' ').trim();
const cut = (s: string, n: number): string => (s.length <= n ? s : s.slice(0, n - 1).trimEnd() + '…');

export function defaultSummaryDeps(win: Window): SummaryDeps {
  return {
    now: () => Date.now(),
    viewportHeight: win.innerHeight,
    getRect(el) {
      const r = el.getBoundingClientRect();
      return { top: r.top, bottom: r.bottom };
    },
    isVisible(el) {
      const style = win.getComputedStyle(el);
      if (style.display === 'none' || style.visibility === 'hidden') return false;
      const r = el.getBoundingClientRect();
      return r.width > 0 || r.height > 0 || style.position === 'fixed';
    }
  };
}

/** Visibility including ancestors, memoized per build. */
export function makeVisible(deps: SummaryDeps) {
  const memo = new Map<Element, boolean>();
  const visible = (el: Element | null): boolean => {
    if (!el) return true;
    const known = memo.get(el);
    if (known !== undefined) return known;
    let result = !SKIP_TAGS.has(el.tagName.toUpperCase());
    if (result && (el.hasAttribute('hidden') || el.getAttribute('aria-hidden') === 'true')) result = false;
    if (result && el.tagName === 'DIALOG' && !el.hasAttribute('open')) result = false;
    if (result) result = deps.isVisible(el);
    if (result) result = visible(el.parentElement);
    memo.set(el, result);
    return result;
  };
  return visible;
}

const inPrivate = (el: Element) => el.closest(PRIVATE_SELECTOR) !== null;

function textOf(el: Element): string {
  return clean(el.textContent);
}

export function roleOf(el: Element): string {
  const explicit = el.getAttribute('role')?.split(/\s+/)[0];
  if (explicit) return explicit;
  const tag = el.tagName.toLowerCase();
  if (tag === 'a') return 'link';
  if (tag === 'button' || tag === 'summary') return 'button';
  if (tag === 'select') return (el as HTMLSelectElement).multiple ? 'listbox' : 'combobox';
  if (tag === 'textarea') return 'textbox';
  if (tag === 'input') {
    switch ((el as HTMLInputElement).type) {
      case 'button':
      case 'submit':
      case 'reset':
      case 'image':
        return 'button';
      case 'checkbox':
        return 'checkbox';
      case 'radio':
        return 'radio';
      case 'range':
        return 'slider';
      case 'number':
        return 'spinbutton';
      case 'search':
        return 'searchbox';
      default:
        return 'textbox';
    }
  }
  return 'textbox'; // contenteditable
}

/** The accessible name. Never an input's value, except the caption of a button-type input. */
function labelOf(el: Element, doc: Document): string {
  const aria = clean(el.getAttribute('aria-label'));
  if (aria) return cut(aria, 80);
  const labelledBy = el.getAttribute('aria-labelledby');
  if (labelledBy) {
    const text = clean(
      labelledBy
        .split(/\s+/)
        .map((id) => doc.getElementById(id)?.textContent ?? '')
        .join(' ')
    );
    if (text) return cut(text, 80);
  }
  const labels = (el as HTMLInputElement).labels;
  if (labels && labels.length) {
    const text = clean(labels[0].textContent);
    if (text) return cut(text, 80);
  }
  const isButtonInput = el.tagName === 'INPUT' && ['button', 'submit', 'reset'].includes((el as HTMLInputElement).type);
  if (isButtonInput) {
    const caption = clean((el as HTMLInputElement).value);
    if (caption) return cut(caption, 80);
  }
  if (!isFormControl(el)) {
    const text = textOf(el);
    if (text) return cut(text, 80);
  }
  return cut(clean(el.getAttribute('title') ?? el.getAttribute('alt') ?? el.getAttribute('placeholder')), 80);
}

function stateOf(el: Element): string {
  const parts: string[] = [];
  const disabled = (el as HTMLButtonElement).disabled === true || el.getAttribute('aria-disabled') === 'true';
  parts.push(disabled ? 'disabled' : 'enabled');
  if ((el as HTMLInputElement).checked === true || el.getAttribute('aria-checked') === 'true') parts.push('checked');
  if (el.getAttribute('aria-selected') === 'true') parts.push('selected');
  if ((el as HTMLInputElement).readOnly === true || el.getAttribute('aria-readonly') === 'true') parts.push('readonly');
  if (el.getAttribute('aria-invalid') === 'true') parts.push('invalid');
  if (el.getAttribute('aria-expanded') === 'true') parts.push('expanded');
  return parts.join(',');
}

export function isDisabledControl(el: Element): boolean {
  return (el as HTMLButtonElement).disabled === true || el.getAttribute('aria-disabled') === 'true';
}

/** Stable across rebuilds: an explicit id/test id/name, else role + position among that role. */
function stableIds(elements: Element[]): string[] {
  const seen = new Map<string, number>();
  const perRole = new Map<string, number>();
  return elements.map((el) => {
    const role = roleOf(el);
    const explicit =
      el.id || el.getAttribute('data-testid') || el.getAttribute('data-e2e-locator') || el.getAttribute('name');
    let id: string;
    if (explicit) {
      id = explicit.slice(0, 60);
    } else {
      const n = perRole.get(role) ?? 0;
      perRole.set(role, n + 1);
      id = `${role}-${n + 1}`;
    }
    const dup = seen.get(id) ?? 0;
    seen.set(id, dup + 1);
    return dup === 0 ? id : `${id}~${dup + 1}`;
  });
}

export function findProblemRegion(doc: Document, visible: (el: Element | null) => boolean): { el: Element; problemId?: string } | null {
  for (const selector of REGION_SELECTORS) {
    for (const el of Array.from(doc.querySelectorAll(selector))) {
      if (!visible(el) || inPrivate(el)) continue;
      const problemId = el.getAttribute('data-problem-id') ?? el.closest('[data-problem-id]')?.getAttribute('data-problem-id') ?? undefined;
      return { el, problemId: problemId || undefined };
    }
  }
  return null;
}

export function collectErrors(doc: Document, visible: (el: Element | null) => boolean): string[] {
  const out: string[] = [];
  for (const el of Array.from(doc.querySelectorAll(ERROR_SELECTOR))) {
    if (!visible(el) || inPrivate(el)) continue;
    // Skip containers that merely wrap other matched elements; take the leaf messages.
    if (el.querySelector(ERROR_SELECTOR)) continue;
    const text = redactText(textOf(el));
    if (text && !out.includes(text)) out.push(cut(text, 160));
    if (out.length >= LIMITS.errors) break;
  }
  return out;
}

export function collectFeedback(doc: Document, visible: (el: Element | null) => boolean): string[] {
  const out: string[] = [];
  for (const el of Array.from(doc.querySelectorAll(FEEDBACK_SELECTOR))) {
    if (!visible(el) || inPrivate(el) || el.querySelector(FEEDBACK_SELECTOR)) continue;
    const text = redactText(textOf(el));
    if (text && !out.includes(text)) out.push(cut(text, 200));
    if (out.length >= 20) break;
  }
  return out;
}

function collectText(doc: Document, deps: SummaryDeps, visible: (el: Element | null) => boolean): string {
  const root = doc.body;
  if (!root) return '';
  const walker = doc.createTreeWalker(root, 4 /* NodeFilter.SHOW_TEXT */);
  const inView: string[] = [];
  const rest: string[] = [];
  let visited = 0;
  for (let node = walker.nextNode(); node && visited < 6000; node = walker.nextNode()) {
    visited++;
    const parent = node.parentElement;
    if (!parent || !visible(parent) || inPrivate(parent) || isFormControl(parent)) continue;
    if (parent.closest('select, option, textarea')) continue;
    const text = clean(node.textContent);
    if (!text) continue;
    const rect = deps.getRect(parent);
    const onScreen = !!rect && rect.bottom > 0 && rect.top < deps.viewportHeight;
    (onScreen ? inView : rest).push(text);
  }
  const joined = redactText(clean([...inView, ...rest].join(' ')));
  return cut(joined, LIMITS.text);
}

export function buildPageSummary(doc: Document, loc: { href: string; hostname: string }, deps: SummaryDeps): PageSummary {
  const visible = makeVisible(deps);

  let url: string;
  try {
    const u = new URL(loc.href);
    url = `${u.origin}${u.pathname}`; // query strings and fragments often hold tokens or ids
  } catch {
    url = loc.href;
  }

  const headings = Array.from(doc.querySelectorAll('h1, h2, h3'))
    .filter((h) => visible(h) && !inPrivate(h))
    .map((h) => cut(redactText(textOf(h)), 120))
    .filter(Boolean)
    .slice(0, LIMITS.headings);

  const controlEls = Array.from(doc.querySelectorAll(CONTROL_SELECTOR))
    .filter((el) => visible(el))
    .filter((el, i, all) => all.indexOf(el) === i)
    .slice(0, LIMITS.controls);
  const ids = stableIds(controlEls);
  const controls = controlEls.map((el, i) => ({
    id: ids[i],
    role: roleOf(el),
    // A sensitive field keeps only its role; its label can itself contain typed text in odd pages.
    label: isSensitiveElement(el) ? '' : redactText(labelOf(el, doc)),
    state: stateOf(el),
    type: el.tagName === 'INPUT' ? (el as HTMLInputElement).type : el.tagName.toLowerCase()
  }));

  const openDialogs = Array.from(doc.querySelectorAll(DIALOG_SELECTOR))
    .filter((d) => visible(d) && !inPrivate(d))
    .map((d) => cut(redactText(textOf(d)), 160))
    .filter(Boolean)
    .slice(0, LIMITS.dialogs);

  const region = findProblemRegion(doc, visible);

  return {
    url,
    domain: loc.hostname,
    title: cut(clean(doc.title), 200),
    headings,
    visibleText: collectText(doc, deps, visible),
    controls,
    errorMessages: collectErrors(doc, visible),
    openDialogs,
    problemRegion: region ? cut(redactText(textOf(region.el)), LIMITS.region) || undefined : undefined,
    problemId: region?.problemId,
    timestamp: deps.now()
  };
}

/** Visible-control lookup used by the click detectors. */
export function controlIdFor(doc: Document, target: Element, deps: SummaryDeps): { id: string; el: Element } | null {
  const el = target.closest(CONTROL_SELECTOR);
  if (!el) return null;
  const visible = makeVisible(deps);
  const all = Array.from(doc.querySelectorAll(CONTROL_SELECTOR)).filter((c) => visible(c));
  const ids = stableIds(all);
  const i = all.indexOf(el);
  return i >= 0 ? { id: ids[i], el } : { id: roleOf(el), el };
}

/** Used to decide whether a page changed meaningfully (see runtime). */
export function summaryDigest(s: PageSummary): string {
  return JSON.stringify([s.url, s.title, s.headings, s.errorMessages, s.openDialogs, s.problemRegion, s.problemId, s.controls.map((c) => [c.id, c.state])]);
}

const words = (text: string): Set<string> => new Set(text.toLowerCase().match(/[\p{L}\p{N}]+/gu) ?? []);

/** Jaccard similarity of the word sets of two texts, 1 = same. */
export function textSimilarity(a: string, b: string): number {
  if (a === b) return 1;
  const wa = words(a);
  const wb = words(b);
  if (wa.size === 0 && wb.size === 0) return 1;
  let both = 0;
  for (const w of wa) if (wb.has(w)) both++;
  return both / (wa.size + wb.size - both);
}
