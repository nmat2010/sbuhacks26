import type {
  Session,
  ProblemAttempt,
  StreakSummary,
  TopicScore,
  HourlyFocus
} from '../types/wolfie';

export const fixtureSession: Session = {
  id: '1',
  startedAt: '2026-10-24T13:10:00Z',
  endedAt: '2026-10-24T13:50:00Z',
  plannedMinutes: 50,
  course: 'CSE 373',
  studying: 'Dynamic programming and graph traversal',
  topics: ['dynamic-programming', 'graph-traversal'],
  focusScore: 82
};

export const fixtureProblems: ProblemAttempt[] = [
  {
    id: '1',
    sessionId: '1',
    title: 'Longest common subsequence',
    topic: 'dynamic-programming',
    startedAt: '2026-10-24T13:10:00Z',
    minutes: 14,
    outcome: 'hinted',
    hintsUsed: 1,
    attemptWrittenFirst: true,
    aiUnlocked: false,
    note: ''
  },
  {
    id: '2',
    sessionId: '1',
    title: '0/1 knapsack',
    topic: 'dynamic-programming',
    startedAt: '2026-10-24T13:24:00Z',
    minutes: 12,
    outcome: 'stuck',
    hintsUsed: 0,
    attemptWrittenFirst: true,
    aiUnlocked: true,
    note: ''
  },
  {
    id: '3',
    sessionId: '1',
    title: 'Shortest path in a grid',
    topic: 'graph-traversal',
    startedAt: '2026-10-24T13:36:00Z',
    minutes: 6,
    outcome: 'solved',
    hintsUsed: 0,
    attemptWrittenFirst: true,
    aiUnlocked: false,
    note: ''
  },
  {
    id: '4',
    sessionId: '1',
    title: 'Detect a cycle in a directed graph',
    topic: 'graph-traversal',
    startedAt: '2026-10-24T13:42:00Z',
    minutes: 8,
    outcome: 'solved',
    hintsUsed: 0,
    attemptWrittenFirst: true,
    aiUnlocked: false,
    note: ''
  }
];

export const fixtureStreak: StreakSummary = {
  current: 9,
  best: 14,
  days: [
    { date: '2026-10-12', status: 'clean' },
    { date: '2026-10-13', status: 'clean' },
    { date: '2026-10-14', status: 'no-session' },
    { date: '2026-10-15', status: 'leaned-on-ai' },
    { date: '2026-10-16', status: 'clean' },
    { date: '2026-10-17', status: 'clean' },
    { date: '2026-10-18', status: 'clean' },
    { date: '2026-10-19', status: 'clean' },
    { date: '2026-10-20', status: 'clean' },
    { date: '2026-10-21', status: 'clean' },
    { date: '2026-10-22', status: 'clean' },
    { date: '2026-10-23', status: 'clean' },
    { date: '2026-10-24', status: 'clean' },
    { date: '2026-10-25', status: 'open' }
  ],
  triedFirstRate: 0.86,
  aiShareOfTime: 0.11,
  solvedUnaidedRate: 0.68
};

export const fixtureTopicScores: TopicScore[] = [
  {
    topic: 'dynamic-programming',
    score10: 3,
    band: 'weak',
    unaidedSolved: 4,
    attempted: 14,
    changeVsTwoWeeks: -1,
    usualStall: 'Defining the subproblem'
  },
  {
    topic: 'graph-traversal',
    score10: 9,
    band: 'strong',
    unaidedSolved: 12,
    attempted: 14,
    changeVsTwoWeeks: 1,
    usualStall: undefined
  }
];

export const fixtureHourlyFocus: HourlyFocus[] = [
  { hour: 6, score: 42 },
  { hour: 7, score: 55 },
  { hour: 8, score: 71 },
  { hour: 9, score: 86 },
  { hour: 10, score: 88 },
  { hour: 11, score: 74 },
  { hour: 12, score: 50 },
  { hour: 13, score: 35 },
  { hour: 14, score: 59 },
  { hour: 15, score: 72 },
  { hour: 16, score: 64 },
  { hour: 17, score: 54 },
  { hour: 18, score: 42 },
  { hour: 19, score: 34 },
  { hour: 20, score: 64 },
  { hour: 21, score: 68 },
  { hour: 22, score: 48 },
  { hour: 23, score: 26 }
];
