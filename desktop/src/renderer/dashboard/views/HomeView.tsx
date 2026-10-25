import { useEffect, useState } from 'react';
import type { HistoryData, HistorySession, SessionInfo } from '../../../common/ipc-sensing';
import type { StreakSnapshotType } from '@wolfie/shared';
import type { ViewType } from '../App';
import { StreakCalendar } from '../components/StreakCalendar';
import { Planned } from '../components/Planned';
import { useSkills } from './SkillsView';
import { FocusBars } from '../components/FocusBars';
import { SessionReport } from '../components/SessionReport';
import { duration, minutes, sessionDate, totalSeconds } from '../format';

// Main page: start a session, the latest session report, strengths and weaknesses, the streak with
// how much the student leans on AI, and focus across sessions. Real data where it exists today;
// the rest is a Planned placeholder (tuan/reports/dashboard-skeleton.md).

const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

export function HomeView({ onNavigate }: { onNavigate: (view: ViewType) => void }) {
  const [active, setActive] = useState<SessionInfo['active']>(null);
  const [streak, setStreak] = useState<StreakSnapshotType | null>(null);
  const [week, setWeek] = useState<HistoryData | null>(null);

  const load = async () => {
    try {
      const [session, streakData, history] = await Promise.all([
        window.electronAPI.invoke('session-get'),
        window.electronAPI.invoke('streak-get'),
        window.electronAPI.invoke('history-get', { sinceTs: Date.now() - WEEK_MS, limit: 50 })
      ]);
      setActive(session.active);
      setStreak(streakData);
      setWeek(history);
    } catch (error) {
      console.error('Failed to load the dashboard:', error);
    }
  };

  useEffect(() => {
    void load();
    const offs = [
      window.electronAPI.on('streak-changed', setStreak),
      window.electronAPI.on('data-cleared', () => void load())
    ];
    return () => offs.forEach((off) => off());
  }, []);

  const handleStart = async () => {
    try {
      setActive((await window.electronAPI.invoke('session-start')).active);
    } catch (error) {
      console.error('Failed to start session:', error);
    }
  };

  const handleStop = async () => {
    try {
      await window.electronAPI.invoke('session-stop');
      setActive(null);
      void load(); // the finished session shows up in the report card
    } catch (error) {
      console.error('Failed to stop session:', error);
    }
  };

  const handleUseFreeze = () => {
    alert('Streak freezes are coming soon!');
  };

  const latest: HistorySession | undefined = week?.sessions.find((s) => s.endedAt !== null);
  const skills = useSkills() ?? [];
  const strong = skills.filter((s) => s.status === 'strength');
  const weak = skills.filter((s) => s.status === 'weakness' || s.status === 'improving');

  return (
    <div className="view-container">
      <div className="view-header">
        <h1 className="view-title">Dashboard</h1>
        <p className="view-subtitle">
          {new Date().toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
        </p>
      </div>

      {/* 1. Start session */}
      <div className="card">
        <div className="card-header">
          <h2 className="card-title">Study Session</h2>
        </div>
        <div className="card-content">
          {active ? (
            <div>
              <p style={{ fontSize: '16px', color: '#27ae60', marginBottom: '16px' }}>
                ✅ Session active since {new Date(active.startedAt).toLocaleTimeString()}
              </p>
              <button className="btn btn-secondary" onClick={handleStop}>
                Stop Session
              </button>
            </div>
          ) : (
            <div>
              <p style={{ fontSize: '16px', color: '#6e6e73', marginBottom: '16px' }}>No active session</p>
              <button className="btn btn-primary" onClick={handleStart}>
                Start Session
              </button>
            </div>
          )}
        </div>
      </div>

      {/* 2. Latest session report */}
      <div className="card">
        <div className="card-header card-header-row">
          <h2 className="card-title">Latest Session Report</h2>
          <button className="link-btn" onClick={() => onNavigate('report')}>
            All reports →
          </button>
        </div>
        <div className="card-content">
          {latest ? (
            <div className="stats-grid">
              <Stat label={sessionDate(latest)} value={duration(totalSeconds(latest.seconds))} />
              <Stat label="Focused work" value={`${minutes(latest.seconds.work)}`} unit="min" />
              <Stat label="Hints asked" value={`${latest.hintCount}`} />
              <Stat label="Deepest hint" value={latest.deepestHintLevel ? `${latest.deepestHintLevel}` : '–'} unit="/ 5" />
            </div>
          ) : (
            <p className="list-item-subtitle" style={{ marginBottom: 16 }}>
              No finished session this week yet.
            </p>
          )}
          {latest && <SessionReport sessionId={latest.id} short />}
        </div>
      </div>

      {/* 3. Strengths and weaknesses now */}
      <div className="card">
        <div className="card-header card-header-row">
          <h2 className="card-title">Strengths & Weaknesses</h2>
          <button className="link-btn" onClick={() => onNavigate('skills')}>
            How to improve →
          </button>
        </div>
        <div className="card-content">
          {strong.length || weak.length ? (
            <div className="two-col">
              <div>
                <h3 className="list-item-title">💪 Strong</h3>
                <div className="chips">
                  {strong.slice(0, 6).map((s) => (
                    <span key={s.id} className="chip chip-strong" title={s.history[0]?.evidence}>
                      {s.name}
                    </span>
                  ))}
                  {!strong.length && <p className="list-item-subtitle">Nothing shown as strong yet.</p>}
                </div>
              </div>
              <div>
                <h3 className="list-item-title">🎯 To work on</h3>
                <div className="chips">
                  {weak.slice(0, 6).map((s) => (
                    <span key={s.id} className={`chip ${s.status === 'improving' ? 'chip-help' : 'chip-weak'}`} title={s.history[0]?.evidence}>
                      {s.name}
                      {s.status === 'improving' ? ' · improving' : ''}
                    </span>
                  ))}
                  {!weak.length && <p className="list-item-subtitle">No weak spots found yet.</p>}
                </div>
              </div>
            </div>
          ) : (
            <p className="list-item-subtitle">
              Study with Watch mode on and stop the session: your strengths and weak spots show up here.
            </p>
          )}
        </div>
      </div>

      {/* 4. Streak and self-reliance */}
      {streak && <StreakCalendar streak={streak} onUseFreeze={handleUseFreeze} />}
      <div className="card">
        <div className="card-header">
          <h2 className="card-title">Self-Reliance (last 7 days)</h2>
        </div>
        <div className="card-content">
          <p className="list-item-subtitle" style={{ marginBottom: 16 }}>
            Thinking for yourself first: less time on AI tools, fewer full answers.
          </p>
          <div className="stats-grid">
            <Stat label="Time on AI tools" value={`${minutes(week?.totals.seconds.ai_tool ?? 0)}`} unit="min" />
            <Stat label="Hints asked" value={`${week?.totals.hintCount ?? 0}`} />
            <Stat
              label="Sessions that needed the full answer"
              value={`${week?.sessions.filter((s) => s.deepestHintLevel >= 5).length ?? 0}`}
            />
            <Stat label="Distracted" value={`${minutes(week?.totals.seconds.distraction ?? 0)}`} unit="min" />
          </div>
          <Planned
            owner="Tuan"
            shows={['One self-reliance score per day, shown with the streak (how much was done without AI)']}
            source="AI-tool time and warnings, hint depth, 'Show the answer' use"
          />
        </div>
      </div>

      {/* 5. Productivity curve (optional) */}
      <div className="card">
        <div className="card-header">
          <h2 className="card-title">Focus</h2>
        </div>
        <div className="card-content">
          {week && week.sessions.length > 0 ? (
            <FocusBars sessions={week.sessions.slice(0, 5)} />
          ) : (
            <p className="list-item-subtitle">No sessions this week yet.</p>
          )}
          <div style={{ marginTop: 16 }}>
            <Planned
              owner="optional"
              shows={['A focus curve inside each session: when your focus drops and you start side-tracking']}
              source="Watch mode's looks (studying vs browsing), idle time, distraction warnings"
            />
          </div>
        </div>
      </div>
    </div>
  );
}

function Stat({ label, value, unit }: { label: string; value: string; unit?: string }) {
  return (
    <div className="stat-card">
      <p className="stat-label">{label}</p>
      <p className="stat-value">
        {value}
        {unit && <span className="stat-unit">{unit}</span>}
      </p>
    </div>
  );
}
