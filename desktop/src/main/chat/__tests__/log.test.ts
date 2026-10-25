import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type Database from 'better-sqlite3';
import { openDatabase } from '../../db/index.js';
import { ChatLog, isTransient, MAX_MESSAGES } from '../log.js';

let db: Database.Database;
let log: ChatLog;
let clock = 1000;

beforeEach(() => {
  db = openDatabase(':memory:');
  clock = 1000;
  log = new ChatLog(() => db, () => clock++);
});
afterEach(() => {
  db.close();
});

describe('ChatLog', () => {
  it('keeps the conversation in order, with labels and citations', () => {
    log.add({ role: 'user', text: 'What is underfitting?' });
    log.add({ role: 'wolfie', text: 'Too simple a model...', label: 'From your session', citations: [{ n: 1, kind: 'paper', title: 'P', locator: '§2', url: null }] });
    const list = log.list();
    expect(list.map((m) => [m.role, m.text])).toEqual([
      ['user', 'What is underfitting?'],
      ['wolfie', 'Too simple a model...']
    ]);
    expect(list[1]).toMatchObject({ label: 'From your session', citations: [{ title: 'P' }] });
  });

  it('keeps suggested links and tells the model about them in the recent turns', () => {
    const resources = [{ kind: 'video' as const, title: 'Factor Analysis Explained', url: 'https://www.youtube.com/watch?v=lJ0cXPoEozg', why: 'x', detail: null, checked: true }];
    log.add({ role: 'wolfie', text: 'Learn factor analysis first.', resources });
    expect(log.list()[0].resources).toEqual(resources);
    expect(log.recentTurns()[0].content).toBe(
      'Learn factor analysis first.\n(Suggested: 1. Factor Analysis Explained <https://www.youtube.com/watch?v=lJ0cXPoEozg>)'
    );
  });

  it('survives a new ChatLog on the same database (closing the chat, restarting)', () => {
    log.add({ role: 'user', text: 'hello' });
    expect(new ChatLog(() => db).list().map((m) => m.text)).toEqual(['hello']);
  });

  it('records help steps: only the newest step has active buttons; answering records the label', () => {
    const buttons = [{ label: 'Another hint', action: 'another_hint' }];
    log.add({ role: 'wolfie', text: 'Step 1', nudgeId: 'n1', buttons });
    log.add({ role: 'wolfie', text: 'Step 2', nudgeId: 'n2', buttons });
    expect(log.list().map((m) => m.answered ?? false)).toEqual([true, false]);
    expect(log.buttonLabel('n2', 'another_hint')).toBe('Another hint');
    expect(log.markAnswered('n2')?.answered).toBe(true);
    expect(log.markAnswered('unknown')).toBeNull();
  });

  it('gives the recent turns to the model, oldest first', () => {
    for (let i = 1; i <= 8; i++) log.add({ role: i % 2 ? 'user' : 'wolfie', text: `m${i}` });
    expect(log.recentTurns(4)).toEqual([
      { role: 'user', content: 'm5' },
      { role: 'assistant', content: 'm6' },
      { role: 'user', content: 'm7' },
      { role: 'assistant', content: 'm8' }
    ]);
  });

  it(`keeps only the newest ${MAX_MESSAGES} messages, and clear() empties it`, () => {
    for (let i = 0; i < MAX_MESSAGES + 5; i++) log.add({ role: 'user', text: `m${i}` });
    const list = log.list();
    expect(list).toHaveLength(MAX_MESSAGES);
    expect(list[0].text).toBe('m5');
    log.clear();
    expect(log.list()).toEqual([]);
  });

  it('skips the transient "Let me take a look..." message', () => {
    expect(isTransient('Let me take a look...')).toBe(true);
    expect(isTransient('Here is a hint')).toBe(false);
  });
});
