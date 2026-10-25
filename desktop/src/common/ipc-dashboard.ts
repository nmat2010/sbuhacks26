// Dashboard IPC channels (reports, topic scores, Brightspace material, dashboard prefs, problem
// logging). Merged into the maps in ipc.ts. Plain types only, so renderers can import them.

export type DashTimeFilter = 'week' | 'month' | 'all';
export type DashOutcome = 'solved' | 'hinted' | 'stuck';

export interface DashSession {
  id: string;
  startedAt: string;
  endedAt: string | null;
  plannedMinutes: number;
  course: string | null;
  studying: string;
  topics: string[];
  focusScore: number | null;
  solvedUnaided: number;
  totalProblems: number;
  /** Real elapsed minutes (to now for a running session). */
  minutes: number;
  aiUnlocks: number;
  hints: number;
}

export interface DashProblem {
  id: string;
  sessionId: string;
  title: string;
  topic: string;
  startedAt: string;
  minutes: number;
  outcome: DashOutcome;
  hintsUsed: number;
  attemptWrittenFirst: boolean;
  aiUnlocked: boolean;
  note?: string;
}

export interface DashProblemInput {
  title: string;
  topic: string;
  minutes: number;
  outcome: DashOutcome;
  hintsUsed?: number;
  attemptWrittenFirst?: boolean;
  aiUnlocked?: boolean;
  note?: string;
  /** Defaults to the running session. */
  sessionId?: string;
}

export interface DashTopicScore {
  topic: string;
  /** Human name: "Dynamic programming". */
  name: string;
  course: string | null;
  score10: number;
  band: 'weak' | 'getting-there' | 'strong';
  unaidedSolved: number;
  attempted: number;
  changeVsTwoWeeks: number;
  usualStall?: string;
}

export interface DashPracticeItem {
  title: string;
  estimatedMin: number;
}

export interface DashStreakDay {
  date: string;
  status: 'clean' | 'leaned-on-ai' | 'no-session' | 'open';
}

export interface DashSummary {
  streak: {
    current: number;
    best: number;
    days: DashStreakDay[];
    triedFirstRate: number;
    aiShareOfTime: number;
    solvedUnaidedRate: number;
  };
  hourlyFocus: Array<{ hour: number; score: number }>;
  latestSession: DashSession | null;
  latestProblems: DashProblem[];
  /** Topic hint for the "what are you studying" field (weakest topic name). */
  suggestedTopic: string | null;
  topics: DashTopicScore[];
  /** Independence rule: share of study time AI may take (0-1). */
  aiShareCap: number;
  showProductivityCurve: boolean;
  /** Recorded session ids that are running now (null when idle). */
  activeSessionId: string | null;
  senseiSays: string;
  level: number;
  xp: { current: number; max: number };
}

export interface DashMaterial {
  id: string;
  course: string;
  title: string;
  kind: 'slides' | 'pdf' | 'problem-set' | 'video';
  topic: string | null;
  postedAt: string;
  dueAt: string | null;
  isNew: boolean;
  matchesWeakSpot: boolean;
  url: string | null;
}

export interface DashPrefs {
  powers: { overlay: boolean; screenRecording: boolean; voice: boolean };
  reports: { recordProblems: boolean; showProductivityCurve: boolean; weeklyReport: boolean };
  independence: { attemptLength: number; unlockMinutes: number; aiShareCap: number; tryFirstMinutes: number };
  appearance: { pixelScale: 1 | 2 | 3; reduceMotion: boolean; soundEffects: boolean };
  brightspaceSyncedAt: string | null;
  /** User override for the detected semester. */
  semester: string | null;
}

export interface DashResult {
  success: boolean;
  error?: string;
}

export interface DashboardInvoke {
  'dash-summary': { args: []; result: DashSummary };
  'dash-session-start': {
    args: [opts: { studying?: string; plannedMinutes?: number; topic?: string }];
    result: DashResult;
  };
  'reports-get-sessions': { args: [opts?: { filter?: DashTimeFilter }]; result: DashSession[] };
  'reports-get-session-problems': { args: [opts: { sessionId: string }]; result: DashProblem[] };
  'reports-get-topic-scores': { args: [opts?: { courseFilter?: string }]; result: DashTopicScore[] };
  'reports-get-practice-plan': { args: [opts: { topicId: string }]; result: DashPracticeItem[] };
  'problem-log': { args: [input: DashProblemInput]; result: DashResult & { id?: string } };
  'brightspace-get-materials': {
    args: [opts?: { filter?: 'new' | 'weak-spots'; courseFilter?: string }];
    result: DashMaterial[];
  };
  /** Asks the paired extension for fresh Brightspace data, then reports what is stored. */
  'brightspace-sync': { args: []; result: DashResult & { courses: number; items: number } };
  'brightspace-open-material': { args: [opts: { materialId: string }]; result: DashResult };
  'dash-prefs-get': { args: []; result: DashPrefs };
  'dash-prefs-update': { args: [updates: Partial<DashPrefs>]; result: DashResult & { prefs: DashPrefs } };
  'dash-prefs-reset': { args: []; result: DashResult & { prefs: DashPrefs } };
}

export interface DashboardEvents {
  /** Problems, prefs-driven data or Brightspace material changed: pages should refetch. */
  'dash-data-changed': { kind: 'problems' | 'brightspace' | 'prefs' };
}
