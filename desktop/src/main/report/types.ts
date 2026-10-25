import { z } from 'zod';
import type { CategorySeconds } from '../../common/ipc-sensing.js';

// Session reports: what the student studied in a session, the problems and how each went, and
// strengths, weaknesses and next steps. Facts are gathered by the app; the model writes the prose.

/** How a problem ended this session. */
export type ProblemOutcome = 'solved_alone' | 'solved_with_help' | 'answer_shown' | 'unresolved';

export interface ProblemFact {
  question: string;
  outcome: ProblemOutcome;
  /** Different wrong answers Watch mode saw. */
  wrongAttempts: number;
  /** What looked off (Watch mode's short notes, never the answer). */
  issues: string[];
  /** Deepest hint level used (0-5). */
  hintLevel: number;
  /** A long pause on it with nothing written. */
  stalled: boolean;
}

export interface SourceFact {
  kind: string;
  title: string;
  url: string | null;
  minutes: number;
  /** Sections, pages or timestamps seen. */
  locators: string[];
  /** What was learned from it (Watch mode's key points). */
  points: string[];
}

export interface SessionFacts {
  sessionId: string;
  startedAt: number;
  endedAt: number | null;
  /** Watch mode followed the session (else only the numbers are known). */
  watched: boolean;
  seconds: CategorySeconds;
  hintCount: number;
  deepestHintLevel: number;
  sources: SourceFact[];
  /** What the student did, in order (back-to-back looks at one source merged). */
  timeline: Array<{ from: number; to: number; activity: string; summary: string }>;
  problems: ProblemFact[];
  /** Questions the student asked Wolfie. */
  questionsAsked: string[];
  /** Help asked for with no particular problem in focus. */
  generalHelp: number;
}

/** What the model writes from the facts. */
export const ReportProseSchema = z.object({
  headline: z.string().min(1).max(160),
  summary: z.string().min(1).max(900),
  topics: z
    .array(
      z.object({
        name: z.string().min(1).max(80),
        verdict: z.enum(['strength', 'weakness', 'practiced']),
        evidence: z.string().max(240),
        /** Steps to improve it (weaknesses only). */
        plan: z.array(z.string().min(1).max(200)).max(3).default([])
      })
    )
    .max(8)
    .default([]),
  next_steps: z.array(z.string().min(1).max(200)).max(5).default([])
});

export type ReportProse = z.infer<typeof ReportProseSchema>;
