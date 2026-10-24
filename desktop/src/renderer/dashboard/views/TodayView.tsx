import { useState, useEffect } from 'react';

interface Session {
  id: number;
  started_at: string;
  ended_at: string | null;
}

interface Streak {
  current: number;
  longest: number;
  freezes_available: number;
}

export function TodayView() {
  const [activeSession, setActiveSession] = useState<Session | null>(null);
  const [streak, setStreak] = useState<Streak>({ current: 0, longest: 0, freezes_available: 0 });
  const [todayMinutes, setTodayMinutes] = useState(0);

  useEffect(() => {
    // Load today's data
    loadTodayData();
  }, []);

  const loadTodayData = async () => {
    // TODO: Load from IPC
    // const sessionData = await window.electronAPI.invoke('get-active-session');
    // const streakData = await window.electronAPI.invoke('get-streak');
    // setActiveSession(sessionData);
    // setStreak(streakData);
  };

  const handleStartSession = async () => {
    try {
      // TODO: Call IPC to start session
      // const session = await window.electronAPI.invoke('session-start');
      // setActiveSession(session);
      console.log('Start session');
    } catch (error) {
      console.error('Failed to start session:', error);
    }
  };

  const handleStopSession = async () => {
    try {
      // TODO: Call IPC to stop session
      // await window.electronAPI.invoke('session-stop');
      // setActiveSession(null);
      console.log('Stop session');
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

      {/* Stats Grid */}
      <div className="stats-grid">
        <div className="stat-card">
          <p className="stat-label">Today's Focus</p>
          <p className="stat-value">
            {todayMinutes}
            <span className="stat-unit">min</span>
          </p>
        </div>

        <div className="stat-card">
          <p className="stat-label">Current Streak</p>
          <p className="stat-value">
            {streak.current}
            <span className="stat-unit">days</span>
          </p>
        </div>

        <div className="stat-card">
          <p className="stat-label">Longest Streak</p>
          <p className="stat-value">
            {streak.longest}
            <span className="stat-unit">days</span>
          </p>
        </div>

        <div className="stat-card">
          <p className="stat-label">Streak Freezes</p>
          <p className="stat-value">{streak.freezes_available}</p>
        </div>
      </div>

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
