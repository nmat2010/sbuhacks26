import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type Database from 'better-sqlite3';
import type { PlanOnboardingInput } from '../../../common/ipc-intelligence.js';
import { openDatabase } from '../../db/index.js';
import { LLMClient } from '../../llm/client.js';
import { MockLLMProvider } from '../../llm/mock-provider.js';
import { LLMError, type LLMProvider, type LlmRequest } from '../../llm/provider.js';
import { addDays, daysBetween, isValidDate, mondayOnOrAfter } from '../dates.js';
import { PlanService } from '../service.js';
import { PlanStore } from '../store.js';

const TODAY = '2026-10-24'; // a Saturday
const NOW = new Date(2026, 9, 24, 12).getTime();

let db: Database.Database;
let events: Array<{ type: string; payload: Record<string, unknown> }>;

beforeEach(() => {
  db = openDatabase(':memory:');
  events = [];
});
afterEach(() => {
  db.close();
});

const sample: PlanOnboardingInput = {
  semesterStart: '2026-08-31',
  semesterEnd: '2026-12-18',
  weeklyHours: 10,
  courses: [
    { name: 'CSE 220 Systems Programming', credits: 4, importantDates: [{ title: 'Midterm', date: '2026-11-05' }] },
    { name: 'MAT 211 Linear Algebra', credits: 3, importantDates: [{ title: 'Exam 2', date: '2026-11-19' }] },
    { name: 'WRT 102 Writing', credits: 3, importantDates: [] }
  ],
  goals: [{ title: 'Get into a research lab by spring', type: 'research', targetDate: '2027-03-31' }]
};

function make(provider: LLMProvider = new MockLLMProvider({ delayMs: 0 })) {
  const client = new LLMClient({ provider, retryDelayMs: 1, log: () => {} });
  const store = new PlanStore(() => db, () => NOW);
  const service = new PlanService({
    store,
    llm: () => client,
    now: () => NOW,
    log: (type, payload) => void events.push({ type, payload })
  });
  return { service, store };
}

describe('dates', () => {
  it('validates, adds and finds Mondays without timezone drift', () => {
    expect(isValidDate('2027-02-29')).toBe(false);
    expect(isValidDate('2028-02-29')).toBe(true);
    expect(addDays('2026-11-01', 1)).toBe('2026-11-02'); // across the DST change
    expect(daysBetween('2026-03-01', '2026-03-31')).toBe(30);
    expect(mondayOnOrAfter('2026-10-24')).toBe('2026-10-26');
    expect(mondayOnOrAfter('2026-10-26')).toBe('2026-10-26');
  });
});

describe('onboarding', () => {
  it('stores the answers in its own table (not settings) and creates the goals', () => {
    const { service } = make();
    const res = service.saveOnboarding(sample);
    expect(res.success).toBe(true);
    expect(res.data?.goalIds).toHaveLength(1);
    expect(service.getOnboarding()).toMatchObject({ weeklyHours: 10, goals: [{ id: res.data!.goalIds[0], title: sample.goals[0].title }] });
    expect(db.prepare('SELECT COUNT(*) AS n FROM plan_onboarding').get()).toEqual({ n: 1 });
    expect(db.prepare("SELECT COUNT(*) AS n FROM settings WHERE key LIKE '%plan%' OR key LIKE '%onboarding%'").get()).toEqual({ n: 0 });
    expect(db.prepare('SELECT title, type, target_date, status FROM goals').get()).toEqual({
      title: 'Get into a research lab by spring',
      type: 'research',
      target_date: '2027-03-31',
      status: 'active'
    });
  });

  it('updates existing goals by id and archives the ones removed', () => {
    const { service } = make();
    const first = service.saveOnboarding({ ...sample, goals: [...sample.goals, { title: 'Side project', type: 'project' }] });
    const [labId] = first.data!.goalIds;
    service.saveOnboarding({ ...sample, goals: [{ id: labId, title: 'Join a lab in the spring', type: 'research' }] });
    const rows = db.prepare('SELECT title, status FROM goals ORDER BY rowid').all();
    expect(rows).toEqual([
      { title: 'Join a lab in the spring', status: 'active' },
      { title: 'Side project', status: 'archived' }
    ]);
  });

  it('rejects bad input with a readable message', () => {
    const { service } = make();
    expect(service.saveOnboarding({ ...sample, goals: [] }).error).toMatch(/at least one goal/i);
    expect(service.saveOnboarding({ ...sample, semesterEnd: '2026-01-01' }).error).toMatch(/end after it starts/);
    expect(service.saveOnboarding({ ...sample, semesterStart: '31/08/2026' }).error).toMatch(/YYYY-MM-DD/);
    expect(db.prepare('SELECT COUNT(*) AS n FROM goals').get()).toEqual({ n: 0 });
  });
});

describe('plan generation (mock provider)', () => {
  it('the sample input (3 courses, 10 h/week, research lab by spring) produces a valid plan saved in the DB', async () => {
    const { service } = make();
    const { goalIds } = service.saveOnboarding(sample).data!;
    const res = await service.generate();
    expect(res.success).toBe(true);

    const goal = res.data!.goals[0];
    expect(goal.id).toBe(goalIds[0]);
    expect(goal.rationale).toMatch(/Get into a research lab by spring/);
    expect(goal.milestones.length).toBeGreaterThan(1);
    expect(goal.milestones.length).toBeLessThanOrEqual(12);
    expect(goal.items.length).toBeGreaterThan(1);
    for (const item of goal.items) {
      expect(item.dueDate! >= TODAY && item.dueDate! <= '2027-03-31').toBe(true);
      expect(item.status).toBe('pending');
      expect(item.source).toBe('generated');
      expect(item.milestoneId).not.toBeNull();
      expect(item.estimatedHours!).toBeLessThanOrEqual(10);
    }
    // sorted by due date, positions contiguous
    expect(goal.items.map((i) => i.position)).toEqual(goal.items.map((_, i) => i));
    expect([...goal.items].sort((a, b) => a.dueDate!.localeCompare(b.dueDate!))).toEqual(goal.items);

    // saved in the core tables
    expect(db.prepare('SELECT COUNT(*) AS n FROM plan_items WHERE goal_id = ?').get(goalIds[0])).toEqual({ n: goal.items.length });
    expect(db.prepare('SELECT COUNT(*) AS n FROM plan_milestones').get()).toEqual({ n: goal.milestones.length });
    expect(events.map((e) => e.type)).toContain('plan.generated');
  });

  it('the model sees today, the courses and the weekly hours', async () => {
    const requests: LlmRequest[] = [];
    const mock = new MockLLMProvider({ delayMs: 0 });
    const { service } = make({
      name: 'spy',
      countsTowardCap: false,
      generateJson: (r) => {
        requests.push(r);
        return mock.generateJson(r);
      }
    });
    service.saveOnboarding(sample);
    await service.generate();
    const sent = JSON.parse(requests[0].messages[0].content);
    expect(sent).toMatchObject({ today: TODAY, weeklyHours: 10 });
    expect(sent.courses).toHaveLength(3);
    expect(sent.goals[0].plan_until).toBe('2027-03-31');
    expect(requests[0].system).toMatch(/must not exceed the free hours/);
  });

  it('retries once on invalid output, then succeeds', async () => {
    const mock = new MockLLMProvider({ delayMs: 0 });
    let calls = 0;
    const provider: LLMProvider = {
      name: 'flaky',
      countsTowardCap: false,
      async generateJson(req) {
        calls++;
        if (calls === 1) {
          // a due date in the past violates the plan window
          const good = (await mock.generateJson(req)) as { goals: Array<{ items: Array<{ due_date: string }> }> };
          good.goals[0].items[0].due_date = '2020-01-01';
          return good;
        }
        return mock.generateJson(req);
      }
    };
    const { service } = make(provider);
    service.saveOnboarding(sample);
    const res = await service.generate();
    expect(res.success).toBe(true);
    expect(calls).toBe(2);
  });

  it('after two invalid replies it returns a clear error and changes nothing', async () => {
    const provider: LLMProvider = { name: 'bad', countsTowardCap: false, generateJson: async () => ({ goals: [] }) };
    const { service } = make(provider);
    service.saveOnboarding(sample);
    const res = await service.generate();
    expect(res.success).toBe(false);
    expect(res.error).toMatch(/couldn't put together a valid plan/);
    expect(db.prepare('SELECT COUNT(*) AS n FROM plan_items').get()).toEqual({ n: 0 });
  });

  it('gives friendly errors for no onboarding, a past target, offline and the daily cap', async () => {
    const { service } = make();
    expect((await service.generate()).error).toMatch(/semester and goals first/);

    service.saveOnboarding({ ...sample, goals: [{ title: 'Old goal', type: 'job', targetDate: '2026-09-01' }] });
    expect((await service.generate()).error).toMatch(/already passed/);

    const offline = make({ name: 'down', countsTowardCap: false, generateJson: async () => { throw new LLMError('x', 'NETWORK', 'down', true); } });
    offline.service.saveOnboarding(sample);
    expect((await offline.service.generate()).error).toMatch(/reach the planning service/);

    const capped = new LLMClient({ provider: { name: 'g', countsTowardCap: true, generateJson: async () => ({}) }, dailyCap: () => 0, log: () => {} });
    const c = new PlanService({ store: new PlanStore(() => db, () => NOW), llm: () => capped, now: () => NOW, log: () => {} });
    expect((await c.generate()).error).toMatch(/limit/);
  });

  it('an invalid goal_id from the model is rejected (and retried)', async () => {
    const provider: LLMProvider = {
      name: 'wrong-id',
      countsTowardCap: false,
      generateJson: async () => ({
        goals: [{ goal_id: 'not-a-goal', rationale: 'r', milestones: [{ week_start: '2026-10-26', title: 'm' }], items: [{ title: 'i', due_date: '2026-10-30' }] }]
      })
    };
    const { service } = make(provider);
    service.saveOnboarding(sample);
    expect((await service.generate()).success).toBe(false);
  });
});

describe('editing the plan', () => {
  async function planned() {
    const { service, store } = make();
    service.saveOnboarding(sample);
    const goal = (await service.generate()).data!.goals[0];
    return { service, store, goal };
  }

  it('checks off, edits, adds, deletes and reorders', async () => {
    const { service, goal } = await planned();
    const [a, b, c] = goal.items;

    const done = service.updateItem(a.id, { status: 'completed' });
    expect(done.data?.status).toBe('completed');
    expect(events.filter((e) => e.type === 'plan.item_completed')).toHaveLength(1);
    service.updateItem(a.id, { status: 'completed' }); // already done: not logged again
    expect(events.filter((e) => e.type === 'plan.item_completed')).toHaveLength(1);

    const edited = service.updateItem(b.id, { title: 'My own wording', dueDate: '2026-11-02', notes: null });
    expect(edited.data).toMatchObject({ title: 'My own wording', dueDate: '2026-11-02', notes: null, source: 'user' });
    expect(service.updateItem(b.id, { dueDate: 'tomorrow' }).success).toBe(false);

    const added = service.addItem(goal.id, { title: 'Email Prof. Rivera', dueDate: '2026-10-28' });
    expect(added.data).toMatchObject({ source: 'user', status: 'pending', position: goal.items.length });

    expect(service.deleteItem(c.id).success).toBe(true);
    expect(service.deleteItem(c.id).error).toMatch(/couldn't find/);
    expect(db.prepare('SELECT COUNT(*) AS n FROM plan_item_meta WHERE item_id = ?').get(c.id)).toEqual({ n: 0 });

    const ids = service.view().goals[0].items.map((i) => i.id);
    const reversed = [...ids].reverse();
    expect(service.reorder(goal.id, reversed).success).toBe(true);
    expect(service.view().goals[0].items.map((i) => i.id)).toEqual(reversed);
    // a partial list puts those first and keeps the rest in order
    expect(service.reorder(goal.id, [reversed[2]]).success).toBe(true);
    expect(service.view().goals[0].items.map((i) => i.id).slice(0, 3)).toEqual([reversed[2], reversed[0], reversed[1]]);
    expect(service.reorder('nope', []).success).toBe(false);
    expect(service.addItem('nope', { title: 'x' }).success).toBe(false);
  });

  it('regenerating the plan replaces generated unfinished items but keeps the student\'s', async () => {
    const { service, goal } = await planned();
    const [done, edited, , ...rest] = goal.items;
    service.updateItem(done.id, { status: 'completed' });
    service.updateItem(edited.id, { title: 'Edited by me' });
    const mine = service.addItem(goal.id, { title: 'Mine' }).data!;
    const doomed = rest.map((i) => i.id);

    const res = await service.generate({ goalId: goal.id });
    expect(res.success).toBe(true);
    const ids = new Set(res.data!.goals[0].items.map((i) => i.id));
    expect(ids.has(done.id)).toBe(true);
    expect(ids.has(edited.id)).toBe(true);
    expect(ids.has(mine.id)).toBe(true);
    for (const id of doomed) expect(ids.has(id)).toBe(false);
    // milestones were replaced, not duplicated
    expect(res.data!.goals[0].milestones.length).toBeLessThanOrEqual(12);
    expect(db.prepare('SELECT COUNT(*) AS n FROM plan_milestones').get()).toEqual({ n: res.data!.goals[0].milestones.length });
  });

  it('regenerates a single item within its window', async () => {
    const { service, goal } = await planned();
    const target = goal.items[2];
    const res = await service.regenerateItem(target.id);
    expect(res.success).toBe(true);
    expect(res.data!.title).toBe(`Alternative: ${target.title}`);
    expect(res.data!.dueDate).toBe(target.dueDate);
    expect(res.data!.source).toBe('generated');
    expect((await service.regenerateItem('missing')).error).toMatch(/couldn't find/);
  });
});

describe('seams for sync and nudges', () => {
  it('getPlanSnapshot-style output lists items around today, and todayContext names the oldest open item', async () => {
    const { service, store } = make();
    const { goalIds } = service.saveOnboarding(sample).data!;
    const overdue = store.addItem(goalIds[0], { title: 'Read the abstract', dueDate: '2026-10-22' });
    store.addItem(goalIds[0], { title: 'Email a professor', dueDate: '2026-10-24' });
    store.addItem(goalIds[0], { title: 'Far away', dueDate: '2027-02-01' });
    const snap = service.snapshot();
    expect(snap.items.map((i) => i.title)).toEqual(['Read the abstract', 'Email a professor']);
    expect(snap.items[0]).toMatchObject({ status: 'pending', goalId: goalIds[0], dueDate: '2026-10-22' });

    expect(service.todayContext()).toMatchObject({ text: "Today's goal: Read the abstract", itemId: overdue.id });
    service.updateItem(overdue.id, { status: 'completed' });
    expect(service.todayContext()?.text).toBe("Today's goal: Email a professor");
  });

  it('returns null when nothing is due', () => {
    const { service } = make();
    expect(service.todayContext()).toBeNull();
    expect(service.snapshot()).toEqual({ items: [] });
  });
});
