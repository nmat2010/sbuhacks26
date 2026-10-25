import { useEffect, useState } from 'react';
import type { SkillView } from '../../../common/ipc-intelligence';

// Strengths & weaknesses across sessions (main: skills/record.ts, built from session reports):
// what to work on and how, what is improving, what is strong, and what only came up.

/** The record, kept current (empty until a session report has topics). */
export function useSkills(): SkillView[] | null {
  const [skills, setSkills] = useState<SkillView[] | null>(null);
  useEffect(() => {
    const load = () =>
      void window.electronAPI
        .invoke('skills-get')
        .then(setSkills)
        .catch(() => setSkills([]));
    load();
    const offs = [window.electronAPI.on('skills-updated', load), window.electronAPI.on('data-cleared', load)];
    return () => offs.forEach((off) => off());
  }, []);
  return skills;
}

export function SkillsView() {
  const skills = useSkills();
  const by = (status: SkillView['status']) => (skills ?? []).filter((s) => s.status === status);
  const weak = by('weakness');
  const improving = by('improving');
  const strong = by('strength');
  const touched = by('touched');

  return (
    <div className="view-container">
      <div className="view-header">
        <h1 className="view-title">Strengths & Weaknesses</h1>
        <p className="view-subtitle">Improve your weak spots while keeping your strengths sharp</p>
      </div>

      {skills !== null && skills.length === 0 && (
        <div className="card">
          <div className="card-content">
            <div className="empty-state">
              <div className="empty-state-icon">💪</div>
              <h3 className="empty-state-title">Nothing here yet</h3>
              <p className="empty-state-text">
                Study with Watch mode on and stop the session: Wolfie learns your strengths and weak spots from each session's report.
              </p>
            </div>
          </div>
        </div>
      )}

      {weak.length > 0 && (
        <div className="card">
          <div className="card-header">
            <h2 className="card-title">🎯 To work on</h2>
          </div>
          <div className="card-content">
            {weak.map((s) => (
              <SkillRow key={s.id} skill={s}>
                {s.plan.length > 0 && (
                  <>
                    <p className="skill-plan-title">How to improve</p>
                    <ul className="planned-list">
                      {s.plan.map((step) => (
                        <li key={step}>{step}</li>
                      ))}
                    </ul>
                  </>
                )}
              </SkillRow>
            ))}
          </div>
        </div>
      )}

      {improving.length > 0 && (
        <div className="card">
          <div className="card-header">
            <h2 className="card-title">📈 Improving</h2>
          </div>
          <div className="card-content">
            {improving.map((s) => (
              <SkillRow key={s.id} skill={s}>
                <p className="planned-source">Was a weak spot; show it again to make it a strength.</p>
              </SkillRow>
            ))}
          </div>
        </div>
      )}

      {strong.length > 0 && (
        <div className="card">
          <div className="card-header">
            <h2 className="card-title">💪 Strengths</h2>
          </div>
          <div className="card-content">
            {strong.map((s) => (
              <SkillRow key={s.id} skill={s} />
            ))}
          </div>
        </div>
      )}

      {touched.length > 0 && (
        <div className="card">
          <div className="card-header">
            <h2 className="card-title">Touched on</h2>
          </div>
          <div className="card-content">
            <p className="list-item-subtitle" style={{ marginBottom: 12 }}>
              These came up in your sessions, with nothing yet to show how well you know them.
            </p>
            <div className="chips">
              {touched.map((s) => (
                <span key={s.id} className="chip" title={s.history[0]?.evidence}>
                  {s.name}
                </span>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

const DOT: Record<SkillView['history'][number]['verdict'], { className: string; label: string }> = {
  strength: { className: 'dot-strong', label: 'strong' },
  weakness: { className: 'dot-weak', label: 'needed work' },
  practiced: { className: 'dot-touched', label: 'touched on' }
};

/** A skill: its latest evidence, a dot per session (oldest to newest), and extra content. */
function SkillRow({ skill, children }: { skill: SkillView; children?: React.ReactNode }) {
  const latest = skill.history.find((e) => e.verdict !== 'practiced') ?? skill.history[0];
  const sessions = skill.history.length;
  return (
    <div className="list-item" style={{ display: 'block' }}>
      <div className="skill-head">
        <h3 className="list-item-title">{skill.name}</h3>
        <span className="skill-dots" title="Each session, oldest to newest">
          {[...skill.history].reverse().map((e) => (
            <i key={e.sessionId} className={DOT[e.verdict].className} title={`${new Date(e.ts).toLocaleDateString()}: ${DOT[e.verdict].label}`} />
          ))}
        </span>
      </div>
      {latest && (
        <p className="list-item-subtitle">
          {latest.evidence} <span className="planned-source">· {new Date(latest.ts).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</span>
        </p>
      )}
      <p className="planned-source">
        {sessions} session{sessions === 1 ? '' : 's'}
      </p>
      {children}
    </div>
  );
}
