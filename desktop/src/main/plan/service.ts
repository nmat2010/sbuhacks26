import type {
  BResult,
  PlanItemPatch,
  PlanItemView,
  PlanOnboardingInput,
  PlanView
} from '../../common/ipc-intelligence.js';
import type { PlanSnapshotType } from '@wolfie/shared';
import type { LlmCall } from '../llm/client.js';
import { LLMError } from '../llm/provider.js';
import { renderPrompt } from '../llm/prompts/index.js';
import type { EventType } from '../events.js';
import { localDay } from '../llm/usage.js';
import { addDays, minDate } from './dates.js';
import {
  NewItemSchema,
  OnboardingSchema,
  PlanItemPatchSchema,
  makeItemOutputSchema,
  makePlanOutputSchema
} from './schemas.js';
import { PlanNotFoundError, PlanStore } from './store.js';

// Plan generation and editing (SPEC Phase 5). Every public method returns a BResult with a
// friendly message instead of throwing, so the IPC layer can pass it straight to the UI.

export interface PlanServiceDeps {
  store: PlanStore;
  llm: () => { generate<T>(call: LlmCall<T>): Promise<T> };
  now: () => number;
  log: (type: EventType, payload: Record<string, unknown>) => void;
}

/** Longest horizon we plan for, even if a goal's target date is further out. */
const MAX_HORIZON_DAYS = 400;

const MESSAGES = {
  noOnboarding: 'Tell me about your semester and goals first, then I can build a plan.',
  noGoals: 'Add a goal first, then I can build a plan for it.',
  pastTarget: 'That goal\'s target date has already passed. Pick a later date and try again.',
  invalid: "I couldn't put together a valid plan this time. Please try again in a moment.",
  offline: "I couldn't reach the planning service. Check your connection and try again.",
  cap: "I've reached today's limit for plan requests. Try again tomorrow, or edit the plan by hand.",
  notFound: "I couldn't find that item. It may have been deleted."
} as const;

export class PlanService {
  constructor(private readonly deps: PlanServiceDeps) {}

  getOnboarding(): PlanOnboardingInput | null {
    return this.deps.store.getOnboarding();
  }

  view(): PlanView {
    return this.deps.store.listPlan();
  }

  saveOnboarding(raw: unknown): BResult<{ goalIds: string[] }> {
    const parsed = OnboardingSchema.safeParse(raw);
    if (!parsed.success) return { success: false, error: describeIssue(parsed.error.issues[0]) };
    const { goalIds } = this.deps.store.saveOnboarding(parsed.data);
    this.deps.log('plan.onboarding_saved', { goals: goalIds.length, courses: parsed.data.courses.length });
    return { success: true, data: { goalIds } };
  }

  /** Generates the plan for one goal, or for every active goal. */
  async generate(opts: { goalId?: string } = {}): Promise<BResult<PlanView>> {
    const { store, now } = this.deps;
    const onboarding = store.getOnboarding();
    if (!onboarding) return { success: false, error: MESSAGES.noOnboarding };
    const goals = store.activeGoals(opts.goalId);
    if (goals.length === 0) return { success: false, error: MESSAGES.noGoals };

    const today = localDay(now());
    const horizon = addDays(today, MAX_HORIZON_DAYS);
    const goalEnds: Record<string, string> = {};
    for (const goal of goals) {
      const end = minDate(goal.target_date ?? onboarding.semesterEnd, horizon);
      if (end < today) return { success: false, error: MESSAGES.pastTarget };
      goalEnds[goal.id] = end;
    }

    const kept = Object.fromEntries(
      goals.map((g) => [
        g.id,
        store
          .listPlan()
          .goals.find((x) => x.id === g.id)!
          .items.filter((i) => i.source !== 'generated' || i.status === 'completed')
          .map((i) => i.title)
      ])
    );
    const input = {
      today,
      semester: { start: onboarding.semesterStart, end: onboarding.semesterEnd },
      weeklyHours: onboarding.weeklyHours,
      courses: onboarding.courses,
      goals: goals.map((g) => ({
        goal_id: g.id,
        title: g.title,
        type: g.type,
        target_date: g.target_date,
        plan_until: goalEnds[g.id],
        already_planned: kept[g.id]
      }))
    };

    try {
      const out = await this.deps.llm().generate({
        task: 'plan',
        system: renderPrompt('plan.v1'),
        messages: [{ role: 'user', content: JSON.stringify(input) }],
        schema: makePlanOutputSchema({ today, goalEnds }),
        mockKey: {
          weeklyHours: onboarding.weeklyHours,
          goals: goals.map((g) => ({ id: g.id, title: g.title, type: g.type, start: today, end: goalEnds[g.id] }))
        }
      });
      for (const goalPlan of out.goals) {
        // Keep one plan per goal even if the model repeats a goal_id
        if (!goalEnds[goalPlan.goal_id]) continue;
        this.deps.store.replaceGenerated(goalPlan.goal_id, goalPlan);
        delete goalEnds[goalPlan.goal_id];
      }
      this.deps.log('plan.generated', { goals: out.goals.length, items: out.goals.reduce((n, g) => n + g.items.length, 0) });
      return { success: true, data: store.listPlan() };
    } catch (error) {
      return { success: false, error: friendlyLlmError(error) };
    }
  }

  async regenerateItem(id: string): Promise<BResult<PlanItemView>> {
    const { store, now } = this.deps;
    try {
      const item = store.getItem(id);
      const goal = store.getGoal(item.goalId);
      const onboarding = store.getOnboarding();
      if (!goal) return { success: false, error: MESSAGES.notFound };
      const today = localDay(now());
      const end = minDate(goal.target_date ?? onboarding?.semesterEnd ?? addDays(today, 120), addDays(today, MAX_HORIZON_DAYS));
      if (end < today) return { success: false, error: MESSAGES.pastTarget };
      const others = store
        .listPlan()
        .goals.find((g) => g.id === goal.id)!
        .items.filter((i) => i.id !== id)
        .map((i) => i.title);

      const out = await this.deps.llm().generate({
        task: 'plan',
        system: renderPrompt('plan-item.v1'),
        messages: [
          {
            role: 'user',
            content: JSON.stringify({
              today,
              goal: { title: goal.title, type: goal.type, plan_until: end },
              replace: { title: item.title, due_date: item.dueDate, notes: item.notes },
              other_tasks: others
            })
          }
        ],
        schema: makeItemOutputSchema({ today, end }),
        mockKey: { item: { title: item.title, due_date: item.dueDate, end } }
      });
      const updated = store.updateItem(id, { title: out.title, dueDate: out.due_date, notes: out.notes ?? null });
      // A regenerated item is still the plan's own, so a later full regenerate may replace it
      store.setItemSource(id, 'generated');
      return { success: true, data: { ...updated, source: 'generated' } };
    } catch (error) {
      if (error instanceof PlanNotFoundError) return { success: false, error: MESSAGES.notFound };
      return { success: false, error: friendlyLlmError(error) };
    }
  }

  addItem(goalId: string, raw: unknown): BResult<PlanItemView> {
    const parsed = NewItemSchema.safeParse(raw);
    if (!parsed.success) return { success: false, error: describeIssue(parsed.error.issues[0]) };
    return this.guard(() => this.deps.store.addItem(goalId, parsed.data));
  }

  updateItem(id: string, raw: unknown): BResult<PlanItemView> {
    const parsed = PlanItemPatchSchema.safeParse(raw);
    if (!parsed.success) return { success: false, error: describeIssue(parsed.error.issues[0]) };
    return this.guard(() => {
      const before = this.deps.store.getItem(id);
      const after = this.deps.store.updateItem(id, parsed.data as PlanItemPatch);
      if (before.status !== 'completed' && after.status === 'completed') {
        this.deps.log('plan.item_completed', { itemId: id, goalId: after.goalId, dueDate: after.dueDate });
      }
      return after;
    });
  }

  deleteItem(id: string): BResult {
    return this.guard(() => {
      this.deps.store.deleteItem(id);
      return undefined;
    });
  }

  reorder(goalId: string, orderedIds: string[]): BResult {
    return this.guard(() => {
      if (!this.deps.store.getGoal(goalId)) throw new PlanNotFoundError(goalId);
      this.deps.store.reorder(goalId, orderedIds);
      return undefined;
    });
  }

  // ---- For Agent A (sync) and nudges ---------------------------------------------------------

  /** Items around today for the web app's read-only Today screen (plan.snapshot). */
  snapshot(): PlanSnapshotType {
    const today = localDay(this.deps.now());
    const items = this.deps.store.itemsDueBetween(addDays(today, -7), addDays(today, 14));
    return {
      items: items.map((i) => ({
        id: i.id,
        title: i.title,
        dueDate: i.dueDate ?? undefined,
        status: i.status,
        goalId: i.goalId
      }))
    };
  }

  /** "Today's goal: ..." for nudges: the oldest open item due today or earlier. */
  todayContext(): { text: string; title: string; dueDate: string; goalTitle: string; itemId: string } | null {
    const today = localDay(this.deps.now());
    const [first] = this.deps.store.openItemsDueBy(today);
    if (!first || !first.dueDate) return null;
    return {
      text: `Today's goal: ${first.title}`,
      title: first.title,
      dueDate: first.dueDate,
      goalTitle: first.goalTitle,
      itemId: first.id
    };
  }

  private guard<T>(fn: () => T): BResult<T> {
    try {
      return { success: true, data: fn() };
    } catch (error) {
      if (error instanceof PlanNotFoundError) return { success: false, error: MESSAGES.notFound };
      throw error;
    }
  }
}

function describeIssue(issue: { path: Array<string | number>; message: string } | undefined): string {
  if (!issue) return "Something in that form doesn't look right.";
  const where = issue.path.length ? ` (${issue.path.join(' > ')})` : '';
  return `${issue.message}${where}`;
}

function friendlyLlmError(error: unknown): string {
  if (error instanceof LLMError) {
    if (error.code === 'SCHEMA' || error.code === 'INVALID_JSON') return MESSAGES.invalid;
    if (error.code === 'DAILY_CAP') return MESSAGES.cap;
    return MESSAGES.offline;
  }
  return MESSAGES.invalid;
}
