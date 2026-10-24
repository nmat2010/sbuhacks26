export function PapersView() {
  return (
    <div className="view-container">
      <div className="view-header">
        <h1 className="view-title">Papers</h1>
        <p className="view-subtitle">Track your reading and research</p>
      </div>

      <div className="card">
        <div className="card-header">
          <h2 className="card-title">Your Papers</h2>
          <button className="btn btn-primary">+ Add Paper</button>
        </div>
        <div className="card-content">
          <div className="empty-state">
            <div className="empty-state-icon">📄</div>
            <h3 className="empty-state-title">No papers added</h3>
            <p className="empty-state-text">Add papers by PDF upload or arXiv URL</p>
          </div>
        </div>
      </div>
    </div>
  );
}
