import { randomUUID } from 'crypto';
import type Database from 'better-sqlite3';
import type {
  GoalType,
  PlanGoalView,
  PlanItemPatch,
  PlanItemStatus,
  PlanItemView,
  PlanMilestoneView,
  PlanOnboardingInput,
  PlanView
} from '../../common/ipc-intelligence.js';

// SQLite access for goals and the plan. Core owns `goals` and `plan_items`; B's extra columns
// live in plan_goal_meta / plan_milestones / plan_item_meta (migration 202_b_plan).

export class PlanNotFoundError extends Error {}

interface GoalRow {
  id: string;
  title: string;
  type: GoalType;
  target_date: string | null;
  status: 'active' | 'completed' | 'archived';
}

interface ItemRow {
  id: string;
  goal_id: string;
  title: string;
  due_date: string | null;
  status: PlanItemStatus;
  notes: string | null;
  position: number | null;
  milestone_id: string | null;
  estimated_hours: number | null;
  source: 'generated' | 'user' | 'paper' | null;
}

const ITEM_SELECT = `
  SELECT p.id, p.goal_id, p.title, p.due_date, p.status, p.notes,
         m.position, m.milestone_id, m.estimated_hours, m.source
  FROM plan_items p LEFT JOIN plan_item_meta m ON m.item_id = p.id`;

function toItem(row: ItemRow): PlanItemView {
  return {
    id: row.id,
    goalId: row.goal_id,
    title: row.title,
    dueDate: row.due_date,
    status: row.status,
    notes: row.notes,
    position: row.position ?? 0,
    milestoneId: row.milestone_id,
    estimatedHours: row.estimated_hours,
    source: row.source ?? 'user'
  };
}

export interface GeneratedPlan {
  rationale: string;
  milestones: Array<{ week_start: string; title: string }>;
  items: Array<{ title: string; due_date: string; notes?: string; milestone_week?: string; estimated_hours?: number }>;
}

export class PlanStore {
  constructor(
    private readonly getDb: () => Database.Database,
    private readonly now: () => number = Date.now,
    private readonly newId: () => string = randomUUID
  ) {}

  private get db(): Database.Database {
    return this.getDb();
  }

  // ---- Onboarding and goals --------------------------------------------------------------

  getOnboarding(): PlanOnboardingInput | null {
    const row = this.db.prepare('SELECT input_json FROM plan_onboarding WHERE id = 1').get() as { input_json: string } | undefined;
    return row ? (JSON.parse(row.input_json) as PlanOnboardingInput) : null;
  }

  /** Stores the answers and upserts the goals; goals no longer listed are archived, not deleted. */
  saveOnboarding(input: PlanOnboardingInput): { goalIds: string[]; input: PlanOnboardingInput } {
    const db = this.db;
    const goalIds: string[] = [];
    const saved: PlanOnboardingInput = { ...input, goals: [] };
    db.transaction(() => {
      for (const goal of input.goals) {
        const existing = goal.id ? (db.prepare('SELECT id FROM goals WHERE id = ?').get(goal.id) as { id: string } | undefined) : undefined;
        const id = existing?.id ?? this.newId();
        if (existing) {
          db.prepare("UPDATE goals SET title = ?, type = ?, target_date = ?, status = 'active' WHERE id = ?").run(
            goal.title,
            goal.type,
            goal.targetDate ?? null,
            id
          );
        } else {
          db.prepare("INSERT INTO goals (id, title, type, target_date, status) VALUES (?, ?, ?, ?, 'active')").run(
            id,
            goal.title,
            goal.type,
            goal.targetDate ?? null
          );
        }
        goalIds.push(id);
        saved.goals.push({ ...goal, id });
      }
      const keep = goalIds.map(() => '?').join(',');
      db.prepare(`UPDATE goals SET status = 'archived' WHERE status = 'active' AND id NOT IN (${keep})`).run(...goalIds);
      db.prepare(
        'INSERT INTO plan_onboarding (id, input_json, updated_at) VALUES (1, ?, ?) ON CONFLICT(id) DO UPDATE SET input_json = excluded.input_json, updated_at = excluded.updated_at'
      ).run(JSON.stringify(saved), this.now());
    })();
    return { goalIds, input: saved };
  }

  activeGoals(goalId?: string): GoalRow[] {
    const rows = this.db.prepare("SELECT id, title, type, target_date, status FROM goals WHERE status = 'active' ORDER BY rowid").all() as GoalRow[];
    return goalId ? rows.filter((g) => g.id === goalId) : rows;
  }

  getGoal(goalId: string): GoalRow | undefined {
    return this.db.prepare('SELECT id, title, type, target_date, status FROM goals WHERE id = ?').get(goalId) as GoalRow | undefined;
  }

  // ---- Reading the plan ------------------------------------------------------------------

  listPlan(): PlanView {
    const goals = this.db
      .prepare("SELECT id, title, type, target_date, status FROM goals WHERE status != 'archived' ORDER BY rowid")
      .all() as GoalRow[];
    return { goals: goals.map((g) => this.goalView(g)) };
  }

  private goalView(goal: GoalRow): PlanGoalView {
    const db = this.db;
    const meta = db.prepare('SELECT rationale FROM plan_goal_meta WHERE goal_id = ?').get(goal.id) as { rationale: string | null } | undefined;
    const milestones = db
      .prepare('SELECT id, week_start, title FROM plan_milestones WHERE goal_id = ? ORDER BY week_start, position')
      .all(goal.id) as Array<{ id: string; week_start: string; title: string }>;
    const items = db
      .prepare(`${ITEM_SELECT} WHERE p.goal_id = ? ORDER BY COALESCE(m.position, 1000000), p.rowid`)
      .all(goal.id) as ItemRow[];
    return {
      id: goal.id,
      title: goal.title,
      type: goal.type,
      targetDate: goal.target_date,
      status: goal.status,
      rationale: meta?.rationale ?? null,
      milestones: milestones.map<PlanMilestoneView>((m) => ({ id: m.id, weekStart: m.week_start, title: m.title })),
      items: items.map(toItem)
    };
  }

  getItem(id: string): PlanItemView {
    const row = this.db.prepare(`${ITEM_SELECT} WHERE p.id = ?`).get(id) as ItemRow | undefined;
    if (!row) throw new PlanNotFoundError(`No plan item ${id}`);
    return toItem(row);
  }

  /** Items due between two dates (inclusive), any status, ordered by due date. */
  itemsDueBetween(from: string, to: string): PlanItemView[] {
    const rows = this.db
      .prepare(`${ITEM_SELECT} JOIN goals g ON g.id = p.goal_id WHERE g.status != 'archived' AND p.due_date BETWEEN ? AND ? ORDER BY p.due_date, COALESCE(m.position, 1000000), p.rowid`)
      .all(from, to) as ItemRow[];
    return rows.map(toItem);
  }

  /** Open items due on or before `date`, oldest first (for "Today's goal"). */
  openItemsDueBy(date: string): Array<PlanItemView & { goalTitle: string }> {
    const rows = this.db
      .prepare(
        `SELECT p.id, p.goal_id, p.title, p.due_date, p.status, p.notes, m.position, m.milestone_id, m.estimated_hours, m.source, g.title AS goal_title
         FROM plan_items p LEFT JOIN plan_item_meta m ON m.item_id = p.id JOIN goals g ON g.id = p.goal_id
         WHERE g.status = 'active' AND p.status != 'completed' AND p.due_date IS NOT NULL AND p.due_date <= ?
         ORDER BY p.due_date, COALESCE(m.position, 1000000), p.rowid`
      )
      .all(date) as Array<ItemRow & { goal_title: string }>;
    return rows.map((r) => ({ ...toItem(r), goalTitle: r.goal_title }));
  }

  // ---- Editing ---------------------------------------------------------------------------

  addItem(
    goalId: string,
    item: { title: string; dueDate?: string | null; notes?: string | null; estimatedHours?: number | null },
    source: 'user' | 'paper' | 'generated' = 'user'
  ): PlanItemView {
    if (!this.getGoal(goalId)) throw new PlanNotFoundError(`No goal ${goalId}`);
    const db = this.db;
    const id = this.newId();
    db.transaction(() => {
      db.prepare("INSERT INTO plan_items (id, goal_id, title, due_date, status, notes) VALUES (?, ?, ?, ?, 'pending', ?)").run(
        id,
        goalId,
        item.title,
        item.dueDate ?? null,
        item.notes ?? null
      );
      db.prepare('INSERT INTO plan_item_meta (item_id, position, milestone_id, estimated_hours, source) VALUES (?, ?, NULL, ?, ?)').run(
        id,
        this.nextPosition(goalId),
        item.estimatedHours ?? null,
        source
      );
    })();
    return this.getItem(id);
  }

  updateItem(id: string, patch: PlanItemPatch): PlanItemView {
    const current = this.getItem(id);
    const next = {
      title: patch.title ?? current.title,
      due_date: patch.dueDate === undefined ? current.dueDate : patch.dueDate,
      status: patch.status ?? current.status,
      notes: patch.notes === undefined ? current.notes : patch.notes
    };
    this.db.prepare('UPDATE plan_items SET title = ?, due_date = ?, status = ?, notes = ? WHERE id = ?').run(
      next.title,
      next.due_date,
      next.status,
      next.notes,
      id
    );
    // Editing a generated item makes it the user's, so regenerating the plan will not wipe it
    if (current.source === 'generated' && (patch.title !== undefined || patch.dueDate !== undefined || patch.notes !== undefined)) {
      this.db.prepare("UPDATE plan_item_meta SET source = 'user' WHERE item_id = ?").run(id);
    }
    return this.getItem(id);
  }

  setItemSource(id: string, source: 'generated' | 'user' | 'paper'): void {
    this.db.prepare('UPDATE plan_item_meta SET source = ? WHERE item_id = ?').run(source, id);
  }

  deleteItem(id: string): void {
    this.getItem(id);
    this.db.transaction(() => {
      this.db.prepare('DELETE FROM plan_item_meta WHERE item_id = ?').run(id);
      this.db.prepare('DELETE FROM plan_items WHERE id = ?').run(id);
    })();
  }

  /** `orderedIds` first, in that order; any items not listed keep their relative order after them. */
  reorder(goalId: string, orderedIds: string[]): void {
    const current = this.listItemIds(goalId);
    const known = new Set(current);
    const listed = orderedIds.filter((id, i) => known.has(id) && orderedIds.indexOf(id) === i);
    const rest = current.filter((id) => !listed.includes(id));
    const db = this.db;
    db.transaction(() => {
      [...listed, ...rest].forEach((id, position) => {
        const res = db.prepare('UPDATE plan_item_meta SET position = ? WHERE item_id = ?').run(position, id);
        if (res.changes === 0) {
          db.prepare("INSERT INTO plan_item_meta (item_id, position, source) VALUES (?, ?, 'user')").run(id, position);
        }
      });
    })();
  }

  // ---- Generation ------------------------------------------------------------------------

  /**
   * Replaces a goal's generated, unfinished items and its milestones with a new plan. Items the
   * student added, edited or finished stay. Everything happens in one transaction.
   */
  replaceGenerated(goalId: string, plan: GeneratedPlan): void {
    const db = this.db;
    db.transaction(() => {
      const stale = db
        .prepare(
          "SELECT p.id FROM plan_items p JOIN plan_item_meta m ON m.item_id = p.id WHERE p.goal_id = ? AND m.source = 'generated' AND p.status != 'completed'"
        )
        .all(goalId) as Array<{ id: string }>;
      for (const { id } of stale) {
        db.prepare('DELETE FROM plan_item_meta WHERE item_id = ?').run(id);
        db.prepare('DELETE FROM plan_items WHERE id = ?').run(id);
      }
      db.prepare('DELETE FROM plan_milestones WHERE goal_id = ?').run(goalId);

      const milestoneByWeek = new Map<string, string>();
      plan.milestones.forEach((m, position) => {
        const id = this.newId();
        db.prepare('INSERT INTO plan_milestones (id, goal_id, week_start, title, position) VALUES (?, ?, ?, ?, ?)').run(id, goalId, m.week_start, m.title, position);
        milestoneByWeek.set(m.week_start, id);
      });

      let position = this.nextPosition(goalId);
      const items = [...plan.items].sort((a, b) => a.due_date.localeCompare(b.due_date));
      for (const item of items) {
        const id = this.newId();
        db.prepare("INSERT INTO plan_items (id, goal_id, title, due_date, status, notes) VALUES (?, ?, ?, ?, 'pending', ?)").run(
          id,
          goalId,
          item.title,
          item.due_date,
          item.notes ?? null
        );
        db.prepare("INSERT INTO plan_item_meta (item_id, position, milestone_id, estimated_hours, source) VALUES (?, ?, ?, ?, 'generated')").run(
          id,
          position++,
          item.milestone_week ? (milestoneByWeek.get(item.milestone_week) ?? null) : null,
          item.estimated_hours ?? null
        );
      }

      db.prepare(
        'INSERT INTO plan_goal_meta (goal_id, rationale, generated_at) VALUES (?, ?, ?) ON CONFLICT(goal_id) DO UPDATE SET rationale = excluded.rationale, generated_at = excluded.generated_at'
      ).run(goalId, plan.rationale, this.now());
    })();
  }

  // ---- Helpers ---------------------------------------------------------------------------

  private listItemIds(goalId: string): string[] {
    const rows = this.db
      .prepare(
        'SELECT p.id FROM plan_items p LEFT JOIN plan_item_meta m ON m.item_id = p.id WHERE p.goal_id = ? ORDER BY COALESCE(m.position, 1000000), p.rowid'
      )
      .all(goalId) as Array<{ id: string }>;
    return rows.map((r) => r.id);
  }

  private nextPosition(goalId: string): number {
    const row = this.db
      .prepare('SELECT MAX(m.position) AS max FROM plan_item_meta m JOIN plan_items p ON p.id = m.item_id WHERE p.goal_id = ?')
      .get(goalId) as { max: number | null };
    return (row.max ?? -1) + 1;
  }
}
