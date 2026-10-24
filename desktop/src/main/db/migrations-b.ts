import type Database from 'better-sqlite3';
import type { Migration } from './migration.js';

// Agent B's migrations. Names: 2xx_b_<what> (e.g. 201_b_...). Additive only; never depend on
// the other agent's tables. Only Agent B edits this file.
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
    }
  ];
}

/** Tables created here, so "Clear all data" and export include them. */
export const tables: readonly string[] = ['llm_usage'];
