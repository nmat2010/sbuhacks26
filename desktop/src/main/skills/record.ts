import { randomUUID } from 'crypto';
import type Database from 'better-sqlite3';
import { nameKey, sameName } from '../watch/similar.js';

// The student's strengths and weaknesses across sessions: each skill ("Dynamic programming: base
// cases") with what every session showed about it. Fed by session reports; one skill per concept
// (a report's topic is matched to the record's skills first, so the record has no duplicates).

export type Verdict = 'strength' | 'weakness' | 'practiced';
/** improving: was a weakness, and the latest evidence shows it as a strength. */
export type SkillStatus = 'strength' | 'weakness' | 'improving' | 'touched';

export interface SkillEntry {
  sessionId: string;
  ts: number;
  verdict: Verdict;
  evidence: string;
}

export interface SkillRecord {
  id: string;
  name: string;
  /** Other names reports used for it. */
  aliases: string[];
  firstSeen: number;
  lastSeen: number;
  /** Oldest first. */
  history: SkillEntry[];
  /** Steps to improve it (from the latest report that found it weak). */
  plan: string[];
}

const MAX_HISTORY = 30;
const RANK: Record<Verdict, number> = { practiced: 0, strength: 1, weakness: 2 };

/**
 * Where the student stands on a skill, from the evidence (sessions that only touched on it don't
 * count): weak if the latest evidence says so; improving if it was weak before but the latest
 * says strong (strong again after that makes it a strength); touched if there's no evidence yet.
 */
export function skillStatus(history: SkillEntry[]): SkillStatus {
  const evidence = history.filter((e) => e.verdict !== 'practiced');
  const last = evidence.at(-1);
  if (!last) return 'touched';
  if (last.verdict === 'weakness') return 'weakness';
  const strongStreak = evidence.length - 1 - evidence.map((e) => e.verdict).lastIndexOf('weakness');
  const everWeak = evidence.some((e) => e.verdict === 'weakness');
  return everWeak && strongStreak < 2 ? 'improving' : 'strength';
}

export interface ReportTopic {
  name: string;
  verdict: Verdict;
  evidence: string;
  plan?: string[];
}

export class SkillRecordStore {
  constructor(
    private readonly db: () => Database.Database,
    private readonly now: () => number = Date.now
  ) {}

  list(): SkillRecord[] {
    return (this.db().prepare('SELECT record_json FROM skills ORDER BY updated_at DESC').all() as Array<{ record_json: string }>).map(
      (r) => JSON.parse(r.record_json) as SkillRecord
    );
  }

  isEmpty(): boolean {
    return (this.db().prepare('SELECT COUNT(*) AS n FROM skills').get() as { n: number }).n === 0;
  }

  /** The skill a topic name belongs to: same name, a name it was seen under, or a close match. */
  find(name: string, skills = this.list()): SkillRecord | null {
    const key = nameKey(name);
    return (
      skills.find((s) => [s.name, ...s.aliases].some((n) => nameKey(n) === key)) ??
      skills.find((s) => [s.name, ...s.aliases].some((n) => sameName(n, name))) ??
      null
    );
  }

  /**
   * A session's report: each topic goes into the skill it belongs to (or a new one). Replaces what
   * this session said before (a rewritten report), so nothing is counted twice.
   */
  /** Returns how many new skills it added (the record may then need tidying). */
  addSession(sessionId: string, ts: number, topics: ReportTopic[]): number {
    const skills = this.list();
    const changed = new Set<SkillRecord>();
    let added = 0;
    for (const s of skills) {
      const before = s.history.length;
      s.history = s.history.filter((e) => e.sessionId !== sessionId);
      if (s.history.length !== before) changed.add(s);
    }
    for (const topic of topics) {
      const name = topic.name.trim();
      if (!name) continue;
      let skill = this.find(name, skills);
      if (!skill) {
        skill = { id: randomUUID(), name, aliases: [], firstSeen: ts, lastSeen: ts, history: [], plan: [] };
        skills.push(skill);
        added++;
      } else if (nameKey(skill.name) !== nameKey(name) && !skill.aliases.some((a) => nameKey(a) === nameKey(name)) && skill.aliases.length < 10) {
        skill.aliases.push(name);
      }
      // One entry per session: when two topics of a report land on one skill, the more telling
      // verdict wins (weakness, then strength, then touched on)
      const entry: SkillEntry = { sessionId, ts, verdict: topic.verdict, evidence: topic.evidence.trim() };
      const same = skill.history.findIndex((e) => e.sessionId === sessionId);
      if (same < 0) {
        skill.history.push(entry);
        skill.history.sort((a, b) => a.ts - b.ts);
        skill.history = skill.history.slice(-MAX_HISTORY);
      } else if (RANK[entry.verdict] > RANK[skill.history[same].verdict]) {
        skill.history[same] = entry;
      }
      if (topic.verdict === 'weakness' && topic.plan?.length) skill.plan = topic.plan.slice(0, 3);
      changed.add(skill);
    }
    this.save(changed);
    return added;
  }

  /**
   * Skills that turned out to be one concept (named differently in different sessions): each
   * group becomes one skill under `name`, with all their sessions (one entry per session).
   */
  mergeGroups(groups: Array<{ name: string; members: string[] }>): number {
    const skills = this.list();
    const changed = new Set<SkillRecord>();
    let merged = 0;
    for (const group of groups) {
      const members = [...new Set(group.members.map((m) => skills.find((s) => nameKey(s.name) === nameKey(m))).filter((s): s is SkillRecord => !!s))];
      if (members.length < 2) continue;
      const target = members.find((s) => nameKey(s.name) === nameKey(group.name)) ?? members[0];
      for (const other of members) {
        if (other === target) continue;
        for (const e of other.history) {
          const same = target.history.findIndex((x) => x.sessionId === e.sessionId);
          if (same < 0) target.history.push(e);
          else if (RANK[e.verdict] > RANK[target.history[same].verdict]) target.history[same] = e;
        }
        for (const n of [other.name, ...other.aliases]) if (!target.aliases.includes(n) && nameKey(n) !== nameKey(target.name)) target.aliases.push(n);
        // The newer plan wins
        if (other.plan.length && (!target.plan.length || other.lastSeen > target.lastSeen)) target.plan = other.plan;
        other.history = [];
        changed.add(other);
        merged++;
      }
      if (group.name.trim() && nameKey(group.name) !== nameKey(target.name)) {
        if (!target.aliases.includes(target.name)) target.aliases.push(target.name);
        target.name = group.name.trim().slice(0, 80);
      }
      target.history.sort((a, b) => a.ts - b.ts);
      target.history = target.history.slice(-MAX_HISTORY);
      target.aliases = target.aliases.slice(-10);
      changed.add(target);
    }
    this.save(changed);
    return merged;
  }

  private save(changed: Set<SkillRecord>): void {
    const db = this.db();
    const save = db.prepare(
      `INSERT INTO skills (id, name, updated_at, record_json) VALUES (?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET name = excluded.name, updated_at = excluded.updated_at, record_json = excluded.record_json`
    );
    const remove = db.prepare('DELETE FROM skills WHERE id = ?');
    db.transaction(() => {
      for (const s of changed) {
        // No sessions left (only a rewritten report had named it, or it was merged into another)
        if (!s.history.length) {
          remove.run(s.id);
          continue;
        }
        s.firstSeen = s.history[0].ts;
        s.lastSeen = s.history[s.history.length - 1].ts;
        save.run(s.id, s.name, Math.max(s.lastSeen, this.now() - 1), JSON.stringify(s));
      }
    })();
  }

  /** Names for the report writer to reuse (most recent first). */
  names(limit = 40): string[] {
    return this.list()
      .sort((a, b) => b.lastSeen - a.lastSeen)
      .slice(0, limit)
      .map((s) => s.name);
  }
}
