import type { HistorySession } from '../../../common/ipc-sensing';
import { duration, sessionDate, shares, totalSeconds } from '../format';

// How each session's time split between focused work, AI tools, distractions and idle.

/** `bare`: just the bar (one session whose date and length are already shown above it). */
export function FocusBars({ sessions, bare = false }: { sessions: HistorySession[]; bare?: boolean }) {
  return (
    <div>
      {sessions.map((s) => {
        const p = shares(s.seconds);
        return (
          <div key={s.id} className="focus-row" style={bare ? { gridTemplateColumns: '1fr' } : undefined}>
            {!bare && <span>{sessionDate(s)}</span>}
            <div className="focus-bar" title={`Work ${Math.round(p.work)}% · AI ${Math.round(p.ai_tool)}% · Distracted ${Math.round(p.distraction)}% · Idle ${Math.round(p.idle)}%`}>
              <span className="focus-work" style={{ width: `${p.work}%` }} />
              <span className="focus-ai" style={{ width: `${p.ai_tool}%` }} />
              <span className="focus-distraction" style={{ width: `${p.distraction}%` }} />
              <span className="focus-idle" style={{ width: `${p.idle}%` }} />
            </div>
            {!bare && <span style={{ textAlign: 'right' }}>{duration(totalSeconds(s.seconds))}</span>}
          </div>
        );
      })}
      <div className="legend">
        <span><i className="focus-work" />Focused work</span>
        <span><i className="focus-ai" />AI tools</span>
        <span><i className="focus-distraction" />Distracted</span>
        <span><i className="focus-idle" />Idle</span>
      </div>
    </div>
  );
}
