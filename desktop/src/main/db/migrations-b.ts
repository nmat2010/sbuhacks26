import type Database from 'better-sqlite3';
import type { Migration } from './migration.js';

// Agent B's migrations. Names: 2xx_b_<what> (e.g. 201_b_...). Additive only; never depend on
// the other agent's tables. Only Agent B edits this file.
export function migrations(_db: Database.Database): Migration[] {
  return [];
}

/** Tables created here, so "Clear all data" and export include them. */
export const tables: readonly string[] = [];
