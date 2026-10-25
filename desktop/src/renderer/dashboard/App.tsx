import { useState, useEffect } from 'react';
import { HomeView } from './views/HomeView';
import { ReportView } from './views/ReportView';
import { SkillsView } from './views/SkillsView';
import { MaterialsView } from './views/MaterialsView';
import { SettingsView } from './views/SettingsView';
import { RetroOnboarding } from './components/RetroOnboarding';
import './styles/Dashboard.css';

// The dashboard skeleton (tuan/reports/dashboard-skeleton.md): the student's performance seen the
// way a teacher would, and what to do next to grow. Five pages; Thu styles them.

export type ViewType = 'home' | 'report' | 'skills' | 'materials' | 'settings';

const NAV: Array<{ view: ViewType; icon: string; label: string }> = [
  { view: 'home', icon: '🏠', label: 'Dashboard' },
  { view: 'report', icon: '📝', label: 'Reports' },
  { view: 'skills', icon: '💪', label: 'Strengths & Weaknesses' },
  { view: 'materials', icon: '📚', label: 'Brightspace Material' },
  { view: 'settings', icon: '⚙️', label: 'Settings' }
];

function App() {
  const [currentView, setCurrentView] = useState<ViewType>('home');
  const [showOnboarding, setShowOnboarding] = useState(false);

  useEffect(() => {
    // Check if user has completed onboarding
    const checkOnboarding = async () => {
      // TODO: Check from settings or database
      // For now, show onboarding by default
      const onboarded = localStorage.getItem('wolfie_onboarded');
      setShowOnboarding(!onboarded);
    };
    checkOnboarding();
  }, []);

  const handleOnboardingComplete = async (data: unknown) => {
    try {
      // TODO: Save onboarding data via IPC (plan-onboarding-save)
      console.log('Onboarding data:', data);

      // Mark as onboarded
      localStorage.setItem('wolfie_onboarded', 'true');
      setShowOnboarding(false);
    } catch (error) {
      console.error('Failed to save onboarding data:', error);
    }
  };

  const renderView = () => {
    switch (currentView) {
      case 'report':
        return <ReportView />;
      case 'skills':
        return <SkillsView />;
      case 'materials':
        return <MaterialsView />;
      case 'settings':
        return <SettingsView />;
      default:
        return <HomeView onNavigate={setCurrentView} />;
    }
  };

  return (
    <div className="dashboard">
      {showOnboarding ? (
        <RetroOnboarding onComplete={handleOnboardingComplete} />
      ) : (
        <>
          {/* Sidebar Navigation */}
          <aside className="sidebar">
            <div className="sidebar-header">
              <h1 className="app-title">Wolfie Sensei</h1>
              <p className="app-subtitle">Study Companion</p>
            </div>

            <nav className="nav-menu">
              {NAV.map((item) => (
                <button
                  key={item.view}
                  className={`nav-item ${currentView === item.view ? 'active' : ''}`}
                  onClick={() => setCurrentView(item.view)}
                >
                  <span className="nav-icon">{item.icon}</span>
                  <span className="nav-label">{item.label}</span>
                </button>
              ))}
            </nav>
          </aside>

          {/* Main Content Area */}
          <main className="main-content">
            {renderView()}
          </main>
        </>
      )}
    </div>
  );
}

export default App;
