export function SettingsView() {
  return (
    <div className="view-container">
      <div className="view-header">
        <h1 className="view-title">Settings</h1>
        <p className="view-subtitle">Configure Wolfie Sensei</p>
      </div>

      {/* Monitoring */}
      <div className="card">
        <div className="card-header">
          <h2 className="card-title">Monitoring</h2>
        </div>
        <div className="card-content">
          <div className="list-item">
            <div>
              <h3 className="list-item-title">Window Title Capture</h3>
              <p className="list-item-subtitle">Capture window titles for better context</p>
            </div>
            <label className="switch">
              <input type="checkbox" defaultChecked />
              <span className="slider"></span>
            </label>
          </div>

          <div className="list-item">
            <div>
              <h3 className="list-item-title">Browser Extension</h3>
              <p className="list-item-subtitle">Status: Not connected</p>
            </div>
          </div>
        </div>
      </div>

      {/* Voice */}
      <div className="card">
        <div className="card-header">
          <h2 className="card-title">Voice</h2>
        </div>
        <div className="card-content">
          <div className="list-item">
            <div>
              <h3 className="list-item-title">Voice Mode</h3>
              <p className="list-item-subtitle">Enable voice interaction with Wolfie</p>
            </div>
            <label className="switch">
              <input type="checkbox" />
              <span className="slider"></span>
            </label>
          </div>
        </div>
      </div>

      {/* AI Tools */}
      <div className="card">
        <div className="card-header">
          <h2 className="card-title">AI Tool Warnings</h2>
        </div>
        <div className="card-content">
          <p style={{ color: '#6e6e73', marginBottom: '12px' }}>
            Wolfie will warn you when you open these tools
          </p>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
            {['Claude', 'ChatGPT', 'Gemini', 'Copilot', 'Perplexity'].map(tool => (
              <span key={tool} style={{
                padding: '6px 12px',
                background: '#f5f5f7',
                borderRadius: '6px',
                fontSize: '14px'
              }}>
                {tool}
              </span>
            ))}
          </div>
        </div>
      </div>

      {/* Distractions */}
      <div className="card">
        <div className="card-header">
          <h2 className="card-title">Distraction Warnings</h2>
        </div>
        <div className="card-content">
          <p style={{ color: '#6e6e73', marginBottom: '12px' }}>
            Wolfie will warn you when you visit these sites
          </p>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
            {['YouTube', 'Netflix', 'Instagram', 'TikTok', 'Reddit'].map(site => (
              <span key={site} style={{
                padding: '6px 12px',
                background: '#f5f5f7',
                borderRadius: '6px',
                fontSize: '14px'
              }}>
                {site}
              </span>
            ))}
          </div>
        </div>
      </div>

      {/* Data */}
      <div className="card">
        <div className="card-header">
          <h2 className="card-title">Data</h2>
        </div>
        <div className="card-content">
          <button className="btn btn-secondary" style={{ marginRight: '12px' }}>
            Export Data (JSON)
          </button>
          <button className="btn btn-secondary" style={{ color: '#e74c3c' }}>
            Clear All Data
          </button>
        </div>
      </div>
    </div>
  );
}
