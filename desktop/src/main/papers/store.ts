import { randomUUID } from 'crypto';
import type Database from 'better-sqlite3';
import type { PaperStatus, PaperView } from '../../common/ipc-intelligence.js';

// SQLite access for papers. Core owns `papers` and `paper_questions`; B adds `paper_meta`
// (authors, year, arXiv id) and `paper_chunks` (extracted text, B8) in migration 203_b_papers.

export class PaperNotFoundError extends Error {}

interface PaperRow {
  id: string;
  goal_id: string | null;
  title: string;
  url_or_path: string;
  status: PaperStatus;
  added_at: number;
  authors_json: string | null;
  year: number | null;
  arxiv_id: string | null;
  questions: number;
  chunks: number;
}

const SELECT = `
  SELECT p.id, p.goal_id, p.title, p.url_or_path, p.status, p.added_at,
         m.authors_json, m.year, m.arxiv_id,
         (SELECT COUNT(*) FROM paper_questions q WHERE q.paper_id = p.id) AS questions,
         (SELECT COUNT(*) FROM paper_chunks c WHERE c.paper_id = p.id) AS chunks
  FROM papers p LEFT JOIN paper_meta m ON m.paper_id = p.id`;

function toView(row: PaperRow): PaperView {
  return {
    id: row.id,
    goalId: row.goal_id,
    title: row.title,
    urlOrPath: row.url_or_path,
    status: row.status,
    addedAt: row.added_at,
    authors: row.authors_json ? (JSON.parse(row.authors_json) as string[]) : [],
    year: row.year,
    arxivId: row.arxiv_id,
    questionCount: row.questions,
    readable: row.chunks > 0
  };
}

export interface NewPaper {
  title: string;
  urlOrPath: string;
  goalId?: string | null;
  authors?: string[];
  year?: number | null;
  arxivId?: string | null;
  source?: string;
}

export class PapersStore {
  constructor(
    private readonly getDb: () => Database.Database,
    private readonly now: () => number = Date.now,
    private readonly newId: () => string = randomUUID
  ) {}

  private get db(): Database.Database {
    return this.getDb();
  }

  list(): PaperView[] {
    return (this.db.prepare(`${SELECT} ORDER BY p.added_at DESC, p.rowid DESC`).all() as PaperRow[]).map(toView);
  }

  get(id: string): PaperView {
    const row = this.db.prepare(`${SELECT} WHERE p.id = ?`).get(id) as PaperRow | undefined;
    if (!row) throw new PaperNotFoundError(`No paper ${id}`);
    return toView(row);
  }

  /** An existing paper with the same link or arXiv id, if any. */
  findDuplicate(urlOrPath: string, arxivId?: string | null): PaperView | null {
    const row = this.db
      .prepare(`${SELECT} WHERE p.url_or_path = ? OR (? IS NOT NULL AND m.arxiv_id = ?) LIMIT 1`)
      .get(urlOrPath, arxivId ?? null, arxivId ?? null) as PaperRow | undefined;
    return row ? toView(row) : null;
  }

  add(paper: NewPaper): PaperView {
    const id = this.newId();
    const db = this.db;
    db.transaction(() => {
      db.prepare("INSERT INTO papers (id, goal_id, title, url_or_path, status, added_at) VALUES (?, ?, ?, ?, 'pending', ?)").run(
        id,
        paper.goalId ?? null,
        paper.title,
        paper.urlOrPath,
        this.now()
      );
      db.prepare('INSERT INTO paper_meta (paper_id, authors_json, year, arxiv_id, source) VALUES (?, ?, ?, ?, ?)').run(
        id,
        JSON.stringify(paper.authors ?? []),
        paper.year ?? null,
        paper.arxivId ?? null,
        paper.source ?? null
      );
    })();
    return this.get(id);
  }

  setStatus(id: string, status: PaperStatus): PaperView {
    this.get(id);
    this.db.prepare('UPDATE papers SET status = ? WHERE id = ?').run(status, id);
    return this.get(id);
  }

  delete(id: string): void {
    this.get(id);
    const db = this.db;
    db.transaction(() => {
      db.prepare('DELETE FROM paper_questions WHERE paper_id = ?').run(id);
      db.prepare('DELETE FROM paper_chunks WHERE paper_id = ?').run(id);
      db.prepare('DELETE FROM paper_meta WHERE paper_id = ?').run(id);
      db.prepare('DELETE FROM papers WHERE id = ?').run(id);
    })();
  }
}
