import type Database from 'better-sqlite3';
import { getDatabase } from '../db/index.js';
import { normalizeTitle, titlesMatch, type PaperRecord, type PaperSearcher } from './types.js';

// "Do not trust model-generated citations" (SPEC Phase 6): every recommended paper is looked up
// by title, one at a time, and only kept if a search API returns a paper whose normalized title
// matches. Results are cached, and "could not check" (network, 429) is told apart from "checked
// and not found" so a bad connection never labels a real paper as fake.

export interface Candidate {
  title: string;
  authors?: string[];
  year?: number;
}

export type VerifyResult =
  | { status: 'verified'; paper: PaperRecord }
  | { status: 'not_found' }
  | { status: 'unavailable' };

interface CacheEntry {
  found: boolean;
  paper?: PaperRecord;
  checkedAt: number;
}

export interface VerifyCache {
  get(key: string): CacheEntry | null;
  set(key: string, entry: CacheEntry): void;
}

export class MemoryVerifyCache implements VerifyCache {
  private map = new Map<string, CacheEntry>();
  get(key: string) {
    return this.map.get(key) ?? null;
  }
  set(key: string, entry: CacheEntry) {
    this.map.set(key, entry);
  }
}

/** Persists lookups in `paper_lookup_cache` (migration 203_b_papers). */
export class SqliteVerifyCache implements VerifyCache {
  constructor(private readonly getDb: () => Database.Database = getDatabase) {}
  get(key: string): CacheEntry | null {
    const row = this.getDb().prepare('SELECT found, result_json, checked_at FROM paper_lookup_cache WHERE key = ?').get(key) as
      | { found: number; result_json: string | null; checked_at: number }
      | undefined;
    if (!row) return null;
    return { found: row.found === 1, paper: row.result_json ? (JSON.parse(row.result_json) as PaperRecord) : undefined, checkedAt: row.checked_at };
  }
  set(key: string, entry: CacheEntry): void {
    this.getDb()
      .prepare(
        'INSERT INTO paper_lookup_cache (key, found, result_json, checked_at) VALUES (?, ?, ?, ?) ON CONFLICT(key) DO UPDATE SET found = excluded.found, result_json = excluded.result_json, checked_at = excluded.checked_at'
      )
      .run(key, entry.found ? 1 : 0, entry.paper ? JSON.stringify(entry.paper) : null, entry.checkedAt);
  }
}

export const POSITIVE_TTL_MS = 30 * 24 * 3600_000;
export const NEGATIVE_TTL_MS = 24 * 3600_000;

export class PaperVerifier {
  constructor(
    private readonly searchers: PaperSearcher[],
    private readonly cache: VerifyCache = new MemoryVerifyCache(),
    private readonly now: () => number = Date.now,
    private readonly log: (line: string) => void = () => undefined
  ) {}

  async verify(candidate: Candidate): Promise<VerifyResult> {
    const key = normalizeTitle(candidate.title);
    if (!key) return { status: 'not_found' };

    const cached = this.cache.get(key);
    if (cached) {
      const age = this.now() - cached.checkedAt;
      if (cached.found && cached.paper && age < POSITIVE_TTL_MS) return { status: 'verified', paper: cached.paper };
      if (!cached.found && age < NEGATIVE_TTL_MS) return { status: 'not_found' };
    }

    let answered = false;
    for (const searcher of this.searchers) {
      try {
        const results = await searcher.searchByTitle(candidate.title);
        answered = true;
        const match = results.find((r) => titlesMatch(candidate.title, r.title));
        if (match) {
          this.cache.set(key, { found: true, paper: match, checkedAt: this.now() });
          return { status: 'verified', paper: match };
        }
      } catch (error) {
        this.log(`[papers] ${searcher.name} unavailable: ${(error as Error).message}`);
      }
    }
    if (!answered) return { status: 'unavailable' }; // not cached: try again next time
    this.cache.set(key, { found: false, checkedAt: this.now() });
    return { status: 'not_found' };
  }

  /**
   * Verifies candidates one at a time (the APIs are rate limited) and stops at `max` verified.
   * Returns the verified records in order, how many were dropped, and whether checking failed.
   */
  async verifyMany(
    candidates: Candidate[],
    max = 5
  ): Promise<{ verified: Array<{ candidate: Candidate; paper: PaperRecord }>; dropped: number; unavailable: number }> {
    const verified: Array<{ candidate: Candidate; paper: PaperRecord }> = [];
    const seen = new Set<string>();
    let dropped = 0;
    let unavailable = 0;
    for (const candidate of candidates) {
      if (verified.length >= max) break;
      const key = normalizeTitle(candidate.title);
      if (seen.has(key)) continue; // the model listed it twice
      seen.add(key);
      const result = await this.verify(candidate);
      if (result.status === 'verified') verified.push({ candidate, paper: result.paper });
      else {
        dropped++;
        if (result.status === 'unavailable') unavailable++;
      }
    }
    return { verified, dropped, unavailable };
  }
}
