import { useState } from 'react';
import { TodayView } from './views/TodayView';
import { GoalsView } from './views/GoalsView';
import { PapersView } from './views/PapersView';
import { HistoryView } from './views/HistoryView';
import { SettingsView } from './views/SettingsView';
import './styles/Dashboard.css';

type ViewType = 'today' | 'goals' | 'papers' | 'history' | 'settings';

function App() {
  const [currentView, setCurrentView] = useState<ViewType>('today');

  const renderView = () => {
    switch (currentView) {
      case 'today':
        return <TodayView />;
      case 'goals':
        return <GoalsView />;
      case 'papers':
        return <PapersView />;
      case 'history':
        return <HistoryView />;
      case 'settings':
        return <SettingsView />;
      default:
        return <TodayView />;
    }
  };

  return (
    <div className="dashboard">
      {/* Sidebar Navigation */}
      <aside className="sidebar">
        <div className="sidebar-header">
          <h1 className="app-title">Wolfie Sensei</h1>
          <p className="app-subtitle">Study Companion</p>
        </div>

        <nav className="nav-menu">
          <button
            className={`nav-item ${currentView === 'today' ? 'active' : ''}`}
            onClick={() => setCurrentView('today')}
          >
            <span className="nav-icon">📅</span>
            <span className="nav-label">Today</span>
          </button>

          <button
            className={`nav-item ${currentView === 'goals' ? 'active' : ''}`}
            onClick={() => setCurrentView('goals')}
          >
            <span className="nav-icon">🎯</span>
            <span className="nav-label">Goals & Plan</span>
          </button>

          <button
            className={`nav-item ${currentView === 'papers' ? 'active' : ''}`}
            onClick={() => setCurrentView('papers')}
          >
            <span className="nav-icon">📄</span>
            <span className="nav-label">Papers</span>
          </button>

          <button
            className={`nav-item ${currentView === 'history' ? 'active' : ''}`}
            onClick={() => setCurrentView('history')}
          >
            <span className="nav-icon">📊</span>
            <span className="nav-label">History</span>
          </button>

          <button
            className={`nav-item ${currentView === 'settings' ? 'active' : ''}`}
            onClick={() => setCurrentView('settings')}
          >
            <span className="nav-icon">⚙️</span>
            <span className="nav-label">Settings</span>
          </button>
        </nav>
      </aside>

      {/* Main Content Area */}
      <main className="main-content">
        {renderView()}
      </main>
    </div>
  );
}

export default App;
