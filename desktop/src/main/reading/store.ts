import type Database from 'better-sqlite3';
import type { PaperCitation, PaperQuestionView, ReadingMode } from '../../common/ipc-intelligence.js';
import type { PaperChunk } from './chunk.js';

// Chunks (paper_chunks) and saved questions (core paper_questions + B's paper_answer_meta).

export interface StoredChunk extends PaperChunk {
  id: number;
}

export class ReadingStore {
  constructor(
    private readonly getDb: () => Database.Database,
    private readonly now: () => number = Date.now
  ) {}

  private get db(): Database.Database {
    return this.getDb();
  }

  /** Replaces the paper's text. */
  saveChunks(paperId: string, chunks: PaperChunk[]): void {
    const db = this.db;
    db.transaction(() => {
      db.prepare('DELETE FROM paper_chunks WHERE paper_id = ?').run(paperId);
      const insert = db.prepare('INSERT INTO paper_chunks (paper_id, position, section, page, text) VALUES (?, ?, ?, ?, ?)');
      for (const c of chunks) insert.run(paperId, c.position, c.section, c.page, c.text);
    })();
  }

  getChunks(paperId: string): StoredChunk[] {
    return this.db
      .prepare('SELECT id, position, section, page, text FROM paper_chunks WHERE paper_id = ? ORDER BY position')
      .all(paperId) as StoredChunk[];
  }

  saveQuestion(entry: {
    paperId: string;
    question: string;
    answer: string;
    inputMode: 'text' | 'voice';
    mode: ReadingMode;
    grounded: boolean;
    citations: PaperCitation[];
  }): number {
    const db = this.db;
    let id = 0;
    db.transaction(() => {
      const res = db
        .prepare('INSERT INTO paper_questions (paper_id, question, answer, input_mode, ts) VALUES (?, ?, ?, ?, ?)')
        .run(entry.paperId, entry.question, entry.answer, entry.inputMode, this.now());
      id = Number(res.lastInsertRowid);
      db.prepare('INSERT INTO paper_answer_meta (question_id, mode, grounded, citations_json) VALUES (?, ?, ?, ?)').run(
        id,
        entry.mode,
        entry.grounded ? 1 : 0,
        JSON.stringify(entry.citations)
      );
    })();
    return id;
  }

  listQuestions(paperId: string): PaperQuestionView[] {
    const rows = this.db
      .prepare(
        `SELECT q.id, q.question, q.answer, q.input_mode, q.ts, m.mode, m.grounded, m.citations_json
         FROM paper_questions q LEFT JOIN paper_answer_meta m ON m.question_id = q.id
         WHERE q.paper_id = ? ORDER BY q.id`
      )
      .all(paperId) as Array<{
      id: number;
      question: string;
      answer: string;
      input_mode: 'text' | 'voice';
      ts: number;
      mode: ReadingMode | null;
      grounded: number | null;
      citations_json: string | null;
    }>;
    return rows.map((r) => ({
      id: r.id,
      question: r.question,
      answer: r.answer,
      inputMode: r.input_mode,
      ts: r.ts,
      mode: r.mode ?? 'explain',
      grounded: r.grounded === 1,
      citations: r.citations_json ? (JSON.parse(r.citations_json) as PaperCitation[]) : []
    }));
  }
}
