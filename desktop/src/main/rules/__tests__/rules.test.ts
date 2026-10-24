import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { EventEmitter } from 'events';
import type Database from 'better-sqlite3';
import { SettingsDefaults, type Nudge, type NudgeInput, type NudgeResponse } from '@wolfie/shared';
import { openDatabase, setDatabaseForTesting } from '../../db/index.js';
import { Monitor } from '../../monitor/monitor.js';
import type { WindowInfo, WindowSource } from '../../monitor/window-source.js';
import { initNudgeQueue, resetNudgeQueueForTesting } from '../../nudge/index.js';
import { getActiveSession, isPaused, sessionEvents, setActiveSession, setPaused, startSession, stopSession } from '../../session/index.js';
import { TypedEmitter } from '../../typed-emitter.js';
import { RulesEngine, type RulesEngineDeps } from '../engine.js';
import { domainMatches, matchForeground, wordMatches, type ForegroundLike, type RuleLists } from '../matcher.js';
import { MESSAGE_POOLS, parseRuleAction, pickMessage, RULE_ACTIONS, ruleButtons } from '../messages.js';

const lists: RuleLists = {
  aiTools: SettingsDefaults['monitored.ai_tools'],
  distractions: SettingsDefaults['monitored.distractions']
};
const fg = (over: Partial<ForegroundLike> = {}): ForegroundLike => ({
  appName: 'Google Chrome',
  windowTitle: null,
  domain: null,
  isBrowser: true,
  ...over
});

describe('matcher', () => {
  it('matches by domain suffix, including subdomains and www', () => {
    expect(matchForeground(fg({ domain: 'youtube.com' }), lists)).toMatchObject({ kind: 'distraction', rule: { name: 'YouTube' }, via: 'domain' });
    expect(matchForeground(fg({ domain: 'www.youtube.com' }), lists)?.rule.name).toBe('YouTube');
    expect(matchForeground(fg({ domain: 'm.youtube.com' }), lists)?.rule.name).toBe('YouTube');
    expect(matchForeground(fg({ domain: 'chatgpt.com' }), lists)).toMatchObject({ kind: 'ai_tool', rule: { name: 'ChatGPT' } });
    expect(matchForeground(fg({ domain: 'notyoutube.com' }), lists)).toBeNull();
    expect(matchForeground(fg({ domain: 'youtube.com.evil.io' }), lists)).toBeNull();
    expect(matchForeground(fg({ domain: 'wikipedia.org' }), lists)).toBeNull();
  });

  it('when the domain is known, the title is not consulted', () => {
    expect(matchForeground(fg({ domain: 'wikipedia.org', windowTitle: 'YouTube - history of video' }), lists)).toBeNull();
  });

  it('falls back to app name, and to the title for browsers only', () => {
    expect(matchForeground(fg({ appName: 'Steam', isBrowser: false }), lists)?.rule.name).toBe('Games');
    expect(matchForeground(fg({ appName: 'Claude', isBrowser: false }), lists)).toMatchObject({ kind: 'ai_tool', via: 'app' });
    expect(matchForeground(fg({ windowTitle: 'Lo-fi beats - YouTube - Google Chrome' }), lists)).toMatchObject({ via: 'title', rule: { name: 'YouTube' } });
    expect(matchForeground(fg({ appName: 'Code', isBrowser: false, windowTitle: 'reddit notes.md' }), lists)).toBeNull();
  });

  it('matches whole words only and ignores disabled rules', () => {
    expect(wordMatches('Steamboat Willie', 'Steam')).toBe(false);
    expect(wordMatches('my STEAM library', 'Steam')).toBe(true);
    expect(wordMatches('C++ notes', 'C++')).toBe(true);
    const off = { aiTools: [], distractions: lists.distractions.map((r) => ({ ...r, enabled: false })) };
    expect(matchForeground(fg({ domain: 'youtube.com' }), off)).toBeNull();
  });

  it('ignores path entries in domain matching (github.com/copilot would flag all of GitHub)', () => {
    expect(domainMatches('github.com', 'github.com/copilot')).toBe(false);
    expect(matchForeground(fg({ domain: 'github.com' }), lists)).toBeNull();
    expect(matchForeground(fg({ appName: 'Copilot', isBrowser: false }), lists)?.rule.name).toBe('Copilot');
  });

  it('gives a stable key per rule', () => {
    expect(matchForeground(fg({ domain: 'youtu.be' }), lists)?.key).toBe('distraction:youtube');
  });
});

describe('messages', () => {
  it('varies the message and substitutes the rule name', () => {
    const seen = new Set<string>();
    let last: number | null = null;
    for (const r of [0, 0, 0.3, 0.6, 0.99]) {
      const m = pickMessage('distraction', 'YouTube', () => r, last);
      expect(m.index).not.toBe(last);
      expect(m.text).toContain('YouTube');
      expect(m.text).not.toContain('{name}');
      seen.add(m.text);
      last = m.index;
    }
    expect(seen.size).toBeGreaterThan(2);
    expect(MESSAGE_POOLS.ai_tool.length).toBeGreaterThanOrEqual(3);
  });

  it('offers the three spec buttons', () => {
    expect(ruleButtons().map((b) => [b.label, b.action])).toEqual([
      ['Taking a break', 'taking_break'],
      ['I need this for the task', 'need_for_task'],
      ['Ignore for this session', 'ignore_session']
    ]);
  });

  it('parses button actions and spoken phrasings', () => {
    for (const a of ['taking_break', 'Taking a break', 'break']) expect(parseRuleAction(a)).toBe('break');
    for (const a of ['need_for_task', 'I need this', 'need this for the task']) expect(parseRuleAction(a)).toBe('need');
    for (const a of ['ignore_session', 'ignore', 'Ignore for this session']) expect(parseRuleAction(a)).toBe('ignore');
    expect(parseRuleAction('dismissed')).toBeNull();
    expect(parseRuleAction('timeout')).toBeNull();
  });
});

// ---- engine with fakes ---------------------------------------------------------------------

describe('RulesEngine', () => {
  let monitorEvents: TypedEmitter<{ foreground: [ForegroundLike] }>;
  let sessionEv: TypedEmitter<{ change: [unknown] }>;
  let nudgeEv: EventEmitter;
  let session: { id: string } | null;
  let paused: boolean;
  let clock: number;
  let pushed: NudgeInput[];
  let refuse: boolean;
  let nextId: number;
  let logged: [string, Record<string, unknown>][];
  let engine: RulesEngine;

  const arrive = (over: Partial<ForegroundLike>) => monitorEvents.emit('foreground', fg(over));
  const respond = (id: string, action: string, via: NudgeResponse['via'] = 'button') => nudgeEv.emit('response', { id, action, via });

  beforeEach(() => {
    monitorEvents = new TypedEmitter();
    sessionEv = new TypedEmitter();
    nudgeEv = new EventEmitter();
    session = { id: 's1' };
    paused = false;
    clock = 1_000_000;
    pushed = [];
    nextId = 1;
    refuse = false;
    logged = [];
    const deps: RulesEngineDeps = {
      monitorEvents,
      sessionEvents: sessionEv,
      nudgeEvents: nudgeEv,
      getSession: () => session,
      isPaused: () => paused,
      getLists: () => lists,
      getCooldownMinutes: () => 10,
      push: (n) => {
        pushed.push(n);
        return refuse ? null : `n${nextId++}`;
      },
      logEvent: (type, payload) => logged.push([type, payload]),
      now: () => clock,
      random: () => 0.5
    };
    engine = new RulesEngine(deps);
    engine.start();
  });

  it('warns when a listed domain comes to the front, with the three buttons', () => {
    arrive({ domain: 'youtube.com' });
    expect(pushed).toHaveLength(1);
    expect(pushed[0]).toMatchObject({ kind: 'distraction' });
    expect(pushed[0].text).toContain('YouTube');
    expect(pushed[0].spokenText).toBe(pushed[0].text);
    expect(pushed[0].buttons?.map((b) => b.action)).toEqual(Object.values(RULE_ACTIONS));
  });

  it('uses the ai_tool kind for AI tools', () => {
    arrive({ domain: 'claude.ai' });
    expect(pushed[0]).toMatchObject({ kind: 'ai_tool' });
  });

  it('does not repeat while the user stays on the same rule (title or idle changes)', () => {
    arrive({ domain: 'youtube.com', windowTitle: 'a' });
    arrive({ domain: 'youtube.com', windowTitle: 'b' });
    expect(pushed).toHaveLength(1);
  });

  it('applies the per-rule cooldown, then warns again on a later arrival', () => {
    arrive({ domain: 'youtube.com' });
    arrive({ domain: 'wikipedia.org' });
    clock += 5 * 60_000;
    arrive({ domain: 'youtube.com' }); // back after 5 min: inside the 10 min cooldown
    expect(pushed).toHaveLength(1);
    arrive({ domain: 'wikipedia.org' });
    clock += 6 * 60_000;
    arrive({ domain: 'youtube.com' }); // 11 min since the nudge
    expect(pushed).toHaveLength(2);
  });

  it('cooldowns are per rule', () => {
    arrive({ domain: 'youtube.com' });
    arrive({ domain: 'netflix.com' });
    arrive({ domain: 'chatgpt.com' });
    expect(pushed).toHaveLength(3);
  });

  it('"Ignore for this session" suppresses that rule until the session changes', () => {
    arrive({ domain: 'youtube.com' });
    respond('n1', RULE_ACTIONS.ignore);
    expect(engine.isIgnored('distraction:youtube')).toBe(true);
    arrive({ domain: 'wikipedia.org' });
    clock += 60 * 60_000;
    arrive({ domain: 'youtube.com' });
    expect(pushed).toHaveLength(1);
    arrive({ domain: 'netflix.com' }); // other rules still work
    expect(pushed).toHaveLength(2);

    session = { id: 's2' };
    sessionEv.emit('change', session);
    arrive({ domain: 'youtube.com' });
    expect(pushed).toHaveLength(3);
  });

  it('"I need this" quiets the rule for three cooldowns; "Taking a break" does not', () => {
    arrive({ domain: 'chatgpt.com' });
    respond('n1', 'I need this', 'voice');
    arrive({ domain: 'wikipedia.org' });
    clock += 11 * 60_000;
    arrive({ domain: 'chatgpt.com' });
    expect(pushed).toHaveLength(1);
    arrive({ domain: 'wikipedia.org' });
    clock += 25 * 60_000;
    arrive({ domain: 'chatgpt.com' });
    expect(pushed).toHaveLength(2);

    arrive({ domain: 'youtube.com' });
    respond('n3', RULE_ACTIONS.break);
    arrive({ domain: 'wikipedia.org' });
    clock += 11 * 60_000;
    arrive({ domain: 'youtube.com' });
    expect(pushed).toHaveLength(4);
  });

  it('logs rule responses, and ignores responses to other nudges', () => {
    arrive({ domain: 'youtube.com' });
    respond('someone-else', RULE_ACTIONS.ignore);
    expect(logged).toEqual([]);
    respond('n1', RULE_ACTIONS.break, 'voice');
    expect(logged).toEqual([['rule.response', { rule: 'YouTube', kind: 'distraction', answer: 'break', via: 'voice' }]]);
  });

  it('fires nothing outside a session or while paused', () => {
    session = null;
    arrive({ domain: 'youtube.com' });
    session = { id: 's1' };
    paused = true;
    arrive({ domain: 'netflix.com' });
    expect(pushed).toHaveLength(0);
  });

  it('retries on the next arrival if the queue dropped the nudge', () => {
    refuse = true;
    arrive({ domain: 'youtube.com' });
    arrive({ domain: 'wikipedia.org' });
    refuse = false;
    arrive({ domain: 'youtube.com' }); // no cooldown was consumed by the dropped attempt
    expect(pushed).toHaveLength(2);
    expect(pushed.every((n) => n.kind === 'distraction')).toBe(true);
  });

  it('stop() detaches listeners', () => {
    engine.stop();
    arrive({ domain: 'youtube.com' });
    expect(pushed).toHaveLength(0);
  });
});

// ---- simulated stream -> real NudgeQueue -> DB -------------------------------------------------

describe('rules end to end (monitor stream, NudgeQueue, database)', () => {
  let db: Database.Database;
  let front: WindowInfo;
  let domain: string | null;
  let shown: Nudge[];
  let engine: RulesEngine;
  let monitor: Monitor;

  beforeEach(() => {
    db = openDatabase(':memory:');
    setDatabaseForTesting(db);
    front = { appName: 'Xcode', windowTitle: 'main.swift' };
    domain = null;
    shown = [];
    const source: WindowSource = { getActiveWindow: async () => front };
    monitor = new Monitor({
      source,
      db: () => db,
      now: Date.now,
      getSession: getActiveSession,
      isPaused,
      getIdleSeconds: () => 0,
      getDomain: () => domain,
      settings: { captureTitles: () => true, idleTimeoutSeconds: () => 60, autoStartApp: () => null },
      startSession: () => undefined
    });
    const queue = initNudgeQueue();
    queue.on('show', (n: Nudge) => shown.push(n));
    engine = new RulesEngine({
      monitorEvents: monitor.events,
      sessionEvents,
      nudgeEvents: queue,
      getSession: getActiveSession,
      isPaused,
      getLists: () => lists,
      getCooldownMinutes: () => 10,
      push: (n) => queue.push(n),
      logEvent: (type, payload) => db.prepare("INSERT INTO events (ts, device, type, payload_json) VALUES (?, 'desktop', ?, ?)").run(Date.now(), type, JSON.stringify(payload)),
      now: Date.now,
      random: Math.random
    });
    engine.start();
  });

  afterEach(() => {
    engine.stop();
    resetNudgeQueueForTesting();
    setPaused(false);
    stopSession();
    setActiveSession(null);
    setDatabaseForTesting(null);
    db.close();
  });

  it('nothing fires outside a session', async () => {
    front = { appName: 'Google Chrome', windowTitle: 'YouTube' };
    domain = 'youtube.com';
    await monitor.tick();
    expect(shown).toEqual([]);
  });

  it('a session on a work app, then YouTube, produces a logged nudge; its response is logged', async () => {
    const session = startSession();
    await monitor.tick(); // Xcode
    expect(shown).toEqual([]);

    front = { appName: 'Google Chrome', windowTitle: 'Lo-fi beats' };
    domain = 'youtube.com';
    await monitor.tick();
    expect(shown).toHaveLength(1);
    expect(shown[0]).toMatchObject({ kind: 'distraction', level: 1 });

    const row = db.prepare('SELECT uid, session_id, kind, user_response FROM nudges').get() as Record<string, unknown>;
    expect(row).toEqual({ uid: shown[0].id, session_id: session.id, kind: 'distraction', user_response: null });

    initNudgeQueue().respond({ id: shown[0].id!, action: RULE_ACTIONS.ignore, via: 'button' });
    expect(db.prepare('SELECT user_response FROM nudges WHERE uid = ?').get(shown[0].id)).toEqual({ user_response: 'ignore_session' });
    expect(db.prepare("SELECT COUNT(*) AS n FROM events WHERE type = 'nudge.answered'").get()).toEqual({ n: 1 });
    expect(db.prepare("SELECT payload_json FROM events WHERE type = 'rule.response'").get()).toEqual({
      payload_json: expect.stringContaining('"answer":"ignore"')
    });
    expect(engine.isIgnored('distraction:youtube')).toBe(true);
  });

  it('falls back to the window title when the extension is not connected', async () => {
    startSession();
    front = { appName: 'Google Chrome', windowTitle: 'Funny cats - YouTube' };
    await monitor.tick();
    expect(shown).toHaveLength(1);
  });
});
