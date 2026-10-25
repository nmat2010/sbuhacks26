import type { Session, ProblemAttempt } from '../types/wolfie';

export interface ReportSession extends Session {
  solvedUnaided: number;
  totalProblems: number;
}

export const fixtureSessions: ReportSession[] = [
  {
    id: '1',
    startedAt: '2026-10-24T13:10:00Z',
    endedAt: '2026-10-24T13:50:00Z',
    plannedMinutes: 50,
    course: 'CSE 373',
    studying: 'Dynamic programming',
    topics: ['dynamic-programming'],
    focusScore: 74,
    solvedUnaided: 2,
    totalProblems: 4
  },
  {
    id: '2',
    startedAt: '2026-10-24T09:30:00Z',
    endedAt: '2026-10-24T10:20:00Z',
    plannedMinutes: 50,
    course: 'AMS 261',
    studying: 'Line integrals',
    topics: ['line-integrals'],
    focusScore: 82,
    solvedUnaided: 5,
    totalProblems: 6
  },
  {
    id: '3',
    startedAt: '2026-10-23T19:00:00Z',
    endedAt: '2026-10-23T19:35:00Z',
    plannedMinutes: 50,
    course: 'ESE 271',
    studying: 'Op-amp circuits',
    topics: ['op-amp-circuits'],
    focusScore: 68,
    solvedUnaided: 3,
    totalProblems: 5
  },
  {
    id: '4',
    startedAt: '2026-10-23T10:15:00Z',
    endedAt: '2026-10-23T11:00:00Z',
    plannedMinutes: 50,
    course: 'CSE 373',
    studying: 'Graph algorithms',
    topics: ['graph-algorithms'],
    focusScore: 91,
    solvedUnaided: 5,
    totalProblems: 6
  }
];

export const fixtureSelectedSession = fixtureSessions[0];

export const fixtureSessionProblems: ProblemAttempt[] = [
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
    note: 'Missed the base case on the first pass.'
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
    note: 'Could not define the subproblem. Opened AI tab for 15 minutes.'
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
