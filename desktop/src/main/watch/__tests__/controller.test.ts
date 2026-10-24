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

function make(importPaper = async (url: string) => (imports.push(url), { paperId: 'p1', title: 'Imported paper' })) {
  return new WatchController({
    now: () => 42,
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
    const c = make();
    memory.record(obs(), { ts: 1, appName: 'Chrome', windowTitle: null, contentUrl: 'https://example.edu/a.pdf', elapsedMs: 0 });
    c.onContentUrl('https://example.edu/a.pdf');
    c.onContentUrl('https://example.edu/a.pdf');
    c.onContentUrl('https://www.youtube.com/watch?v=abcdef123');
    await new Promise((r) => setTimeout(r, 0));
    expect(imports).toEqual(['https://example.edu/a.pdf']);
    expect(memory.paperIds()).toEqual(['p1']);
  });

  it('does not import papers when auto-import is off', async () => {
    settings['watch.auto_import_papers'] = false;
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
