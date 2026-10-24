import type Database from 'better-sqlite3';
import type { Migration } from './migration.js';

// Agent A's migrations. Names: 1xx_a_<what> (e.g. 101_a_...). Additive only; never depend on
// the other agent's tables. Only Agent A edits this file.
export function migrations(_db: Database.Database): Migration[] {
  return [];
}

/** Tables created here, so "Clear all data" and export include them. */
export const tables: readonly string[] = [];
