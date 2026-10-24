import { mkdtempSync, readdirSync, existsSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type Database from 'better-sqlite3';
import {
  HINT_LEVEL_KEYS,
  HintResponseSchema,
  SettingsDefaults,
  type HintContext,
  type PageSummary,
  type SettingsKey,
  type SettingsValues
} from '@wolfie/shared';
import { openDatabase } from '../../db/index.js';
import { LLMClient } from '../../llm/client.js';
import { MockLLMProvider } from '../../llm/mock-provider.js';
import { LLMError, type LLMProvider, type LlmRequest } from '../../llm/provider.js';
import { HintService, type HintServiceDeps } from '../service.js';
import { limitWords } from '../limits.js';

let db: Database.Database;
let dir: string;
let settings: Partial<SettingsValues>;
let active: { id: string; assessmentMode: boolean } | null;
let events: Array<{ type: string; payload: Record<string, unknown> }>;

beforeEach(() => {
  db = openDatabase(':memory:');
  dir = mkdtempSync(join(tmpdir(), 'wolfie-hints-'));
  settings = {};
  active = null;
  events = [];
});
afterEach(() => {
  db.close();
  rmSync(dir, { recursive: true, force: true });
});

function service(provider: LLMProvider, extra: Partial<HintServiceDeps> = {}) {
  const client = new LLMClient({ provider, timeoutMs: 200, retryDelayMs: 1, log: () => {} });
  const deps: HintServiceDeps = {
    llm: () => client,
    db: () => db,
    now: () => 1_700_000_000_000,
    getSetting: <K extends SettingsKey>(key: K) => (settings[key] ?? SettingsDefaults[key]) as SettingsValues[K],
    activeSession: () => active,
    imageDir: () => join(dir, 'images'),
    log: (type, payload) => void events.push({ type, payload }),
    console: () => {},
    ...extra
  };
  return new HintService(deps);
}

const page = (problemId: string, extra: Partial<PageSummary> = {}): PageSummary => ({
  url: 'http://localhost:5174/algebra.html',
  domain: 'localhost',
  title: 'Algebra practice',
  headings: ['Solve for x'],
  visibleText: 'Solve 2x + 5 = 13. SECRET-PAGE-TEXT',
  controls: [{ id: 'c1', role: 'button', label: 'Check', state: 'enabled' }],
  errorMessages: [],
  openDialogs: [],
  problemId,
  timestamp: 1,
  ...extra
});

const ctx = (extra: Partial<HintContext> = {}): HintContext => ({
  sessionId: 's1',
  device: 'desktop',
  trigger: 'auto',
  ...extra
});

function insertSession(id = 's1', assessment = 0) {
  db.prepare("INSERT INTO sessions (id, device, started_at, assessment_mode) VALUES (?, 'desktop', 1, ?)").run(id, assessment);
}

/** Wraps the mock and records every request. */
function spyMock() {
  const requests: LlmRequest[] = [];
  const mock = new MockLLMProvider();
  const provider: LLMProvider = {
    name: 'mock',
    countsTowardCap: false,
    generateJson: (req) => {
      requests.push(req);
      return mock.generateJson(req);
    }
  };
  return { provider, requests };
}

const failing = (): { provider: LLMProvider; calls: () => number } => {
  let n = 0;
  return {
    provider: {
      name: 'down',
      countsTowardCap: false,
      async generateJson() {
        n++;
        throw new LLMError('offline', 'NETWORK', 'down', true);
      }
    },
    calls: () => n
  };
};

describe('requestHints with the mock provider', () => {
  for (const id of ['demo-algebra-problem', 'demo-disabled-button', 'demo-code-error']) {
    it(`returns five distinct levels for ${id}`, async () => {
      const res = await service(spyMock().provider).requestHints(ctx({ pageSummary: page(id) }), 'page', false);
      expect(() => HintResponseSchema.parse(res)).not.toThrow();
      const texts = HINT_LEVEL_KEYS.map((k) => res.hint_levels[k]);
      expect(new Set(texts).size).toBe(5);
      expect(res.offline).toBe(false);
    });
  }

  it('keys on context.problemId for sources without a page (web app canvas)', async () => {
    const res = await service(spyMock().provider).requestHints(ctx({ problemId: 'demo-code-error', device: 'webapp' }), 'handwriting', false);
    expect(res.what_i_see).toMatch(/test failure/);
  });

  it('sends page text to the model but never logs it', async () => {
    const { provider, requests } = spyMock();
    await service(provider).requestHints(ctx({ pageSummary: page('demo-algebra-problem') }), 'page', false);
    expect(requests[0].messages[0].content).toContain('SECRET-PAGE-TEXT');
    expect(requests[0].system).toMatch(/nudge/);
    expect(JSON.stringify(events)).not.toContain('SECRET-PAGE-TEXT');
  });
});

describe('assessment mode', () => {
  it('adds the assessment rules to the prompt only when assessment is on', async () => {
    const { provider, requests } = spyMock();
    const svc = service(provider);
    await svc.requestHints(ctx({ pageSummary: page('demo-algebra-problem') }), 'page', false);
    await svc.requestHints(ctx({ pageSummary: page('demo-algebra-problem') }), 'page', true);
    expect(requests[0].system).not.toMatch(/ASSESSMENT MODE IS ON/);
    expect(requests[1].system).toMatch(/ASSESSMENT MODE IS ON/);
    expect(requests[1].system).toMatch(/never state the final answer/);
  });

  it('is on when the active session is graded, the stored session is, or the domain is listed', async () => {
    const { provider, requests } = spyMock();
    const svc = service(provider);
    const c = ctx({ pageSummary: page('demo-algebra-problem') });

    active = { id: 's1', assessmentMode: true };
    await svc.requestHints(c, 'page', false);
    active = null;

    insertSession('s1', 1);
    await svc.requestHints(c, 'page', false);
    db.prepare('UPDATE sessions SET assessment_mode = 0').run();

    settings['assessment.domains'] = ['example.edu'];
    await svc.requestHints({ ...c, pageSummary: page('demo-algebra-problem', { domain: 'quiz.example.edu' }) }, 'page', false);
    await svc.requestHints({ ...c, pageSummary: page('demo-algebra-problem', { domain: 'notexample.edu' }) }, 'page', false);

    expect(requests.map((r) => /ASSESSMENT MODE IS ON/.test(r.system))).toEqual([true, true, true, false]);
  });

  it('the mock ladder in assessment mode ends with a next step, not the worked answer', async () => {
    const res = await service(spyMock().provider).requestHints(ctx({ pageSummary: page('demo-algebra-problem') }), 'page', true);
    expect(res.hint_levels.direct_step).not.toMatch(/2x = 8/);
  });
});

describe('offline fallback', () => {
  it('retries once, then returns the labeled offline ladder', async () => {
    const f = failing();
    const res = await service(f.provider).requestHints(ctx({ pageSummary: page('p', { errorMessages: ['Incorrect answer'] }) }), 'page', false);
    expect(f.calls()).toBe(2);
    expect(res.offline).toBe(true);
    expect(res.what_i_see).toMatch(/offline hints/);
    expect(new Set(HINT_LEVEL_KEYS.map((k) => res.hint_levels[k])).size).toBe(5);
    expect(res.hint_levels.hint).toContain('Incorrect answer');
    expect(() => HintResponseSchema.parse(res)).not.toThrow();
  });

  it('also falls back on invalid model output and on a reached daily cap', async () => {
    const bad: LLMProvider = { name: 'bad', countsTowardCap: false, generateJson: async () => ({ nope: true }) };
    expect((await service(bad).requestHints(ctx(), 'screen', false)).offline).toBe(true);

    const capped = new LLMClient({
      provider: { name: 'g', countsTowardCap: true, generateJson: async () => ({}) },
      dailyCap: () => 0,
      log: () => {}
    });
    const res = await service(spyMock().provider, { llm: () => capped }).requestHints(ctx(), 'screen', false);
    expect(res.offline).toBe(true);
  });
});

describe('word limits', () => {
  const words = (n: number) => Array.from({ length: n }, (_, i) => `Word${i}`).join(' ');

  it('trims long levels to 40 / 90 words, on a sentence boundary when possible', async () => {
    const long = `${words(30)}. ${words(30)}.`;
    const provider: LLMProvider = {
      name: 'long',
      countsTowardCap: false,
      generateJson: async () => ({
        what_i_see: 'ok',
        hint_levels: { nudge: long, hint: words(200), explanation: words(200), analogous_example: `${words(60)}. ${words(60)}.`, direct_step: words(95) }
      })
    };
    const res = await service(provider).requestHints(ctx(), 'screen', false);
    const count = (t: string) => t.split(/\s+/).length;
    expect(res.hint_levels.nudge).toBe(`${words(30)}.`);
    expect(count(res.hint_levels.hint)).toBeLessThanOrEqual(41);
    expect(count(res.hint_levels.explanation)).toBeLessThanOrEqual(91);
    expect(res.hint_levels.analogous_example).toBe(`${words(60)}.`);
    expect(count(res.hint_levels.direct_step)).toBeLessThanOrEqual(91);
    expect(() => HintResponseSchema.parse(res)).not.toThrow();
  });

  it('leaves short text alone', () => {
    expect(limitWords('Short one.', 40)).toBe('Short one.');
  });
});

describe('logging', () => {
  it('writes hint_requests only when the session exists, and always writes an event', async () => {
    const svc = service(spyMock().provider);
    await svc.requestHints(ctx({ pageSummary: page('demo-algebra-problem') }), 'page', false);
    expect(db.prepare('SELECT COUNT(*) AS n FROM hint_requests').get()).toEqual({ n: 0 });
    expect(events.map((e) => e.type)).toEqual(['hint.requested']);

    insertSession();
    await svc.requestHints(ctx({ pageSummary: page('demo-algebra-problem') }), 'page', false);
    const row = db.prepare('SELECT session_id, device, source, trigger, hint_level, hint_text, image_path FROM hint_requests').get();
    expect(row).toMatchObject({ session_id: 's1', device: 'desktop', source: 'page', trigger: 'auto', hint_level: 1, image_path: null });
    expect(events.filter((e) => e.type === 'hint.requested')).toHaveLength(2);
  });

  it('logLevelShown records later ladder levels', async () => {
    insertSession();
    const svc = service(spyMock().provider);
    svc.logLevelShown({ context: ctx(), source: 'page', level: 3, text: 'Explain it' });
    expect(db.prepare('SELECT hint_level, hint_text FROM hint_requests').get()).toEqual({ hint_level: 3, hint_text: 'Explain it' });
    expect(events[0]).toMatchObject({ type: 'hint.level_shown', payload: { level: 3 } });
  });
});

describe('images', () => {
  const png = 'data:image/png;base64,iVBORw0KGgo=';

  it('sends the image as inlineData material and keeps no file when storage is off', async () => {
    insertSession();
    const { provider, requests } = spyMock();
    await service(provider).requestHints(ctx({ imageDataUrl: png }), 'screen', false);
    expect(requests[0].images).toEqual([{ mimeType: 'image/png', data: 'iVBORw0KGgo=' }]);
    expect(existsSync(join(dir, 'images'))).toBe(false);
    expect(db.prepare('SELECT image_path FROM hint_requests').get()).toEqual({ image_path: null });
  });

  it('keeps the image and records its path only when storage is on', async () => {
    insertSession();
    settings['image.storage_enabled'] = true;
    await service(spyMock().provider).requestHints(ctx({ imageDataUrl: png }), 'screen', false);
    const files = readdirSync(join(dir, 'images'));
    expect(files).toHaveLength(1);
    const row = db.prepare('SELECT image_path FROM hint_requests').get() as { image_path: string };
    expect(row.image_path).toBe(join(dir, 'images', files[0]));
  });

  it('keeps no image after an offline fallback either, and ignores a malformed data URL', async () => {
    const f = failing();
    await service(f.provider).requestHints(ctx({ imageDataUrl: png }), 'screen', false);
    expect(existsSync(join(dir, 'images'))).toBe(false);

    const { provider, requests } = spyMock();
    await service(provider).requestHints(ctx({ imageDataUrl: 'not-a-data-url' }), 'screen', false);
    expect(requests[0].images).toBeUndefined();
  });
});

describe('requestFollowup', () => {
  const followup = (over = {}) => ({
    requestId: 'r1',
    utterance: "I don't get step 2",
    currentLevel: 2,
    conversationHistory: [
      { role: 'assistant' as const, content: 'What operation isolates x?' },
      { role: 'user' as const, content: 'subtract?' }
    ],
    ...over
  });

  it('answers at the current level or one up, and sends the conversation', async () => {
    const { provider, requests } = spyMock();
    const res = await service(provider).requestFollowup(followup(), ctx({ pageSummary: page('demo-algebra-problem') }), 'page', false);
    expect(res).toMatchObject({ requestId: 'r1', level: 3, offline: false });
    expect(res.text.length).toBeGreaterThan(0);
    const msg = requests[0].messages[0].content;
    expect(msg).toContain("I don't get step 2");
    expect(msg).toContain('Wolfie: What operation isolates x?');
    expect(msg).toContain('Current hint level: 2');
    expect(requests[0].system).toMatch(/Reply with JSON only/);
  });

  it('clamps a model that jumps levels, and never exceeds 5', async () => {
    const jumpy = (level: number): LLMProvider => ({
      name: 'j',
      countsTowardCap: false,
      generateJson: async () => ({ text: 'Try this.', level })
    });
    expect((await service(jumpy(5)).requestFollowup(followup(), ctx(), 'page', false)).level).toBe(3);
    expect((await service(jumpy(1)).requestFollowup(followup(), ctx(), 'page', false)).level).toBe(2);
    expect((await service(jumpy(5)).requestFollowup(followup({ currentLevel: 5 }), ctx(), 'page', false)).level).toBe(5);
  });

  it('falls back to an offline reply at the current level', async () => {
    const res = await service(failing().provider).requestFollowup(followup(), ctx(), 'page', false);
    expect(res).toMatchObject({ offline: true, level: 2 });
    expect(res.text).toMatch(/offline/i);
  });

  it('logs the follow-up', async () => {
    insertSession();
    await service(spyMock().provider).requestFollowup(followup(), ctx(), 'page', false);
    expect(events.map((e) => e.type)).toEqual(['hint.followup']);
    expect(db.prepare('SELECT hint_level FROM hint_requests').get()).toEqual({ hint_level: 3 });
  });
});

describe('MockLLMProvider.requestHints (direct, frozen shape)', () => {
  it('returns the demo ladder without a client, for callers that just need mock hints', async () => {
    const mock = new MockLLMProvider({ delayMs: 0 });
    const res = await mock.requestHints(ctx({ pageSummary: page('demo-code-error') }), 'page', false);
    expect(() => HintResponseSchema.parse(res)).not.toThrow();
    expect(res.what_i_see).toMatch(/test failure/);
    expect(new Set(HINT_LEVEL_KEYS.map((k) => res.hint_levels[k])).size).toBe(5);
    expect((await mock.requestHints(ctx({}), 'screen', true)).hint_levels.direct_step).toMatch(/graded work/);
  });
});
