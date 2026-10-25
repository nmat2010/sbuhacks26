import { beforeEach, describe, expect, it, vi } from 'vitest';
import { SettingsDefaults, type SettingsKey, type SettingsValues } from '@wolfie/shared';
import { SessionMemory } from '../memory.js';
import { WatchController } from '../controller.js';
import type { WatcherState } from '../watcher.js';
import { obs } from './helpers.js';

let settings: Partial<SettingsValues>;
let session: { id: string } | null;
let paused: boolean;
let memory: SessionMemory;
let watcher: { start: ReturnType<typeof vi.fn>; stop: ReturnType<typeof vi.fn>; reset: ReturnType<typeof vi.fn>; getState: () => WatcherState };
let logs: Array<[string, Record<string, unknown>]>;
let imports: string[];

type ImportResult = { ok: true; paperId: string; title: string } | { ok: false; error: string };
let clock = 42;

function make(importPaper = async (url: string): Promise<ImportResult> => (imports.push(url), { ok: true, paperId: 'p1', title: 'Imported paper' })) {
  return new WatchController({
    now: () => clock,
    getSetting: <K extends SettingsKey>(key: K) => (key in settings ? settings[key] : SettingsDefaults[key]) as SettingsValues[K],
    setSetting: (key, value) => void (settings[key] = value as never),
    getSession: () => session,
    isPaused: () => paused,
    memory,
    watcher,
    importPaper,
    log: (type, payload) => void logs.push([type, payload])
  });
}

beforeEach(() => {
  clock = 42;
  settings = {};
  session = { id: 's1' };
  paused = false;
  memory = new SessionMemory();
  watcher = { start: vi.fn(), stop: vi.fn(), reset: vi.fn(), getState: () => 'watching' };
  logs = [];
  imports = [];
});

describe('WatchController', () => {
  it('is off by default and cannot be turned on before consent', () => {
    const c = make();
    expect(c.status()).toMatchObject({ enabled: false, consented: false, state: 'off' });
    const res = c.set({ enabled: true });
    expect(res.success).toBe(false);
    expect(settings['watch.enabled']).toBeUndefined();
    expect(c.isActive()).toBe(false);
  });

  it('watches after consent + enable, only in a session and not paused', () => {
    const c = make();
    c.consent(true);
    expect(settings['watch.consented_at']).toBe(42);
    expect(c.set({ enabled: true }).success).toBe(true);
    expect(c.isActive()).toBe(true);
    expect(watcher.start).toHaveBeenCalled();
    paused = true;
    c.refresh();
    expect(c.isActive()).toBe(false);
    expect(watcher.stop).toHaveBeenCalled();
    expect(c.status().state).toBe('idle');
  });

  it('declining consent turns Watch mode off and clears memory', () => {
    const c = make();
    c.consent(true);
    c.set({ enabled: true });
    memory.record(obs(), { ts: 1, appName: 'Chrome', windowTitle: null, contentUrl: null, elapsedMs: 0 });
    c.consent(false);
    expect(settings['watch.enabled']).toBe(false);
    expect(settings['watch.consented_at']).toBeNull();
    expect(memory.isEmpty()).toBe(true);
  });

  it('ends the session memory when the session changes, logging only counts', () => {
    const c = make();
    c.consent(true);
    c.set({ enabled: true });
    memory.record(obs(), { ts: 1, appName: 'Chrome', windowTitle: 'paper', contentUrl: null, elapsedMs: 120_000 });
    session = { id: 's2' };
    c.refresh();
    expect(memory.isEmpty()).toBe(true);
    const summary = logs.find(([t]) => t === 'watch.session_summary');
    expect(summary?.[1]).toEqual({ sources: 1, papers: 1, videos: 0, minutes: 2 });
    expect(JSON.stringify(summary)).not.toContain('transformer');
  });

  it('imports each paper URL once and attaches it to memory; videos are not imported', async () => {
    settings['watch.auto_import_papers'] = true;
    const c = make();
    memory.record(obs(), { ts: 1, appName: 'Chrome', windowTitle: null, contentUrl: 'https://example.edu/a.pdf', elapsedMs: 0 });
    c.onContentUrl('https://example.edu/a.pdf');
    c.onContentUrl('https://example.edu/a.pdf');
    c.onContentUrl('https://www.youtube.com/watch?v=abcdef123');
    await new Promise((r) => setTimeout(r, 0));
    expect(imports).toEqual(['https://example.edu/a.pdf']);
    expect(memory.paperIds()).toEqual(['p1']);
  });

  it('does not import papers unless the student opted in (off by default)', async () => {
    const c = make();
    c.onContentUrl('https://arxiv.org/abs/1706.03762');
    await new Promise((r) => setTimeout(r, 0));
    expect(imports).toEqual([]);
  });

  it('validates settings patches', () => {
    const c = make();
    expect(c.set({ intervalSeconds: 2 }).success).toBe(false);
    expect(c.set({ intervalSeconds: 15, excludedApps: [' Slack ', 'Slack', ''] }).success).toBe(true);
    expect(settings['watch.interval_seconds']).toBe(15);
    expect(settings['watch.excluded_apps']).toEqual(['Slack']);
  });

  it('emits status on changes', () => {
    const c = make();
    const seen: string[] = [];
    c.events.on('status', (s) => void seen.push(s.state));
    c.consent(true);
    c.set({ enabled: true });
    expect(seen.at(-1)).toBe('watching');
  });
});

describe('WatchController: imports vs clearing (re-review)', () => {
  it('an import that finishes after "Clear memory" does not reattach the paper', async () => {
    settings['watch.auto_import_papers'] = true;
    let finish: (v: ImportResult) => void = () => {};
    const c = make(() => new Promise((r) => (finish = r)));
    c.onContentUrl('https://example.edu/a.pdf');
    c.clearMemory();
    finish({ ok: true, paperId: 'p1', title: 'Late' });
    await new Promise((r) => setTimeout(r, 0));
    memory.record(obs(), { ts: 1, appName: 'Chrome', windowTitle: null, contentUrl: 'https://example.edu/a.pdf', elapsedMs: 0 });
    expect(memory.paperIds()).toEqual([]);
  });
});

describe('WatchController status note', () => {
  it('explains each reason nothing is being looked at', () => {
    let reason: string | null = 'private_window';
    let state: WatcherState = 'skipping';
    (watcher as unknown as { getSkipReason: () => string | null }).getSkipReason = () => reason;
    watcher.getState = () => state;
    const c = make();
    c.consent(true);
    c.set({ enabled: true });
    expect(c.status().note).toContain('private window');
    reason = 'browser_access_denied';
    expect(c.status().note).toContain('Automation');
    reason = 'unsupported_browser';
    expect(c.status().note).toContain('Chrome, Brave and Edge');
    state = 'away';
    expect(c.status().note).toContain('away');
    state = 'watching';
    expect(c.status().note).toBeNull();
  });
});

describe('WatchController: paper import (second real run)', () => {
  it('a paper opened while auto-import was off is imported once it is turned on', async () => {
    const c = make();
    c.onContentUrl('https://aclanthology.org/D17-1119.pdf');
    expect(imports).toEqual([]);
    settings['watch.auto_import_papers'] = true;
    c.onContentUrl('https://aclanthology.org/D17-1119.pdf');
    await new Promise((r) => setTimeout(r, 0));
    expect(imports).toEqual(['https://aclanthology.org/D17-1119.pdf']);
  });

  it('logs a failed import with its reason (no URL) and retries it after a few minutes', async () => {
    settings['watch.auto_import_papers'] = true;
    let attempts = 0;
    const c = make(async () => (attempts++, { ok: false, error: "That link didn't return a PDF (it may need a login)." }));
    memory.record(obs(), { ts: 1, appName: 'Chrome', windowTitle: null, contentUrl: 'https://school.edu/p.pdf', elapsedMs: 0 });
    c.onContentUrl('https://school.edu/p.pdf');
    await new Promise((r) => setTimeout(r, 0));
    const failed = logs.find(([t]) => t === 'watch.paper_import_failed');
    expect(failed?.[1]).toEqual({ reason: "That link didn't return a PDF (it may need a login)." });
    expect(JSON.stringify(logs)).not.toContain('school.edu');
    expect(c.memoryView().sources[0].paperImport).toMatchObject({ status: 'failed' });
    c.onContentUrl('https://school.edu/p.pdf');
    expect(attempts).toBe(1); // not hammered
    clock += 3 * 60_000;
    c.onContentUrl('https://school.edu/p.pdf');
    await new Promise((r) => setTimeout(r, 0));
    expect(attempts).toBe(2);
  });
});

describe('WatchController: live "looking" status', () => {
  it('shows the window being looked at while watching', () => {
    (watcher as unknown as { lookingAt: () => unknown }).lookingAt = () => ({ app: 'Google Chrome', title: 'Practice: Linear equations', since: 50 });
    const c = make();
    c.consent(true);
    c.set({ enabled: true });
    expect(c.status()).toMatchObject({ looking: 'Google Chrome — Practice: Linear equations', lookingSince: 50 });
    paused = true;
    expect(c.status().looking).toBeNull();
  });
});
