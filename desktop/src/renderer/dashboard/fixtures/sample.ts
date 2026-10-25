import type { DashMaterial, DashProblem, DashSession, DashSummary, DashTopicScore } from '../../../common/ipc-dashboard';
import { fixtureProblems, fixtureSession, fixtureStreak, fixtureHourlyFocus } from './dashboard';
import { fixtureSessions, fixtureSessionProblems } from './report';
import { fixtureTopicScores, topicToCourse, topicDisplayNames, practicePlan } from './strength-weakness';
import { fixtureBrightspaceMaterials } from './brightspace-material';

// Sample data shown until the student has real data, always labelled as sample in the UI.

const minutesBetween = (a: string, b: string | null) => (b ? Math.round((new Date(b).getTime() - new Date(a).getTime()) / 60_000) : 0);

export const sampleSessions: DashSession[] = fixtureSessions.map((s) => ({
  ...s,
  minutes: minutesBetween(s.startedAt, s.endedAt),
  aiUnlocks: 0,
  hints: 0
}));

export const sampleProblems: DashProblem[] = fixtureSessionProblems.map((p) => ({ ...p }));

export const sampleTopics: DashTopicScore[] = fixtureTopicScores.map((t) => ({
  ...t,
  name: topicDisplayNames[t.topic] ?? t.topic.replace(/-/g, ' '),
  course: topicToCourse[t.topic] ?? null
}));

export const samplePracticePlan = practicePlan;

export const sampleMaterials: DashMaterial[] = fixtureBrightspaceMaterials.map((m) => ({ ...m, url: null }));

export const sampleSummary: DashSummary = {
  streak: {
    current: fixtureStreak.current,
    best: fixtureStreak.best,
    days: fixtureStreak.days,
    triedFirstRate: fixtureStreak.triedFirstRate,
    aiShareOfTime: fixtureStreak.aiShareOfTime,
    solvedUnaidedRate: fixtureStreak.solvedUnaidedRate
  },
  hourlyFocus: fixtureHourlyFocus,
  latestSession: {
    ...fixtureSession,
    solvedUnaided: 2,
    totalProblems: fixtureProblems.length,
    minutes: minutesBetween(fixtureSession.startedAt, fixtureSession.endedAt),
    aiUnlocks: 1,
    hints: 1
  },
  latestProblems: fixtureProblems,
  suggestedTopic: 'Dynamic programming',
  topics: sampleTopics,
  aiShareCap: 0.2,
  showProductivityCurve: true,
  activeSessionId: null,
  senseiSays:
    "Dynamic programming keeps tripping you up. Try the next problem on paper before you open any AI. I'll hold the gate.",
  level: 4,
  xp: { current: 340, max: 500 }
};
