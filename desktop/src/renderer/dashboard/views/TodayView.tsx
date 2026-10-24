import { useState, useEffect } from 'react';
import type { SessionInfo } from '../../../common/ipc-sensing';
import type { StreakSnapshotType } from '@wolfie/shared';
import { StreakCalendar } from '../components/StreakCalendar';

interface Session {
  id: string;
  started_at: number;
  ended_at: number | null;
}

const toSession = (info: SessionInfo): Session | null =>
  info.active ? { id: info.active.id, started_at: info.active.startedAt, ended_at: null } : null;

export function TodayView() {
  const [activeSession, setActiveSession] = useState<Session | null>(null);
  const [streak, setStreak] = useState<StreakSnapshotType | null>(null);

  useEffect(() => {
    // Load today's data
    loadTodayData();
  }, []);

  const loadTodayData = async () => {
    try {
      const [sessionData, streakData] = await Promise.all([
        window.electronAPI.invoke('session-get'),
        window.electronAPI.invoke('streak-get')
      ]);
      setActiveSession(toSession(sessionData));
      setStreak(streakData);
    } catch (error) {
      console.error('Failed to load today data:', error);
      // Set mock data for UI development when backend not available
      setStreak({
        current: 7,
        longest: 12,
        freezesAvailable: 2,
        todayQualified: true,
        todayMinutes: 45,
        week: [
          { localDate: '2024-10-18', status: 'filled' },
          { localDate: '2024-10-19', status: 'filled' },
          { localDate: '2024-10-20', status: 'filled' },
          { localDate: '2024-10-21', status: 'filled' },
          { localDate: '2024-10-22', status: 'filled' },
          { localDate: '2024-10-23', status: 'filled' },
          { localDate: '2024-10-24', status: 'pending' }
        ]
      });
    }
  };

  const handleUseFreeze = async () => {
    if (!confirm('Use a streak freeze? This will protect your streak if you miss a day.')) return;

    try {
      // TODO: Add IPC call for using streak freeze when Tuan implements it
      alert('Streak freeze functionality coming soon!');
      await loadTodayData();
    } catch (error) {
      console.error('Failed to use freeze:', error);
    }
  };

  const handleStartSession = async () => {
    try {
      const session = await window.electronAPI.invoke('session-start');
      setActiveSession(toSession(session));
    } catch (error) {
      console.error('Failed to start session:', error);
    }
  };

  const handleStopSession = async () => {
    try {
      await window.electronAPI.invoke('session-stop');
      setActiveSession(null);
    } catch (error) {
      console.error('Failed to stop session:', error);
    }
  };

  return (
    <div className="view-container">
      <div className="view-header">
        <h1 className="view-title">Today</h1>
        <p className="view-subtitle">{new Date().toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}</p>
      </div>

      {/* Session Control */}
      <div className="card">
        <div className="card-header">
          <h2 className="card-title">Study Session</h2>
        </div>
        <div className="card-content">
          {activeSession ? (
            <div>
              <p style={{ fontSize: '16px', color: '#27ae60', marginBottom: '16px' }}>
                ✅ Session active since {new Date(activeSession.started_at).toLocaleTimeString()}
              </p>
              <button className="btn btn-secondary" onClick={handleStopSession}>
                Stop Session
              </button>
            </div>
          ) : (
            <div>
              <p style={{ fontSize: '16px', color: '#6e6e73', marginBottom: '16px' }}>
                No active session
              </p>
              <button className="btn btn-primary" onClick={handleStartSession}>
                Start Session
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Streak Visualization */}
      {streak && (
        <StreakCalendar
          streak={streak}
          onUseFreeze={handleUseFreeze}
        />
      )}

      {/* Active Goal */}
      <div className="card">
        <div className="card-header">
          <h2 className="card-title">Active Goal</h2>
        </div>
        <div className="card-content">
          <div className="empty-state">
            <div className="empty-state-icon">🎯</div>
            <h3 className="empty-state-title">No active goal</h3>
            <p className="empty-state-text">Set a goal in the Goals & Plan section</p>
          </div>
        </div>
      </div>

      {/* Plan Items Due Today */}
      <div className="card">
        <div className="card-header">
          <h2 className="card-title">Due Today</h2>
        </div>
        <div className="card-content">
          <div className="empty-state">
            <div className="empty-state-icon">📋</div>
            <h3 className="empty-state-title">Nothing due today</h3>
            <p className="empty-state-text">You're all caught up!</p>
          </div>
        </div>
      </div>
    </div>
  );
}
