import type Database from 'better-sqlite3';
import type { ReportProse, SessionFacts } from './types.js';

// One report per study session (table session_reports, migration 206). Local only; removed by
// "Clear all data".

export interface StoredReport {
  sessionId: string;
  createdAt: number;
  /** pending: being written; ready: done (prose may be null when there was nothing to write about). */
  status: 'pending' | 'ready' | 'failed';
  facts: SessionFacts;
  prose: ReportProse | null;
  /** Why the prose is missing (quota, no connection), for the page. */
  error?: string;
}

export class ReportStore {
  constructor(private readonly db: () => Database.Database) {}

  save(report: StoredReport): void {
    this.db()
      .prepare(
        `INSERT INTO session_reports (session_id, created_at, status, report_json) VALUES (?, ?, ?, ?)
         ON CONFLICT(session_id) DO UPDATE SET created_at = excluded.created_at, status = excluded.status, report_json = excluded.report_json`
      )
      .run(report.sessionId, report.createdAt, report.status, JSON.stringify(report));
  }

  get(sessionId: string): StoredReport | null {
    const row = this.db().prepare('SELECT report_json FROM session_reports WHERE session_id = ?').get(sessionId) as
      | { report_json: string }
      | undefined;
    return row ? (JSON.parse(row.report_json) as StoredReport) : null;
  }

  /** Newest first. */
  list(limit = 50): StoredReport[] {
    return (this.db().prepare('SELECT report_json FROM session_reports ORDER BY created_at DESC LIMIT ?').all(limit) as Array<{ report_json: string }>).map(
      (r) => JSON.parse(r.report_json) as StoredReport
    );
  }
}
