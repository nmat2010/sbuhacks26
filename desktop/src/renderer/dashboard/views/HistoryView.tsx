export function HistoryView() {
  return (
    <div className="view-container">
      <div className="view-header">
        <h1 className="view-title">History</h1>
        <p className="view-subtitle">View your study sessions and progress</p>
      </div>

      {/* Summary Stats */}
      <div className="stats-grid">
        <div className="stat-card">
          <p className="stat-label">Total Sessions</p>
          <p className="stat-value">0</p>
        </div>

        <div className="stat-card">
          <p className="stat-label">Total Focus Time</p>
          <p className="stat-value">
            0
            <span className="stat-unit">hrs</span>
          </p>
        </div>

        <div className="stat-card">
          <p className="stat-label">Hints Requested</p>
          <p className="stat-value">0</p>
        </div>

        <div className="stat-card">
          <p className="stat-label">Nudges Shown</p>
          <p className="stat-value">0</p>
        </div>
      </div>

      {/* Sessions List */}
      <div className="card">
        <div className="card-header">
          <h2 className="card-title">Recent Sessions</h2>
        </div>
        <div className="card-content">
          <div className="empty-state">
            <div className="empty-state-icon">📊</div>
            <h3 className="empty-state-title">No sessions yet</h3>
            <p className="empty-state-text">Start a session to begin tracking your progress</p>
          </div>
        </div>
      </div>
    </div>
  );
}
