import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type Database from 'better-sqlite3';
import { openDatabase } from '../../db/index.js';
import type { LlmCall } from '../../llm/client.js';
import { LLMError } from '../../llm/provider.js';
import { obs } from '../../watch/__tests__/helpers.js';
import { SessionTracker } from '../tracker.js';
import { ReportService, type SessionSnapshot } from '../service.js';
import { ReportStore } from '../store.js';
import type { ReportProse } from '../types.js';

const check = (question: string, looks_correct: boolean | null, visible_answer: string | null = 'x', issue: string | null = null) => ({
  question,
  visible_answer,
  looks_correct,
  issue
});

describe('SessionTracker', () => {
  it('works out how each problem went', () => {
    const t = new SessionTracker();
    // Right the first time, without help
    t.observe(obs({ answer_checks: [check('2x + 5 = 13', true)] }), 1);
    // Wrong twice (two different answers), then corrected after hints
    t.observe(obs({ answer_checks: [check('What is underfitting?', false, 'too complex', 'Describes overfitting')] }), 2);
    t.observe(obs({ answer_checks: [check('What is underfitting?', false, 'too complex', 'Describes overfitting')] }), 3);
    t.observe(obs({ answer_checks: [check('What is underfitting?', false, 'memorizes data', 'Still overfitting')] }), 4);
    t.help('What is underfitting?', 2, 5);
    t.observe(obs({ answer_checks: [check('What is underfitting?', true)] }), 6);
    // Paused on it, then asked for the answer
    t.observe(obs({ unanswered_question: 'What is overfitting?' }), 7);
    t.stalled('What is overfitting?', 8);
    t.help('what is overfitting', 5, 9);
    // Still wrong at the end
    t.observe(obs({ answer_checks: [check('Compare the means', false, 'ii is bigger')] }), 10);
    // Help with nothing in focus
    t.help(null, 1, 11);
    t.asked('What is an SVM?');

    const snap = t.snapshot();
    expect(snap.problems.map((p) => [p.question, p.outcome])).toEqual([
      ['2x + 5 = 13', 'solved_alone'],
      ['What is underfitting?', 'solved_with_help'],
      ['What is overfitting?', 'answer_shown'],
      ['Compare the means', 'unresolved']
    ]);
    expect(snap.problems[1]).toMatchObject({ wrongAttempts: 2, issues: ['Describes overfitting', 'Still overfitting'], hintLevel: 2 });
    expect(snap.problems[2]).toMatchObject({ stalled: true, hintLevel: 5 });
    expect(snap).toMatchObject({ questionsAsked: ['What is an SVM?'], generalHelp: 1 });

    t.reset();
    expect(t.snapshot()).toEqual({ problems: [], questionsAsked: [], generalHelp: 0 });
  });
});

describe('ReportService', () => {
  let db: Database.Database;
  let store: ReportStore;
  let calls: Array<LlmCall<unknown>>;
  let reply: ReportProse | Error;
  let updates: string[];

  const numbers = { startedAt: 1000, endedAt: 61_000, seconds: { work: 2400, ai_tool: 120, distraction: 60, idle: 30 }, hintCount: 3, deepestHintLevel: 5 };
  const make = () =>
    new ReportService({
      now: () => 99,
      store,
      llm: () => ({
        async generate<T>(call: LlmCall<T>): Promise<T> {
          calls.push(call as LlmCall<unknown>);
          if (reply instanceof Error) throw reply;
          return call.schema.parse(reply);
        }
      }),
      sessionNumbers: (id) => (id === 's1' ? numbers : null),
      onUpdated: (id) => void updates.push(id)
    });
  const snapshot: SessionSnapshot = {
    sources: [{ kind: 'paper', title: 'User-Factor Adaptation', url: null, minutes: 20, locators: ['p. 2'], points: ['Factor analysis of user language'] }],
    timeline: [{ from: 2000, to: 30_000, activity: 'reading_paper', summary: 'Reading page 2' }],
    problems: [{ question: 'What is overfitting?', outcome: 'answer_shown', wrongAttempts: 0, issues: [], hintLevel: 5, stalled: true }],
    questionsAsked: ['What is factor analysis?'],
    generalHelp: 0
  };

  beforeEach(() => {
    db = openDatabase(':memory:');
    store = new ReportStore(() => db);
    calls = [];
    updates = [];
    reply = {
      headline: 'Factor analysis reading; overfitting still shaky',
      summary: 'You read about user-factor adaptation.',
      topics: [{ name: 'Overfitting', verdict: 'weakness', evidence: 'Needed the answer.' }],
      next_steps: ['Explain overfitting in your own words.']
    };
  });
  afterEach(() => {
    db.close();
  });

  it('saves the facts and the written report; the model gets the facts in minutes', async () => {
    const report = await make().sessionEnded('s1', snapshot);
    expect(report).toMatchObject({ status: 'ready', prose: { headline: 'Factor analysis reading; overfitting still shaky' } });
    expect(store.get('s1')).toMatchObject({ status: 'ready', facts: { watched: true, hintCount: 3, problems: [{ outcome: 'answer_shown' }] } });
    const sent = JSON.parse(calls[0].messages[0].content);
    expect(sent.minutes).toEqual({ focused_work: 40, ai_tools: 2, distracted: 1, idle: 1 });
    expect(sent.problems[0].question).toBe('What is overfitting?');
    expect(calls[0].system).toContain('A topic is a strength only with evidence');
    expect(updates).toEqual(['s1', 's1']); // pending, then ready
  });

  it('nothing Wolfie could see: the numbers are the report, no model call', async () => {
    const report = await make().sessionEnded('s1', { sources: [], timeline: [], problems: [], questionsAsked: [], generalHelp: 0 });
    expect(report).toMatchObject({ status: 'ready', prose: null, facts: { watched: false } });
    expect(calls).toHaveLength(0);
  });

  it('the model fails: the facts are kept with a friendly reason; regenerate writes it later', async () => {
    reply = new LLMError('per day', 'QUOTA', 'gemini');
    const failed = await make().sessionEnded('s1', snapshot);
    expect(failed).toMatchObject({ status: 'failed', prose: null, error: expect.stringContaining('limit') });
    expect(store.get('s1')?.facts.sources[0].title).toBe('User-Factor Adaptation');
    reply = { headline: 'Done', summary: 'ok', topics: [], next_steps: [] };
    const again = await make().regenerate('s1');
    expect(again).toMatchObject({ status: 'ready', prose: { headline: 'Done' } });
  });

  it('an unknown session gets no report', async () => {
    expect(await make().sessionEnded('nope', snapshot)).toBeNull();
  });
});
