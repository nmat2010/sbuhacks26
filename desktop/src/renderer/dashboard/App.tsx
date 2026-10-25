import { useState, useEffect } from 'react';
import { useDashboard } from './hooks/useDashboard';
import { useSession } from './hooks/useSession';
import { useSettings } from './hooks/useSettings';
import { AppShell, type PageView } from './pixel-components/AppShell';
import { MascotTransitionProvider } from './pixel-components/MascotTransition';
import { HomeView } from './views/HomeView';
import { ReportView } from './views/ReportView';
import { SkillsView } from './views/SkillsView';
import { SettingsView } from './views/SettingsView';
import { BrightspaceMaterialPage } from './views/BrightspaceMaterialPage';
import { RetroOnboarding } from './components/RetroOnboarding';
import './styles/tokens.css';
import './styles/Dashboard.css';
import './styles/retro-views.css';
// Thu's page transitions (pages rise in, staggered) and the mascot launch transition
import './styles/motion.css';

// The dashboard: the student's performance seen the way a teacher would, and what to do next to
// grow. Thu's retro shell and look (tuan/reports/dashboard-compare.md); the Dashboard, Report,
// Strength/Weakness and Settings pages show Tuan's data (sessions, Watch-mode reports, the skills
// record, real settings); Brightspace Material is Thu's page.

/** Page names used by Tuan's views (HomeView links), mapped to the shell's pages. */
export type ViewType = 'home' | 'report' | 'skills' | 'materials' | 'settings';
const PAGE_OF: Record<ViewType, PageView> = {
  home: 'dashboard',
  report: 'report',
  skills: 'strength-weakness',
  materials: 'brightspace-material',
  settings: 'settings'
};

function App() {
  const [currentView, setCurrentView] = useState<PageView>('dashboard');
  const [showOnboarding, setShowOnboarding] = useState(false);
  const { summary } = useDashboard();
  const { isActive, isPaused } = useSession();
  const { settings } = useSettings();

  // Appearance prefs apply to the whole window
  useEffect(() => {
    const root = document.documentElement;
    root.dataset.pixelScale = String(settings?.appearance.pixelScale ?? 1);
    root.dataset.reduceMotion = settings?.appearance.reduceMotion ? 'true' : 'false';
  }, [settings?.appearance.pixelScale, settings?.appearance.reduceMotion]);

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
      // Save onboarding data via IPC
      await window.ipc.invoke('plan-onboarding-save', data as any);
      console.log('Onboarding data saved:', data);

      // Mark as onboarded
      localStorage.setItem('wolfie_onboarded', 'true');
      setShowOnboarding(false);
    } catch (error) {
      console.error('Failed to save onboarding data:', error);
      // Still mark as onboarded to avoid blocking the user
      localStorage.setItem('wolfie_onboarded', 'true');
      setShowOnboarding(false);
    }
  };

  const renderView = () => {
    switch (currentView) {
      case 'report':
        return <ReportView />;
      case 'strength-weakness':
        return <SkillsView />;
      case 'brightspace-material':
        return <BrightspaceMaterialPage />;
      case 'settings':
        return <SettingsView />;
      case 'dashboard':
      default:
        return <HomeView onNavigate={(view) => setCurrentView(PAGE_OF[view])} />;
    }
  };

  if (showOnboarding) {
    return <RetroOnboarding onComplete={handleOnboardingComplete} />;
  }

  return (
    <MascotTransitionProvider sound={settings?.appearance.soundEffects ?? true}>
    <AppShell
      currentView={currentView}
      onNavigate={setCurrentView}
      level={summary?.level}
      xp={summary?.xp}
      mood={isPaused ? 'PAUSED' : isActive ? 'WATCHING' : 'READY'}
    >
      <div key={currentView} className="page-enter">
        {renderView()}
      </div>
    </AppShell>
    </MascotTransitionProvider>
  );
}

export default App;
