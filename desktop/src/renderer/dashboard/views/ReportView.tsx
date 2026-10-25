import { useEffect, useState } from 'react';
import type { HistoryData, HistorySession } from '../../../common/ipc-sensing';
import { FocusBars } from '../components/FocusBars';
import { SessionReport } from '../components/SessionReport';
import { duration, minutes, sessionDate, totalSeconds } from '../format';

// Reports: every study session (history-get) and the selected one's report: what was studied, the
// problems and how each went, strengths, weaknesses and next steps (written when it ended).

export function ReportView() {
  const [history, setHistory] = useState<HistoryData | null>(null);
  const [selected, setSelected] = useState<string | null>(null);

  useEffect(() => {
    const load = () =>
      void window.electronAPI
        .invoke('history-get', { limit: 30 })
        .then(setHistory)
        .catch((error) => console.error('Failed to load sessions:', error));
    load();
    return window.electronAPI.on('data-cleared', load);
  }, []);

  const sessions = history?.sessions ?? [];
  const session: HistorySession | undefined = sessions.find((s) => s.id === selected) ?? sessions[0];

  return (
    <div className="view-container">
      <div className="view-header">
        <h1 className="view-title">Reports</h1>
        <p className="view-subtitle">What you studied each session, and what to work on next</p>
      </div>

      {sessions.length === 0 ? (
        <div className="card">
          <div className="card-content">
            <div className="empty-state">
              <div className="empty-state-icon">📝</div>
              <h3 className="empty-state-title">No sessions yet</h3>
              <p className="empty-state-text">Start a study session from the Dashboard; its report shows up here.</p>
            </div>
          </div>
        </div>
      ) : (
        <>
          {/* The selected session's report */}
          {session && (
            <div className="card">
              <div className="card-header">
                <h2 className="card-title">{sessionDate(session)}</h2>
              </div>
              <div className="card-content">
                <div className="stats-grid">
                  <Stat label="Length" value={duration(totalSeconds(session.seconds))} />
                  <Stat label="Focused work" value={`${minutes(session.seconds.work)} min`} />
                  <Stat label="Hints asked" value={`${session.hintCount}`} />
                  <Stat label="Deepest hint" value={session.deepestHintLevel ? `${session.deepestHintLevel} / 5` : '–'} />
                </div>
                <FocusBars sessions={[session]} bare />
                <div style={{ marginTop: 20 }}>
                  <SessionReport sessionId={session.id} />
                </div>
              </div>
            </div>
          )}

          {/* All sessions */}
          <div className="card">
            <div className="card-header">
              <h2 className="card-title">Sessions</h2>
            </div>
            <div className="card-content">
              {sessions.map((s) => (
                <div
                  key={s.id}
                  className={`list-item session-row ${s.id === session?.id ? 'selected' : ''}`}
                  onClick={() => setSelected(s.id)}
                >
                  <div>
                    <h3 className="list-item-title">
                      {sessionDate(s)}
                      {s.label ? ` · ${s.label}` : ''}
                      {s.assessmentMode ? ' · graded work' : ''}
                    </h3>
                    <p className="list-item-subtitle">
                      {s.endedAt === null ? 'In progress · ' : ''}
                      {duration(totalSeconds(s.seconds))} · {minutes(s.seconds.work)} min focused · {s.hintCount} hints
                    </p>
                  </div>
                  <span className="link-btn">View</span>
                </div>
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="stat-card">
      <p className="stat-label">{label}</p>
      <p className="stat-value" style={{ fontSize: 24 }}>
        {value}
      </p>
    </div>
  );
}
