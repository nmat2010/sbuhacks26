import { ExampleBadge, Planned } from '../components/Planned';

// Strengths & weaknesses: what the student is good at, what to work on, and a plan to improve the
// weak spots while keeping the strong ones sharp. Example content until the skills record exists.

const STRENGTHS = [
  { topic: 'Graphs', detail: 'MST (Prim, Kruskal), shortest paths (Dijkstra, Bellman-Ford)', evidence: '9 problems solved without hints' },
  { topic: 'C++ implementation', detail: 'Clean, correct implementations of graph algorithms', evidence: 'No answer checks flagged in 4 sessions' }
];

const WEAKNESSES = [
  {
    topic: 'Dynamic programming',
    detail: 'Setting up the recurrence and the base cases',
    evidence: '3 problems needed hints up to level 4',
    plan: ['Re-derive the recurrence for 2 classic problems (knapsack, LIS)', 'Watch a short explainer on state design', 'Try one new DP problem without hints']
  },
  {
    topic: 'ML concepts: SVM',
    detail: 'Margins and the kernel trick',
    evidence: 'Mixed up hinge loss and logistic loss twice',
    plan: ['Review margin maximization with a diagram', 'Explain the kernel trick in your own words to Wolfie']
  }
];

export function SkillsView() {
  return (
    <div className="view-container">
      <div className="view-header">
        <h1 className="view-title">Strengths & Weaknesses</h1>
        <p className="view-subtitle">Improve your weak spots while keeping your strengths sharp</p>
      </div>

      <div className="card">
        <div className="card-content">
          <Planned
            owner="Tuan"
            shows={[
              'Topics found from your sessions: answers checked right or wrong, hint depth, stalls',
              'Each topic with its evidence (which sessions, which problems)',
              'A plan per weakness: what to review, what to practice, material to use',
              'Trend over time: a weakness turning into a strength'
            ]}
            source="Watch mode answer checks and hints per topic, kept across sessions"
          />
        </div>
      </div>

      <div className="two-col">
        <div className="card">
          <div className="card-header">
            <h2 className="card-title">
              💪 Strengths
              <ExampleBadge />
            </h2>
          </div>
          <div className="card-content">
            {STRENGTHS.map((s) => (
              <div key={s.topic} className="list-item" style={{ display: 'block' }}>
                <h3 className="list-item-title">{s.topic}</h3>
                <p className="list-item-subtitle">{s.detail}</p>
                <p className="planned-source">{s.evidence}</p>
              </div>
            ))}
          </div>
        </div>

        <div className="card">
          <div className="card-header">
            <h2 className="card-title">
              🎯 To work on
              <ExampleBadge />
            </h2>
          </div>
          <div className="card-content">
            {WEAKNESSES.map((w) => (
              <div key={w.topic} className="list-item" style={{ display: 'block' }}>
                <h3 className="list-item-title">{w.topic}</h3>
                <p className="list-item-subtitle">{w.detail}</p>
                <p className="planned-source">{w.evidence}</p>
                <ul className="planned-list">
                  {w.plan.map((step) => (
                    <li key={step}>{step}</li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
