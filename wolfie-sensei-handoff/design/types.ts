// Draft data model behind the redesigned pages. Every number in the mockups maps to one of these.
// Adjust names to match your codebase; keep the relationships.

export type CourseCode = string; // e.g. "CSE 373"
export type TopicId = string;    // e.g. "dynamic-programming"

export interface Course {
  code: CourseCode;
  name: string;           // "Analysis of Algorithms"
  brightspaceId: string;
}

export interface Topic {
  id: TopicId;
  name: string;           // "Dynamic programming"
  course: CourseCode;
}

/** One focus/study session started with the START SESSION button. */
export interface Session {
  id: string;
  startedAt: string;      // ISO 8601
  endedAt: string | null; // null while running
  plannedMinutes: 25 | 50 | 90 | number;
  course: CourseCode | null;
  studying: string;       // free text from "What are you studying?"
  topics: TopicId[];      // resolved topics (suggested or detected)
  focusScore: number | null; // 0-100, feeds the productivity curve
}

export type Outcome = 'solved' | 'hinted' | 'stuck';

/** One problem worked inside a session. Drives the report timeline. */
export interface ProblemAttempt {
  id: string;
  sessionId: string;
  title: string;          // "Longest common subsequence"
  topic: TopicId;
  startedAt: string;
  minutes: number;
  outcome: Outcome;       // SOLVED / HINTED / STUCK tags
  hintsUsed: number;
  attemptWrittenFirst: boolean; // wrote an attempt before any AI unlock
  aiUnlocked: boolean;    // AI site was opened for this problem
  note?: string;          // "Missed the base case on the first pass."
}

/** Emitted by the extension/overlay. The streak is computed from these. */
export interface GateEvent {
  id: string;
  at: string;
  site: string;           // "claude.ai"
  action: 'warned' | 'gated' | 'blocked' | 'unlocked';
  sessionId: string | null;
  attemptChars: number | null; // length of the attempt written before unlock
  unlockMinutes: number | null;
}

export type DayStatus = 'clean' | 'leaned-on-ai' | 'no-session' | 'open'; // gold / X / dark / outline

export interface StreakSummary {
  current: number;        // 9
  best: number;           // 14
  days: { date: string; status: DayStatus }[]; // last 14 days, Mon-first grid
  triedFirstRate: number; // 0-1  ("Tried first 86%")
  aiShareOfTime: number;  // 0-1  (0.11) compared to settings.aiShareCap
  solvedUnaidedRate: number; // 0-1 (0.68)
}

/** A day is clean when: every unlock followed an attempt >= attemptLength chars,
 *  and AI minutes / study minutes <= aiShareCap, and at least one session ran. */
export interface IndependenceRules {
  attemptLength: number;  // 20 (characters)
  unlockMinutes: number;  // 15
  aiShareCap: number;     // 0.20
  tryFirstMinutes: number; // 10
}

export type Band = 'weak' | 'getting-there' | 'strong';

/** Computed, not stored. score10 = round(weightedUnaidedRate * 10), recent sessions weighted higher. */
export interface TopicScore {
  topic: TopicId;
  score10: number;        // 0-10, shown as the 10-block SegBar
  band: Band;             // <=4 weak, 5-6 getting there, >=7 strong
  unaidedSolved: number;  // "4 of 14 unaided"
  attempted: number;
  changeVsTwoWeeks: number; // -1 / 0 / +1 label
  usualStall?: string;    // "Defining the subproblem"
}

export interface HourlyFocus {
  hour: number;           // 6..23
  score: number;          // 0-100, average over the last 14 days
}

export interface BrightspaceItem {
  id: string;
  course: CourseCode;
  title: string;
  kind: 'slides' | 'pdf' | 'problem-set' | 'video';
  topic: TopicId | null;
  postedAt: string;
  dueAt: string | null;
  isNew: boolean;
  matchesWeakSpot: boolean; // computed: topic's band === 'weak'
}

export interface Settings {
  connections: { extensionPaired: boolean; brightspaceSyncedAt: string | null; semester: string };
  powers: { overlay: boolean; screenRecording: boolean; voice: boolean };
  reports: { recordProblems: boolean; showProductivityCurve: boolean; weeklyReport: boolean };
  independence: IndependenceRules;
  appearance: { pixelScale: 1 | 2 | 3; reduceMotion: boolean; soundEffects: boolean };
}
