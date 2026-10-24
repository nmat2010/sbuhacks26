import type Database from 'better-sqlite3';
import type { Migration } from './migration.js';

// Agent B's migrations. Names: 2xx_b_<what> (e.g. 201_b_...). Additive only; never depend on
// the other agent's tables. Only Agent B edits this file.
//
// B's tables deliberately declare no foreign keys, so "Clear all data" can delete them in any
// order. Code that deletes a goal or plan item cleans up the matching rows itself.
export function migrations(db: Database.Database): Migration[] {
  return [
    {
      // B1: provider calls per local day, for api.call_limit_per_day
      name: '201_b_llm_usage',
      up: () => {
        db.exec(`
          CREATE TABLE IF NOT EXISTS llm_usage (
            day TEXT PRIMARY KEY,
            calls INTEGER NOT NULL DEFAULT 0
          );
        `);
      }
    },
    {
      // B6: onboarding answers (one row), plus what generation adds to core goals / plan_items
      name: '202_b_plan',
      up: () => {
        db.exec(`
          CREATE TABLE IF NOT EXISTS plan_onboarding (
            id INTEGER PRIMARY KEY CHECK(id = 1),
            input_json TEXT NOT NULL,
            updated_at INTEGER NOT NULL
          );

          CREATE TABLE IF NOT EXISTS plan_goal_meta (
            goal_id TEXT PRIMARY KEY,
            rationale TEXT,
            generated_at INTEGER
          );

          CREATE TABLE IF NOT EXISTS plan_milestones (
            id TEXT PRIMARY KEY,
            goal_id TEXT NOT NULL,
            week_start TEXT NOT NULL,
            title TEXT NOT NULL,
            position INTEGER NOT NULL
          );

          CREATE TABLE IF NOT EXISTS plan_item_meta (
            item_id TEXT PRIMARY KEY,
            position INTEGER NOT NULL,
            milestone_id TEXT,
            estimated_hours REAL,
            source TEXT NOT NULL DEFAULT 'generated' CHECK(source IN ('generated', 'user', 'paper'))
          );

          CREATE INDEX IF NOT EXISTS idx_plan_milestones_goal ON plan_milestones(goal_id);
        `);
      }
    }
  ];
}

/** Tables created here, so "Clear all data" and export include them. */
export const tables: readonly string[] = [
  'llm_usage',
  'plan_onboarding',
  'plan_goal_meta',
  'plan_milestones',
  'plan_item_meta'
];
