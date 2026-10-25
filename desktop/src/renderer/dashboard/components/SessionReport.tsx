import { useEffect, useState } from 'react';
import type { SessionReportView } from '../../../common/ipc-intelligence';

// A study session's report (main: report/), in full for the Reports page or short for the
// Dashboard's latest-report card. Loads by session id and follows 'report-updated'.

type Problem = SessionReportView['facts']['problems'][number];
type Topic = NonNullable<SessionReportView['prose']>['topics'][number];

const OUTCOME: Record<Problem['outcome'], { label: string; className: string }> = {
  solved_alone: { label: 'Solved on your own', className: 'chip-strong' },
  solved_with_help: { label: 'Solved with help', className: 'chip-help' },
  answer_shown: { label: 'Needed the answer', className: 'chip-weak' },
  unresolved: { label: 'Still open', className: 'chip-weak' }
};

/** A problem with nothing more to say about it. */
const NO_DETAILS: Record<Problem['outcome'], string> = {
  solved_alone: 'Right the first time',
  solved_with_help: '',
  answer_shown: '',
  unresolved: 'No answer checked yet'
};

const VERDICT: Record<Topic['verdict'], { label: string; className: string }> = {
  strength: { label: 'Strength', className: 'chip-strong' },
  weakness: { label: 'To work on', className: 'chip-weak' },
  // It came up, with no evidence either way (reading alone doesn't show understanding)
  practiced: { label: 'Touched on', className: '' }
};

/** The report for `sessionId`, kept current; undefined while loading, null if there is none. */
export function useSessionReport(sessionId: string | null): SessionReportView | null | undefined {
  const [report, setReport] = useState<SessionReportView | null | undefined>(undefined);
  useEffect(() => {
    if (!sessionId) {
      setReport(null);
      return;
    }
    setReport(undefined);
    const load = () =>
      void window.electronAPI
        .invoke('report-get', sessionId)
        .then(setReport)
        .catch(() => setReport(null));
    load();
    return window.electronAPI.on('report-updated', (e) => {
      if (e.sessionId === sessionId) load();
    });
  }, [sessionId]);
  return report;
}

export function SessionReport({ sessionId, short = false }: { sessionId: string; short?: boolean }) {
  const report = useSessionReport(sessionId);
  const [retrying, setRetrying] = useState(false);

  if (report === undefined) return <p className="list-item-subtitle">Loading the report...</p>;
  if (report === null) {
    return <p className="list-item-subtitle">No report for this session (it ended before reports existed, or it's still running).</p>;
  }
  if (report.status === 'pending') return <p className="list-item-subtitle">✍️ Wolfie is writing your report...</p>;

  const { facts, prose } = report;
  const retry = async () => {
    setRetrying(true);
    await window.electronAPI.invoke('report-regenerate', report.sessionId).catch(() => undefined);
    setRetrying(false);
  };

  const notWatched = !facts.watched && !facts.problems.length && !facts.questionsAsked.length;

  return (
    <div className="session-report">
      {prose && (
        <>
          <h3 className="report-headline">{prose.headline}</h3>
          <p className="report-summary">{prose.summary}</p>
          {/* The short card shows topics as chips; the full report lists them below */}
          {short && prose.topics.length > 0 && (
            <div className="chips" style={{ marginBottom: 12 }}>
              {prose.topics.map((t) => (
                <span key={t.name} className={`chip ${VERDICT[t.verdict].className}`} title={t.evidence}>
                  {t.name} · {VERDICT[t.verdict].label}
                </span>
              ))}
            </div>
          )}
        </>
      )}

      {report.status === 'failed' && (
        <p className="report-error">
          {report.error ?? "The written report is missing."}{' '}
          <button className="link-btn" disabled={retrying} onClick={() => void retry()}>
            {retrying ? 'Writing...' : 'Try again'}
          </button>
        </p>
      )}

      {notWatched && (
        <p className="list-item-subtitle">Turn on Watch mode during a session so Wolfie can see what you study and write the full report.</p>
      )}

      {short ? (
        facts.problems.length > 0 && (
          <p className="list-item-subtitle">
            {facts.problems.length} problem{facts.problems.length === 1 ? '' : 's'}:{' '}
            {facts.problems.filter((p) => p.outcome === 'solved_alone').length} solved on your own,{' '}
            {facts.problems.filter((p) => p.outcome === 'answer_shown' || p.outcome === 'unresolved').length} to revisit
          </p>
        )
      ) : (
        <>
          {prose && prose.topics.length > 0 && (
            <ReportSection title="Strengths & weaknesses">
              {prose.topics.map((t) => (
                <div key={t.name} className="report-row">
                  <span className={`chip ${VERDICT[t.verdict].className}`}>{VERDICT[t.verdict].label}</span>
                  <div>
                    <strong>{t.name}</strong>
                    <p className="list-item-subtitle">{t.evidence}</p>
                  </div>
                </div>
              ))}
            </ReportSection>
          )}

          {facts.problems.length > 0 && (
            <ReportSection title="Problems you worked on">
              {facts.problems.map((p) => (
                <div key={p.question} className="report-row">
                  <span className={`chip ${OUTCOME[p.outcome].className}`}>{OUTCOME[p.outcome].label}</span>
                  <div>
                    <strong>{p.question}</strong>
                    <p className="list-item-subtitle">
                      {[
                        p.wrongAttempts ? `${p.wrongAttempts} wrong attempt${p.wrongAttempts === 1 ? '' : 's'}` : null,
                        p.hintLevel ? `hints up to level ${p.hintLevel}` : null,
                        p.stalled ? 'paused on it' : null,
                        ...p.issues
                      ]
                        .filter(Boolean)
                        .join(' · ') || NO_DETAILS[p.outcome]}
                    </p>
                  </div>
                </div>
              ))}
            </ReportSection>
          )}

          {facts.sources.length > 0 && (
            <ReportSection title="What you studied">
              {facts.sources.map((s) => (
                <div key={`${s.kind}-${s.title}`} className="report-row">
                  <span className="chip">{s.kind}</span>
                  <div>
                    <strong>{s.title}</strong>
                    <p className="list-item-subtitle">
                      {/* Where they got to (the latest place; earlier ones repeat it) */}
                      ~{Math.max(1, s.minutes)} min{s.locators.length ? ` · ${s.locators[s.locators.length - 1]}` : ''}
                    </p>
                  </div>
                </div>
              ))}
            </ReportSection>
          )}

          {facts.questionsAsked.length > 0 && (
            <ReportSection title="Questions you asked Wolfie">
              <ul className="planned-list">
                {facts.questionsAsked.map((q, i) => (
                  <li key={i}>{q}</li>
                ))}
              </ul>
            </ReportSection>
          )}

          {prose && prose.next_steps.length > 0 && (
            <ReportSection title="Next time">
              <ul className="planned-list">
                {prose.next_steps.map((s) => (
                  <li key={s}>{s}</li>
                ))}
              </ul>
            </ReportSection>
          )}

          {/* Written again from the saved facts (tidied: one entry per problem, real questions) */}
          {report.status === 'ready' && prose && (
            <p className="planned-source" style={{ marginTop: 16 }}>
              <button className="link-btn" disabled={retrying} onClick={() => void retry()}>
                {retrying ? 'Rewriting...' : 'Rewrite report'}
              </button>
            </p>
          )}
        </>
      )}
    </div>
  );
}

function ReportSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="report-section">
      <h4 className="report-section-title">{title}</h4>
      {children}
    </div>
  );
}
