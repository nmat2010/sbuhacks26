import type Database from 'better-sqlite3';
import { getDatabase } from '../db/index.js';

/** Counts provider calls per local day for the `api.call_limit_per_day` cap (SPEC 6). */
export interface UsageStore {
  get(day: string): number;
  increment(day: string): number;
}

export class MemoryUsageStore implements UsageStore {
  private counts = new Map<string, number>();
  get(day: string): number {
    return this.counts.get(day) ?? 0;
  }
  increment(day: string): number {
    const next = this.get(day) + 1;
    this.counts.set(day, next);
    return next;
  }
}

/** Persists the count in `llm_usage` (migration 201_b_llm_usage) so a restart does not reset the cap. */
export class SqliteUsageStore implements UsageStore {
  constructor(private readonly getDb: () => Database.Database = getDatabase) {}
  get(day: string): number {
    const row = this.getDb().prepare('SELECT calls FROM llm_usage WHERE day = ?').get(day) as
      | { calls: number }
      | undefined;
    return row?.calls ?? 0;
  }
  increment(day: string): number {
    this.getDb()
      .prepare('INSERT INTO llm_usage (day, calls) VALUES (?, 1) ON CONFLICT(day) DO UPDATE SET calls = calls + 1')
      .run(day);
    return this.get(day);
  }
}

/** Local calendar date, YYYY-MM-DD. */
export function localDay(ts: number): string {
  const d = new Date(ts);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}
