export function GoalsView() {
  return (
    <div className="view-container">
      <div className="view-header">
        <h1 className="view-title">Goals & Plan</h1>
        <p className="view-subtitle">Manage your semester goals and generated plan</p>
      </div>

      {/* Goals Section */}
      <div className="card">
        <div className="card-header">
          <h2 className="card-title">Goals</h2>
          <button className="btn btn-primary">+ Add Goal</button>
        </div>
        <div className="card-content">
          <div className="empty-state">
            <div className="empty-state-icon">🎯</div>
            <h3 className="empty-state-title">No goals yet</h3>
            <p className="empty-state-text">Add your first goal to get started with planning</p>
          </div>
        </div>
      </div>

      {/* Plan Section */}
      <div className="card">
        <div className="card-header">
          <h2 className="card-title">Plan</h2>
          <button className="btn btn-secondary">Generate Plan</button>
        </div>
        <div className="card-content">
          <div className="empty-state">
            <div className="empty-state-icon">📋</div>
            <h3 className="empty-state-title">No plan generated</h3>
            <p className="empty-state-text">Create goals first, then generate a plan</p>
          </div>
        </div>
      </div>
    </div>
  );
}
