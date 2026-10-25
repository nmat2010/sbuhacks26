import { useState, useEffect } from 'react';
import { useDashboard } from './hooks/useDashboard';
import { useSession } from './hooks/useSession';
import { useSettings } from './hooks/useSettings';
import { AppShell, type PageView } from './pixel-components/AppShell';
import { MascotTransitionProvider } from './pixel-components/MascotTransition';
import { DashboardPage } from './views/DashboardPage';
import { ReportPage } from './views/ReportPage';
import { StrengthWeaknessPage } from './views/StrengthWeaknessPage';
import { BrightspaceMaterialPage } from './views/BrightspaceMaterialPage';
import { SettingsPage } from './views/SettingsPage';
import { RetroOnboarding } from './components/RetroOnboarding';
import './styles/tokens.css';
import './styles/motion.css';

// The dashboard skeleton (tuan/reports/dashboard-skeleton.md): the student's performance seen the
// way a teacher would, and what to do next to grow. Five pages; Thu styles them.

// Legacy type export for backward compatibility
export type ViewType = 'home' | 'report' | 'skills' | 'materials' | 'settings';

function App() {
  const [currentView, setCurrentView] = useState<PageView>('dashboard');
  const [showOnboarding, setShowOnboarding] = useState(false);
  const { summary } = useDashboard();
  const { isActive, isPaused } = useSession();
  const { settings } = useSettings();
  const isSample = !!summary && !summary.latestSession;

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
        return <ReportPage isSample={isSample} onNavigate={setCurrentView} />;
      case 'strength-weakness':
        return <StrengthWeaknessPage isSample={isSample} onNavigate={setCurrentView} />;
      case 'brightspace-material':
        return <BrightspaceMaterialPage />;
      case 'settings':
        return <SettingsPage />;
      case 'dashboard':
      default:
        return <DashboardPage summary={summary} onNavigate={setCurrentView} />;
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
