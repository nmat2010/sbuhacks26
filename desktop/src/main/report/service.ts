import type { CategorySeconds } from '../../common/ipc-sensing.js';
import type { LlmCall } from '../llm/client.js';
import { renderPrompt } from '../llm/prompts/index.js';
import { LLMError } from '../llm/provider.js';
import type { ReportStore, StoredReport } from './store.js';
import { isRealQuestion, mergeProblemFacts, mergeSourceFacts } from './tracker.js';
import { ReportProseSchema, type ProblemFact, type SessionFacts, type SourceFact } from './types.js';

// Writes the report for a finished study session: the app gathers the facts (time, sources,
// timeline, problems and how each went), the model writes the headline, summary, strengths,
// weaknesses and next steps. Without the model (quota, offline) the facts-only report is kept.

export interface SessionSnapshot {
  sources: SourceFact[];
  timeline: SessionFacts['timeline'];
  problems: ProblemFact[];
  questionsAsked: string[];
  generalHelp: number;
}

export interface ReportServiceDeps {
  now: () => number;
  store: ReportStore;
  llm: () => { generate<T>(call: LlmCall<T>): Promise<T> };
  /** The session's numbers (history-get), or null if it isn't in the database. */
  sessionNumbers: (sessionId: string) => {
    startedAt: number;
    endedAt: number | null;
    seconds: CategorySeconds;
    hintCount: number;
    deepestHintLevel: number;
  } | null;
  /** When the session left for distracting or AI sites. */
  drifts?: (sessionId: string) => NonNullable<SessionFacts['drifts']>;
  /** A report changed (pending, ready): tell the dashboard. */
  onUpdated?: (sessionId: string) => void;
  /** Skills already in the student's record, so the report reuses their names (no duplicates). */
  knownSkills?: () => string[];
  /** A report was written (its topics go into the strengths & weaknesses record). */
  onWritten?: (report: StoredReport) => void;
  log?: (line: string) => void;
}

export class ReportService {
  constructor(private readonly deps: ReportServiceDeps) {}

  /** The session ended: save its facts now (memory is about to be cleared), then write the report. */
  async sessionEnded(sessionId: string, snapshot: SessionSnapshot): Promise<StoredReport | null> {
    const numbers = this.deps.sessionNumbers(sessionId);
    if (!numbers) return null;
    const facts: SessionFacts = {
      sessionId,
      startedAt: numbers.startedAt,
      endedAt: numbers.endedAt,
      watched: snapshot.sources.length > 0 || snapshot.timeline.length > 0,
      seconds: numbers.seconds,
      hintCount: numbers.hintCount,
      deepestHintLevel: numbers.deepestHintLevel,
      drifts: this.deps.drifts?.(sessionId) ?? [],
      ...snapshot
    };
    return this.write(facts);
  }

  /** Writes the report again from the saved facts (e.g. after the quota reset). */
  async regenerate(sessionId: string): Promise<StoredReport | null> {
    const existing = this.deps.store.get(sessionId);
    return existing ? this.write(existing.facts) : null;
  }

  private async write(raw: SessionFacts): Promise<StoredReport> {
    const { deps } = this;
    // Tidy saved facts too (a report rewritten from before names were stable): one entry per
    // source and per problem, and real questions only
    const facts: SessionFacts = {
      ...raw,
      sources: mergeSourceFacts(raw.sources),
      problems: mergeProblemFacts(raw.problems),
      questionsAsked: raw.questionsAsked.filter(isRealQuestion)
    };
    const base = { sessionId: facts.sessionId, createdAt: deps.now(), facts };
    // Nothing studied that Wolfie could see: the numbers are the report
    if (!hasContent(facts)) {
      const report: StoredReport = { ...base, status: 'ready', prose: null };
      deps.store.save(report);
      deps.onUpdated?.(facts.sessionId);
      return report;
    }
    deps.store.save({ ...base, status: 'pending', prose: null });
    deps.onUpdated?.(facts.sessionId);
    let report: StoredReport;
    try {
      const prose = await deps.llm().generate({
        task: 'session_report',
        system: renderPrompt('session-report.v3'),
        messages: [{ role: 'user', content: JSON.stringify({ ...promptFacts(facts), known_skills: deps.knownSkills?.() ?? [] }) }],
        schema: ReportProseSchema,
        mockKey: { problems: facts.problems.map((p) => ({ question: p.question, outcome: p.outcome })), sources: facts.sources.map((s) => s.title) },
        temperature: 0.3
      });
      report = { ...base, status: 'ready', prose };
    } catch (error) {
      deps.log?.(`[report] writing failed: ${(error as Error).message}`);
      report = { ...base, status: 'failed', prose: null, error: friendly(error) };
    }
    deps.store.save(report);
    deps.onUpdated?.(facts.sessionId);
    if (report.prose) deps.onWritten?.(report);
    return report;
  }
}

function hasContent(facts: SessionFacts): boolean {
  return facts.sources.length > 0 || facts.problems.length > 0 || facts.questionsAsked.length > 0;
}

/** The facts as the model sees them (minutes, no ids or URLs it doesn't need). */
function promptFacts(facts: SessionFacts) {
  const min = (s: number) => Math.round(s / 60);
  return {
    minutes: { focused_work: min(facts.seconds.work), ai_tools: min(facts.seconds.ai_tool), distracted: min(facts.seconds.distraction), idle: min(facts.seconds.idle) },
    hints_asked: facts.hintCount,
    sources: facts.sources.map((s) => ({ kind: s.kind, title: s.title, minutes: s.minutes, locators: s.locators, points: s.points })),
    timeline: facts.timeline.map((t) => ({ minutes_in: Math.round((t.from - facts.startedAt) / 60_000), activity: t.activity, summary: t.summary })),
    problems: facts.problems,
    questionsAsked: facts.questionsAsked,
    general_help_requests: facts.generalHelp,
    drifts: facts.drifts ?? []
  };
}

function friendly(error: unknown): string {
  if (error instanceof LLMError && (error.code === 'QUOTA' || error.code === 'DAILY_CAP')) {
    return "Today's AI limit is used up, so the written report is missing. Try again tomorrow.";
  }
  return "Wolfie couldn't write the report just now. Try again in a moment.";
}
