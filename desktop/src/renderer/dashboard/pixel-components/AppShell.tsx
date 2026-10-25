import { ReactNode } from 'react';
import { WolfieSprite } from './WolfieSprite';
import './AppShell.css';

export type PageView = 'dashboard' | 'report' | 'strength-weakness' | 'brightspace-material' | 'settings';

export interface NavItem {
  view: PageView;
  label: string;
}

export interface AppShellProps {
  currentView: PageView;
  onNavigate: (view: PageView) => void;
  children: ReactNode;
  level?: number;
  xp?: { current: number; max: number };
  mood?: string;
}

const NAV_ITEMS: NavItem[] = [
  { view: 'dashboard', label: 'DASHBOARD' },
  { view: 'report', label: 'REPORT' },
  { view: 'strength-weakness', label: 'STRENGTH / WEAKNESS' },
  { view: 'brightspace-material', label: 'BRIGHTSPACE MATERIAL' },
  { view: 'settings', label: 'SETTINGS' }
];

export function AppShell({
  currentView,
  onNavigate,
  children,
  level = 4,
  xp = { current: 340, max: 500 },
  mood = 'READY'
}: AppShellProps) {
  return (
    <div className="app-shell">
      {/* Top bar */}
      <header className="app-shell__topbar">
        <span className="app-shell__title">WOLFIE SENSEI</span>
        <span className="app-shell__page-title">
          {NAV_ITEMS.find(item => item.view === currentView)?.label || 'DASHBOARD'}
        </span>
        <div className="app-shell__dots" aria-hidden="true">
          <span className="app-shell__dot app-shell__dot--gold"></span>
          <span className="app-shell__dot app-shell__dot--green"></span>
          <span className="app-shell__dot app-shell__dot--red"></span>
        </div>
      </header>

      <div className="app-shell__body">
        {/* Sidebar */}
        <nav className="app-shell__sidebar" aria-label="Main">
          <div className="app-shell__nav">
            {NAV_ITEMS.map(item => (
              <button
                key={item.view}
                className={`app-shell__nav-item ${currentView === item.view ? 'app-shell__nav-item--active' : ''}`.trim()}
                onClick={() => onNavigate(item.view)}
                aria-current={currentView === item.view ? 'page' : undefined}
              >
                <i className="app-shell__nav-icon"></i>
                {item.label}
              </button>
            ))}
          </div>

          {/* Sidebar footer */}
          <div className="app-shell__sidebar-footer">
            <WolfieSprite size={88} />
            <span className="app-shell__footer-text">SENSEI · {mood}</span>
            <span className="app-shell__footer-text">
              LV {level} · {xp.current}/{xp.max} XP
            </span>
          </div>
        </nav>

        {/* Main content */}
        <main className="app-shell__main">
          {children}
        </main>
      </div>
    </div>
  );
}
