import type { Observation } from '../watch/types.js';
import { nameKey, sameName, sameTitle } from '../watch/similar.js';
import type { ProblemFact, ProblemOutcome, SourceFact } from './types.js';

// Follows each problem during a study session, for its report: answers Watch mode checked (right
// or wrong), long pauses, the hints used and "Show the answer", plus the questions asked in the
// chat. Text only, in memory until the session ends; the report keeps a summary.

const MAX_PROBLEMS = 30;
const MAX_QUESTIONS = 20;

interface Problem {
  question: string;
  /** Other wordings it was seen under (the first is `question`). */
  aliases: string[];
  firstSeen: number;
  wrongAnswers: Set<string>;
  issues: string[];
  correct: boolean;
  hintLevel: number;
  answerShown: boolean;
  stalled: boolean;
}

/** One problem's names: see watch/similar.ts. */
export const problemKey = nameKey;
export const sameProblem = (a: string, b: string): boolean => sameName(a, b);

/** A real question to Wolfie, not chat ("how about now?", "thanks, I'm good"). */
export function isRealQuestion(text: string): boolean {
  const t = text.trim();
  const count = t.split(/\s+/).length;
  if (t.includes('?')) return count >= 4;
  return (
    /^(how|what|why|when|where|which|who|can|could|should|would|is|are|does|do|explain|tell me)\b/i.test(t) ||
    /\b(how|why|what)\b.*\b(should|do|does|is|are|can|would|to)\b/i.test(t)
  );
}

/** Sources that turned out to be one (titles worded differently, no URL to tell): merged. */
export function mergeSourceFacts(sources: SourceFact[]): SourceFact[] {
  const out: SourceFact[] = [];
  const titles = new Map<SourceFact, string[]>();
  for (const s of sources) {
    const same = out.find((o) => (o.url && s.url ? o.url === s.url : titles.get(o)!.some((t) => sameTitle(t, s.title))));
    if (!same) {
      const first = { ...s, locators: [...s.locators], points: [...s.points] };
      out.push(first);
      titles.set(first, [s.title]);
      continue;
    }
    titles.get(same)!.push(s.title);
    same.minutes += s.minutes;
    same.url ??= s.url;
    for (const l of s.locators) if (!same.locators.includes(l)) same.locators.push(l);
    for (const p of s.points) if (!same.points.includes(p) && same.points.length < 6) same.points.push(p);
  }
  return out;
}

/** Problems that turned out to be one (saved before names were stable): merged, outcomes combined. */
export function mergeProblemFacts(problems: ProblemFact[]): ProblemFact[] {
  const out: ProblemFact[] = [];
  // Every name a merged problem was seen under: a new wording may match any of them
  const names = new Map<ProblemFact, string[]>();
  for (const p of problems) {
    const same = out.find((q) => names.get(q)!.some((n) => sameProblem(n, p.question)));
    if (!same) {
      const first = { ...p, issues: [...p.issues] };
      out.push(first);
      names.set(first, [p.question]);
      continue;
    }
    names.get(same)!.push(p.question);
    const outcomes = [same.outcome, p.outcome];
    same.wrongAttempts += p.wrongAttempts;
    same.hintLevel = Math.max(same.hintLevel, p.hintLevel);
    same.stalled ||= p.stalled;
    for (const issue of p.issues) if (!same.issues.includes(issue) && same.issues.length < 3) same.issues.push(issue);
    same.outcome = outcomes.includes('answer_shown')
      ? 'answer_shown'
      : outcomes.some((o) => o === 'solved_alone' || o === 'solved_with_help')
        ? same.hintLevel === 0 && same.wrongAttempts === 0 && outcomes.every((o) => o !== 'solved_with_help')
          ? 'solved_alone'
          : 'solved_with_help'
        : 'unresolved';
  }
  return out;
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

  /** A question asked in the chat or by voice (chat like "thanks, all good" is left out). */
  asked(question: string): void {
    const q = question.trim();
    if (q && isRealQuestion(q) && this.questions.length < MAX_QUESTIONS) this.questions.push(q.slice(0, 200));
  }

  /** Names of the problems seen so far (oldest first), so the watcher keeps using them. */
  names(): string[] {
    return [...this.problems.values()].sort((a, b) => a.firstSeen - b.firstSeen).map((p) => p.question);
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
    // The same problem under another wording keeps its first name
    let p = this.problems.get(key) ?? [...this.problems.values()].find((x) => [x.question, ...x.aliases].some((n) => sameProblem(n, question)));
    if (p && problemKey(p.question) !== key && !p.aliases.some((a) => problemKey(a) === key) && p.aliases.length < 10) p.aliases.push(question.trim());
    if (!p) {
      if (this.problems.size >= MAX_PROBLEMS) return null;
      p = { question: question.trim().slice(0, 200), aliases: [], firstSeen: now, wrongAnswers: new Set(), issues: [], correct: false, hintLevel: 0, answerShown: false, stalled: false };
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
