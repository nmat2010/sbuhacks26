import { addDays, daysBetween, mondayOnOrAfter } from '../plan/dates.js';

// Deterministic plan for DEMO_MODE and tests. It reads the same facts the real prompt gets
// (via LlmRequest.mockKey) and returns output that satisfies the real schema, dates included.

interface MockGoal {
  id: string;
  title: string;
  type: string;
  /** First allowed day and last allowed day for this goal's items. */
  start: string;
  end: string;
}

const PHASES: Record<string, string[]> = {
  research: [
    'Explore areas and shortlist labs',
    'Read two starter papers',
    'Email professors and ask about openings',
    'Prepare a short research statement',
    'Follow up and set up meetings',
    'Start a first small project with a lab'
  ],
  job: [
    'Update your resume and profiles',
    'Shortlist roles and companies',
    'Send applications',
    'Practice interviews',
    'Follow up on applications',
    'Review offers and next steps'
  ],
  project: [
    'Define the scope and the first demo',
    'Set up the repo and basic structure',
    'Build the core feature',
    'Test with a friend and fix the rough edges',
    'Polish and write it up',
    'Share the result'
  ],
  course: [
    'Review the syllabus and key dates',
    'Catch up on readings and notes',
    'Practice problems on the hardest topic',
    'Go to office hours with specific questions',
    'Do a timed practice run',
    'Final review'
  ],
  other: ['Clarify what done looks like', 'Take the first step', 'Make steady progress', 'Check in and adjust', 'Wrap up']
};

export function mockPlan(key: Record<string, unknown> | undefined): unknown {
  if (key?.item) return mockItem(key.item as { title: string; due_date: string | null; end: string });
  const goals = (key?.goals as MockGoal[] | undefined) ?? [];
  const weeklyHours = Number(key?.weeklyHours ?? 8);
  return {
    goals: goals.map((goal) => {
      const phases = PHASES[goal.type] ?? PHASES.other;
      const firstMonday = mondayOnOrAfter(goal.start);
      const weeks = Math.max(1, Math.floor(daysBetween(firstMonday, goal.end) / 7) + 1);
      const count = Math.min(weeks, 12);
      const step = Math.max(1, Math.floor(weeks / count));
      const milestones = Array.from({ length: count }, (_, i) => ({
        week_start: addDays(firstMonday, i * step * 7),
        title: phases[Math.min(phases.length - 1, Math.floor((i * phases.length) / count))]
      })).filter((m) => m.week_start <= goal.end);
      const perWeek = Math.max(1, Math.round((weeklyHours / Math.max(1, goals.length)) * 10) / 10);
      const items = milestones.map((m, i) => {
        const due = addDays(m.week_start, 4);
        return {
          title: `${m.title} (${goal.title})`,
          due_date: due > goal.end ? goal.end : due < goal.start ? goal.start : due,
          notes: i === 0 ? 'A small first step is enough to get going.' : undefined,
          milestone_week: m.week_start,
          estimated_hours: perWeek
        };
      });
      return {
        goal_id: goal.id,
        rationale: `This plan for "${goal.title}" spreads about ${perWeek} hours a week across ${milestones.length} steps, so it fits next to your courses and finishes before ${goal.end}.`,
        milestones: milestones.length ? milestones : [{ week_start: goal.start, title: phases[0] }],
        items: items.length ? items : [{ title: `${phases[0]} (${goal.title})`, due_date: goal.start, estimated_hours: perWeek }]
      };
    })
  };
}

function mockItem(item: { title: string; due_date: string | null; end: string }): unknown {
  return {
    title: `Alternative: ${item.title.replace(/^Alternative: /, '')}`,
    due_date: item.due_date ?? item.end,
    notes: 'A different way to make progress on the same step.'
  };
}
