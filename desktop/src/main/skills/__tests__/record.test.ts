import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type Database from 'better-sqlite3';
import { openDatabase } from '../../db/index.js';
import type { LlmCall } from '../../llm/client.js';
import { SkillRecordStore, skillStatus, type SkillEntry, type Verdict } from '../record.js';
import { tidySkills } from '../tidy.js';

const entry = (verdict: Verdict, ts: number): SkillEntry => ({ sessionId: `s${ts}`, ts, verdict, evidence: '' });

describe('skillStatus', () => {
  it('weak if the latest evidence says so; improving once strong after weak; strong after two', () => {
    expect(skillStatus([])).toBe('touched');
    expect(skillStatus([entry('practiced', 1)])).toBe('touched');
    expect(skillStatus([entry('strength', 1)])).toBe('strength');
    expect(skillStatus([entry('strength', 1), entry('weakness', 2)])).toBe('weakness');
    expect(skillStatus([entry('weakness', 1), entry('strength', 2)])).toBe('improving');
    expect(skillStatus([entry('weakness', 1), entry('strength', 2), entry('practiced', 3)])).toBe('improving');
    expect(skillStatus([entry('weakness', 1), entry('strength', 2), entry('strength', 3)])).toBe('strength');
  });
});

describe('SkillRecordStore', () => {
  let db: Database.Database;
  let store: SkillRecordStore;
  beforeEach(() => {
    db = openDatabase(':memory:');
    store = new SkillRecordStore(() => db, () => 0);
  });
  afterEach(() => {
    db.close();
  });

  const topic = (name: string, verdict: Verdict, plan: string[] = []) => ({ name, verdict, evidence: `${name} ${verdict}`, plan });

  it('a topic goes into the skill it belongs to: no duplicates for the same concept', () => {
    store.addSession('s1', 1, [topic('Dynamic programming: base cases', 'weakness', ['Re-derive knapsack'])]);
    // Same concept worded a little differently, and the exact name
    store.addSession('s2', 2, [topic('Dynamic Programming - base case', 'weakness')]);
    store.addSession('s3', 3, [topic('Dynamic programming: base cases', 'strength'), topic('Graphs: Dijkstra', 'strength')]);
    const skills = store.list();
    expect(skills.map((s) => s.name).sort()).toEqual(['Dynamic programming: base cases', 'Graphs: Dijkstra']);
    const dp = skills.find((s) => s.name.startsWith('Dynamic'))!;
    expect(dp.history.map((e) => e.verdict)).toEqual(['weakness', 'weakness', 'strength']);
    expect(dp.aliases).toEqual(['Dynamic Programming - base case']);
    expect(dp.plan).toEqual(['Re-derive knapsack']);
    expect(skillStatus(dp.history)).toBe('improving');
  });

  it('different concepts stay apart', () => {
    store.addSession('s1', 1, [topic('Machine learning: overfitting', 'weakness'), topic('Machine learning: underfitting', 'strength')]);
    expect(store.list()).toHaveLength(2);
  });

  it('a rewritten report replaces its session: nothing counted twice; a skill only it named is removed', () => {
    store.addSession('s1', 1, [topic('Statistics: standard deviation', 'weakness'), topic('NLP: tokenization', 'practiced')]);
    store.addSession('s1', 1, [topic('Statistics: standard deviation', 'strength')]);
    const skills = store.list();
    expect(skills.map((s) => s.name)).toEqual(['Statistics: standard deviation']);
    expect(skills[0].history.map((e) => e.verdict)).toEqual(['strength']);
  });

  it('two topics of one report on one skill: one entry, the more telling verdict', () => {
    store.addSession('s1', 1, [topic('Graphs: shortest paths', 'practiced'), topic('Graphs: shortest path', 'weakness')]);
    expect(store.list()[0].history.map((e) => e.verdict)).toEqual(['weakness']);
  });

  it('names for the report writer, most recent first', () => {
    store.addSession('s1', 1, [topic('A: one', 'strength')]);
    store.addSession('s2', 2, [topic('B: two', 'weakness')]);
    expect(store.names()).toEqual(['B: two', 'A: one']);
  });
});

describe('tidying duplicates (names word matching cannot connect)', () => {
  let db: Database.Database;
  let store: SkillRecordStore;
  beforeEach(() => {
    db = openDatabase(':memory:');
    store = new SkillRecordStore(() => db, () => 0);
  });
  afterEach(() => {
    db.close();
  });
  const t = (name: string, verdict: Verdict, plan: string[] = []) => ({ name, verdict, evidence: `${name}`, plan });

  it('mergeGroups: one skill under the chosen name, all sessions, the other names kept', () => {
    store.addSession('s1', 1, [t('Triangle path sum', 'practiced')]);
    store.addSession('s2', 2, [t('Dynamic programming: Triangle state definition', 'weakness', ['Define dp[r][c]'])]);
    store.addSession('s3', 3, [t('Machine learning: overfitting', 'weakness')]);
    const merged = store.mergeGroups([{ name: 'Dynamic programming: Triangle state definition', members: ['Triangle path sum', 'Dynamic programming: Triangle state definition'] }]);
    expect(merged).toBe(1);
    const skills = store.list();
    expect(skills.map((s) => s.name).sort()).toEqual(['Dynamic programming: Triangle state definition', 'Machine learning: overfitting']);
    const dp = skills.find((s) => s.name.startsWith('Dynamic'))!;
    expect(dp.history.map((e) => [e.sessionId, e.verdict])).toEqual([
      ['s1', 'practiced'],
      ['s2', 'weakness']
    ]);
    expect(dp.aliases).toContain('Triangle path sum');
    expect(dp.plan).toEqual(['Define dp[r][c]']);
    // A later report using the old name lands on the merged skill
    store.addSession('s4', 4, [t('Triangle path sum', 'strength')]);
    expect(store.list()).toHaveLength(2);
  });

  it('tidySkills: asks with the names only, ignores invented members, skips with fewer than 2 skills', async () => {
    const calls: Array<LlmCall<unknown>> = [];
    let groups: Array<{ name: string; members: string[] }> = [];
    const llm = () => ({
      async generate<T>(call: LlmCall<T>): Promise<T> {
        calls.push(call as LlmCall<unknown>);
        return call.schema.parse({ groups });
      }
    });
    store.addSession('s1', 1, [t('Triangle path sum', 'practiced')]);
    expect(await tidySkills(store, llm)).toBe(0);
    expect(calls).toHaveLength(0);

    store.addSession('s2', 2, [t('Dynamic programming: Triangle', 'weakness')]);
    groups = [{ name: 'Dynamic programming: Triangle', members: ['Triangle path sum', 'Dynamic programming: Triangle', 'Made-up skill'] }];
    expect(await tidySkills(store, llm)).toBe(1);
    expect(JSON.parse(calls[0].messages[0].content)).toEqual({ skills: ['Dynamic programming: Triangle', 'Triangle path sum'] });
    expect(store.list().map((s) => s.name)).toEqual(['Dynamic programming: Triangle']);
  });
});
