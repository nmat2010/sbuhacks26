import type { Observation } from '../watch/types.js';
import type { ProblemFact, ProblemOutcome } from './types.js';

// Follows each problem during a study session, for its report: answers Watch mode checked (right
// or wrong), long pauses, the hints used and "Show the answer", plus the questions asked in the
// chat. Text only, in memory until the session ends; the report keeps a summary.

const MAX_PROBLEMS = 30;
const MAX_QUESTIONS = 20;

interface Problem {
  question: string;
  firstSeen: number;
  wrongAnswers: Set<string>;
  issues: string[];
  correct: boolean;
  hintLevel: number;
  answerShown: boolean;
  stalled: boolean;
}

export function problemKey(question: string): string {
  return question.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

export class SessionTracker {
  private problems = new Map<string, Problem>();
  private questions: string[] = [];
  private generalHelp = 0;

  /** A Watch-mode look: the answers it checked and the question still unanswered. */
  observe(obs: Observation, now: number): void {
    for (const check of obs.answer_checks) {
      if (!check.question?.trim()) continue;
      const p = this.problem(check.question, now);
      if (!p) continue;
      if (check.looks_correct === true) p.correct = true;
      else if (check.looks_correct === false && check.visible_answer) {
        p.correct = false;
        p.wrongAnswers.add(check.visible_answer.trim().toLowerCase());
        const issue = check.issue?.trim();
        if (issue && !p.issues.includes(issue) && p.issues.length < 3) p.issues.push(issue);
      }
    }
    if (obs.unanswered_question?.trim()) this.problem(obs.unanswered_question, now);
  }

  /** A long pause on a question (the timed one, or "I'm stuck"). */
  stalled(question: string, now: number): void {
    const p = this.problem(question, now);
    if (p) p.stalled = true;
  }

  /** A hint ladder closed: on a problem (Watch mode's focus) or on whatever was on screen. */
  help(question: string | null, deepestLevel: number, now: number): void {
    const p = question ? this.problem(question, now) : null;
    if (!p) {
      this.generalHelp++;
      return;
    }
    p.hintLevel = Math.max(p.hintLevel, deepestLevel);
    if (deepestLevel >= 5) p.answerShown = true;
  }

  asked(question: string): void {
    const q = question.trim();
    if (q && this.questions.length < MAX_QUESTIONS) this.questions.push(q.slice(0, 200));
  }

  snapshot(): { problems: ProblemFact[]; questionsAsked: string[]; generalHelp: number } {
    const problems = [...this.problems.values()]
      .sort((a, b) => a.firstSeen - b.firstSeen)
      .map((p) => ({
        question: p.question,
        outcome: outcomeOf(p),
        wrongAttempts: p.wrongAnswers.size,
        issues: [...p.issues],
        hintLevel: p.hintLevel,
        stalled: p.stalled
      }));
    return { problems, questionsAsked: [...this.questions], generalHelp: this.generalHelp };
  }

  reset(): void {
    this.problems.clear();
    this.questions = [];
    this.generalHelp = 0;
  }

  private problem(question: string, now: number): Problem | null {
    const key = problemKey(question);
    if (!key) return null;
    let p = this.problems.get(key);
    if (!p) {
      if (this.problems.size >= MAX_PROBLEMS) return null;
      p = { question: question.trim().slice(0, 200), firstSeen: now, wrongAnswers: new Set(), issues: [], correct: false, hintLevel: 0, answerShown: false, stalled: false };
      this.problems.set(key, p);
    }
    return p;
  }
}

function outcomeOf(p: Problem): ProblemOutcome {
  if (p.answerShown) return 'answer_shown';
  if (!p.correct) return 'unresolved';
  return p.hintLevel === 0 && p.wrongAnswers.size === 0 ? 'solved_alone' : 'solved_with_help';
}
