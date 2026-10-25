import { useEffect, useMemo, useState } from 'react';
import { PixelCard, PixelButton, OptionButton, Chip, OutcomeTag, SegBar, SampleNotice } from '../pixel-components';
import type { PageView } from '../pixel-components';
import type { DashProblem, DashSession } from '../../../common/ipc-dashboard';
import { sampleSessions, sampleProblems, sampleTopics } from '../fixtures/sample';
import { useReports, type TimeFilter } from '../hooks/useReports';
import { useTopicScores } from '../hooks/useTopicScores';
import '../styles/tokens.css';
import './ReportPage.css';

const topicLabel = (id: string) => {
  const t = id.replace(/-/g, ' ');
  return t.charAt(0).toUpperCase() + t.slice(1);
};

export interface ReportPageProps {
  isSample: boolean;
  onNavigate: (view: PageView) => void;
}

export function ReportPage({ isSample, onNavigate }: ReportPageProps) {
  const [filter, setFilter] = useState<TimeFilter>('week');
  const [selectedSessionId, setSelectedSessionId] = useState<string>('');
  const [sessionProblems, setSessionProblems] = useState<DashProblem[]>([]);
  const [practiceNote, setPracticeNote] = useState<string | null>(null);

  const { sessions, loading, fetchSessionProblems } = useReports(filter);
  const { topicScores, startPracticeSession } = useTopicScores();

  const displaySessions: DashSession[] = isSample ? sampleSessions : sessions;
  const topics = isSample ? sampleTopics : topicScores;
  const selectedSession = displaySessions.find((s) => s.id === selectedSessionId) ?? displaySessions[0] ?? null;

  // Keep a valid selection when the list changes (filter switch, new session)
  useEffect(() => {
    if (displaySessions.length > 0 && !displaySessions.some((s) => s.id === selectedSessionId)) {
      setSelectedSessionId(displaySessions[0].id);
    }
  }, [displaySessions, selectedSessionId]);

  const selectedId = selectedSession?.id;
  useEffect(() => {
    let cancelled = false;
    if (!selectedId) {
      setSessionProblems([]);
      return;
    }
    if (isSample) {
      setSessionProblems(sampleProblems);
      return;
    }
    void fetchSessionProblems(selectedId).then((p) => {
      if (!cancelled) setSessionProblems(p);
    });
    return () => {
      cancelled = true;
    };
  }, [selectedId, isSample, fetchSessionProblems, sessions]);

  const totals = useMemo(() => {
    const minutes = displaySessions.reduce((n, s) => n + s.minutes, 0);
    const problems = displaySessions.reduce((n, s) => n + s.totalProblems, 0);
    const unaided = displaySessions.reduce((n, s) => n + s.solvedUnaided, 0);
    return {
      sessions: displaySessions.length,
      time: `${Math.floor(minutes / 60)}H ${String(minutes % 60).padStart(2, '0')}M`,
      problems,
      unaidedPct: problems > 0 ? `${Math.round((unaided / problems) * 100)}%` : '--'
    };
  }, [displaySessions]);

  const sessionTopics = new Set(selectedSession?.topics ?? []);
  const weakTopic = topics.find((t) => t.band === 'weak' && sessionTopics.has(t.topic)) ?? topics.find((t) => t.band === 'weak');
  const strongTopic = [...topics].reverse().find((t) => t.band === 'strong' && sessionTopics.has(t.topic)) ?? [...topics].reverse().find((t) => t.band === 'strong');

  const noticed = (() => {
    if (!selectedSession) return '';
    if (sessionProblems.length === 0) return 'No problems were logged in this session. Log them while you study and Wolfie can spot patterns.';
    const quickAi = sessionProblems.find((p) => p.aiUnlocked && !p.attemptWrittenFirst);
    if (quickAi) return `You opened AI on "${quickAi.title}" without writing an attempt first. Try writing a few lines before you ask.`;
    const stuck = sessionProblems.filter((p) => p.outcome === 'stuck');
    if (stuck.length > 0) return `You got stuck on ${stuck.map((p) => `"${p.title}"`).join(' and ')}. A 10-minute try-first rule can turn a stuck into a hint.`;
    if (sessionProblems.every((p) => p.outcome === 'solved' && !p.aiUnlocked)) return 'Every problem was solved on your own. That is exactly how the streak grows.';
    return 'You leaned on hints for some problems. Redo the hinted ones tomorrow without help.';
  })();

  const practice = async () => {
    if (!weakTopic) return;
    if (isSample) return setPracticeNote('Sample data. Finish a real session first.');
    try {
      await startPracticeSession(weakTopic);
      onNavigate('dashboard');
    } catch (err) {
      setPracticeNote(err instanceof Error ? err.message : 'Could not start practice.');
    }
  };

  const formatDate = (iso: string) => new Date(iso).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
  const formatTime = (iso: string) => new Date(iso).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });

  return (
    <div className="report-page">
      {/* Page header */}
      <div className="report-page__header">
        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
          <h1 className="ws-heading" style={{ margin: 0, fontSize: '20px', color: 'var(--ws-gold)' }}>
            REPORT
          </h1>
          <span style={{ fontSize: '16px', color: 'var(--ws-text-muted)' }}>
            Every study session: what you studied, which problems you worked, and how it went.
          </span>
        </div>
        <div style={{ display: 'flex', gap: '14px', flexWrap: 'wrap' }}>
          <OptionButton pressed={filter === 'week'} onClick={() => setFilter('week')} disabled={loading}>
            THIS WEEK
          </OptionButton>
          <OptionButton pressed={filter === 'month'} onClick={() => setFilter('month')} disabled={loading}>
            THIS MONTH
          </OptionButton>
          <OptionButton pressed={filter === 'all'} onClick={() => setFilter('all')} disabled={loading}>
            ALL TIME
          </OptionButton>
        </div>
      </div>

      {isSample && <SampleNotice>Showing an example until you finish your first session.</SampleNotice>}

      {/* Stats grid */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '32px' }}>
        <PixelCard style={{ flex: '1 1 150px', padding: '20px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
          <span className="ws-heading" style={{ fontSize: '10px', color: 'var(--ws-text-muted)' }}>SESSIONS</span>
          <span className="ws-heading" style={{ fontSize: '24px', color: 'var(--ws-gold)' }}>{totals.sessions}</span>
        </PixelCard>
        <PixelCard style={{ flex: '1 1 150px', padding: '20px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
          <span className="ws-heading" style={{ fontSize: '10px', color: 'var(--ws-text-muted)' }}>STUDY TIME</span>
          <span className="ws-heading" style={{ fontSize: '24px', color: 'var(--ws-gold)' }}>{totals.time}</span>
        </PixelCard>
        <PixelCard style={{ flex: '1 1 150px', padding: '20px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
          <span className="ws-heading" style={{ fontSize: '10px', color: 'var(--ws-text-muted)' }}>PROBLEMS WORKED</span>
          <span className="ws-heading" style={{ fontSize: '24px', color: 'var(--ws-gold)' }}>{totals.problems}</span>
        </PixelCard>
        <PixelCard style={{ flex: '1 1 150px', padding: '20px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
          <span className="ws-heading" style={{ fontSize: '10px', color: 'var(--ws-text-muted)' }}>SOLVED UNAIDED</span>
          <span className="ws-heading" style={{ fontSize: '24px', color: 'var(--ws-green)' }}>{totals.unaidedPct}</span>
        </PixelCard>
      </div>

      {/* Two column layout */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '32px', alignItems: 'flex-start' }}>
        {/* Session list */}
        <PixelCard
          as="section"
          aria-labelledby="list-h"
          style={{ flex: '1 1 320px', minWidth: 0, padding: '24px', display: 'flex', flexDirection: 'column', gap: '16px' }}
        >
          <h2 id="list-h" className="ws-heading" style={{ margin: 0, fontSize: '13px', color: 'var(--ws-gold)' }}>
            SESSIONS
          </h2>
          <span style={{ fontSize: '15px', color: 'var(--ws-text-muted)' }}>
            Number on the right: problems solved unaided.
          </span>
          {displaySessions.length === 0 ? (
            <span style={{ color: 'var(--ws-text-muted)', padding: '20px', textAlign: 'center' }}>
              {loading ? 'Loading sessions...' : 'No sessions in this time period. Try ALL TIME or start one from the Dashboard.'}
            </span>
          ) : (
            displaySessions.map(session => (
              <button
                key={session.id}
                type="button"
                className={`session-row ${selectedSessionId === session.id ? 'session-row--selected' : ''}`.trim()}
                onClick={() => setSelectedSessionId(session.id)}
              >
              <span style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column' }}>
                <span>{formatDate(session.startedAt)} · {formatTime(session.startedAt)}</span>
                <span style={{ fontSize: '15px', color: selectedSessionId === session.id ? 'var(--ws-text)' : 'var(--ws-text-muted)' }}>
                  {[session.course, session.studying].filter(Boolean).join(' · ')}
                </span>
              </span>
              <span className="ws-heading" style={{ fontSize: '11px' }}>
                {session.solvedUnaided}/{session.totalProblems}
              </span>
            </button>
          ))
        )}
        </PixelCard>

        {/* Session detail */}
        {selectedSession && (
        <PixelCard
          as="section"
          aria-labelledby="det-h"
          style={{ flex: '2 1 480px', minWidth: 0, padding: '26px', display: 'flex', flexDirection: 'column', gap: '22px' }}
        >
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            <h2 id="det-h" className="ws-heading" style={{ margin: 0, fontSize: '13px', color: 'var(--ws-gold)', textTransform: 'uppercase' }}>
              {formatDate(selectedSession.startedAt)} · {formatTime(selectedSession.startedAt)}{selectedSession.endedAt ? ` TO ${formatTime(selectedSession.endedAt)}` : ' · RUNNING'}
            </h2>
            <span style={{ fontSize: '16px', color: 'var(--ws-text-muted)' }}>
              {[selectedSession.course, selectedSession.studying, `${selectedSession.minutes} min`].filter(Boolean).join(' · ')}
            </span>
          </div>

          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '20px' }}>
            <PixelCard variant="inset" style={{ flex: '1 1 90px', padding: '14px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
              <span className="ws-heading" style={{ fontSize: '9px', color: 'var(--ws-text-muted)' }}>FOCUS SCORE</span>
              <span className="ws-heading" style={{ fontSize: '18px', color: 'var(--ws-gold)' }}>{selectedSession.focusScore ?? '--'}</span>
            </PixelCard>
            <PixelCard variant="inset" style={{ flex: '1 1 90px', padding: '14px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
              <span className="ws-heading" style={{ fontSize: '9px', color: 'var(--ws-text-muted)' }}>ATTEMPTS</span>
              <span className="ws-heading" style={{ fontSize: '18px', color: 'var(--ws-gold)' }}>{selectedSession.totalProblems}</span>
            </PixelCard>
            <PixelCard variant="inset" style={{ flex: '1 1 90px', padding: '14px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
              <span className="ws-heading" style={{ fontSize: '9px', color: 'var(--ws-text-muted)' }}>AI UNLOCKS</span>
              <span className="ws-heading" style={{ fontSize: '18px', color: 'var(--ws-gold)' }}>{selectedSession.aiUnlocks}</span>
            </PixelCard>
            <PixelCard variant="inset" style={{ flex: '1 1 90px', padding: '14px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
              <span className="ws-heading" style={{ fontSize: '9px', color: 'var(--ws-text-muted)' }}>HINTS</span>
              <span className="ws-heading" style={{ fontSize: '18px', color: 'var(--ws-gold)' }}>{selectedSession.hints}</span>
            </PixelCard>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            <span className="ws-heading" style={{ fontSize: '10px', color: 'var(--ws-text-muted)' }}>
              WHAT YOU STUDIED
            </span>
            <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
              {selectedSession.topics.map(topic => (
                <Chip key={topic}>{topicLabel(topic)}</Chip>
              ))}
            </div>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
            <span className="ws-heading" style={{ fontSize: '10px', color: 'var(--ws-text-muted)' }}>
              PROBLEM TIMELINE
            </span>
            {sessionProblems.length === 0 && (
              <span style={{ fontSize: '15px', color: 'var(--ws-text-muted)' }}>No problems logged for this session.</span>
            )}
            {sessionProblems.map(problem => (
              <PixelCard key={problem.id} variant="inset" style={{ padding: '14px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
                  <span className="ws-heading" style={{ fontSize: '9px', color: 'var(--ws-text-muted)', width: '96px', flexShrink: 0 }}>
                    {formatTime(problem.startedAt)}
                  </span>
                  <span style={{ flex: '1 1 180px', minWidth: 0, fontWeight: 600 }}>
                    {problem.title}
                  </span>
                  <OutcomeTag outcome={problem.outcome} />
                </div>
                <span style={{ fontSize: '15px', color: 'var(--ws-text-muted)' }}>
                  {topicLabel(problem.topic)} · {problem.minutes} min{problem.note ? `. ${problem.note}` : ''}
                </span>
              </PixelCard>
            ))}
          </div>

          {(weakTopic || strongTopic) && (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '22px' }}>
              {weakTopic && (
                <PixelCard variant="inset" style={{ flex: '1 1 180px', minWidth: 0, padding: '16px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
                  <span className="ws-heading" style={{ fontSize: '10px', color: 'var(--ws-weak-text)' }}>NEEDS WORK</span>
                  <span style={{ fontWeight: 600 }}>{weakTopic.name}</span>
                  <SegBar value={weakTopic.score10} tone="weak" label={`Topic score ${weakTopic.score10} of 10`} />
                  <span style={{ fontSize: '15px', color: 'var(--ws-text-muted)' }}>
                    Score {weakTopic.score10}/10. {weakTopic.usualStall ?? `${weakTopic.unaidedSolved} of ${weakTopic.attempted} solved unaided.`}
                  </span>
                </PixelCard>
              )}
              {strongTopic && (
                <PixelCard variant="inset" style={{ flex: '1 1 180px', minWidth: 0, padding: '16px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
                  <span className="ws-heading" style={{ fontSize: '10px', color: 'var(--ws-green)' }}>STRONG</span>
                  <span style={{ fontWeight: 600 }}>{strongTopic.name}</span>
                  <SegBar value={strongTopic.score10} tone="green" label={`Topic score ${strongTopic.score10} of 10`} />
                  <span style={{ fontSize: '15px', color: 'var(--ws-text-muted)' }}>
                    Score {strongTopic.score10}/10. {strongTopic.unaidedSolved} of {strongTopic.attempted} solved unaided.
                  </span>
                </PixelCard>
              )}
            </div>
          )}

          <PixelCard variant="inset" style={{ padding: '16px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
            <span className="ws-heading" style={{ fontSize: '10px', color: 'var(--ws-gold)' }}>WHAT WOLFIE NOTICED</span>
            <span>{noticed}</span>
          </PixelCard>

          <div style={{ display: 'flex', gap: '20px', flexWrap: 'wrap', alignItems: 'center' }}>
            <PixelButton tone="gold" onClick={practice} disabled={!weakTopic}>
              PRACTICE{weakTopic ? ` ${weakTopic.name.toUpperCase()}` : ''}
            </PixelButton>
            <PixelButton onClick={() => onNavigate('strength-weakness')}>OPEN STRENGTH / WEAKNESS</PixelButton>
            {practiceNote && <span role="status" style={{ fontSize: '15px', color: 'var(--ws-weak-text)' }}>{practiceNote}</span>}
          </div>
        </PixelCard>
        )}
      </div>
    </div>
  );
}
