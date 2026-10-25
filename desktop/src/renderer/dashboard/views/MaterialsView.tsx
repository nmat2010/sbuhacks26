import { Planned } from '../components/Planned';

// Brightspace material: course material from the professor. How it is accessed is Thu's design
// (to be decided); searching it (RAG) is optional.

export function MaterialsView() {
  return (
    <div className="view-container">
      <div className="view-header">
        <h1 className="view-title">Brightspace Material</h1>
        <p className="view-subtitle">Your course material in one place</p>
      </div>

      <div className="card">
        <div className="card-content">
          <div className="empty-state">
            <div className="empty-state-icon">📚</div>
            <h3 className="empty-state-title">Course material is coming</h3>
            <p className="empty-state-text">Access to your Brightspace courses is being designed.</p>
          </div>
          <Planned
            owner="Thu"
            shows={[
              'Your courses and their material (slides, readings, assignments)',
              'Open a file and study it with Wolfie',
              '(Optional) Ask a question and Wolfie searches the professor’s material for the answer'
            ]}
            source="To be decided by Thu"
          />
        </div>
      </div>
    </div>
  );
}
