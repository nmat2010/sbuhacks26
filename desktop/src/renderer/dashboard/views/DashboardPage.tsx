import { useEffect, useRef, useState } from 'react';
import {
  PixelCard,
  PixelButton,
  PixelInput,
  OptionButton,
  Chip,
  OutcomeTag,
  SegBar,
  StreakGrid,
  StepChart,
  WolfieSprite,
  SampleNotice,
  CountUp
} from '../pixel-components';
import type { PageView } from '../pixel-components';
import type { DashOutcome, DashSession, DashSummary } from '../../../common/ipc-dashboard';
import { sampleSummary } from '../fixtures/sample';
import { useSession, useAppStatus, useBrightspace } from '../hooks';
import '../styles/tokens.css';
import './DashboardPage.css';

const topicLabel = (id: string) => {
  const t = id.replace(/-/g, ' ');
  return t.charAt(0).toUpperCase() + t.slice(1);
};

const clock = (ms: number) => {
  const total = Math.max(0, Math.floor(ms / 1000));
  return `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`;
};

const hour12 = (h: number) => `${h % 12 === 0 ? 12 : h % 12}`;
const meridiem = (h: number) => (h >= 12 ? 'PM' : 'AM');
function hourRange(h: number): string {
  const next = (h + 1) % 24;
  return meridiem(h) === meridiem(next) ? `${hour12(h)} to ${hour12(next)} ${meridiem(next)}` : `${hour12(h)} ${meridiem(h)} to ${hour12(next)} ${meridiem(next)}`;
}

function sessionLine(s: DashSession): string {
  const start = new Date(s.startedAt);
  const day = start.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
  const t = (d: Date) => d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
  const range = s.endedAt ? `${t(start)} to ${t(new Date(s.endedAt))}` : `${t(start)}, running`;
  return [day, range, `${s.minutes} min`, s.course].filter(Boolean).join(' · ');
}

export interface DashboardPageProps {
  summary: DashSummary | null;
  onNavigate: (view: PageView) => void;
}

export function DashboardPage({ summary, onNavigate }: DashboardPageProps) {
  const [studyTopic, setStudyTopic] = useState('');
  const topicTouched = useRef(false);
  const [timerChoice, setTimerChoice] = useState<25 | 50 | 90>(25);
  const [isStarting, setIsStarting] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [now, setNow] = useState(Date.now());

  const { session, stopSession, isActive } = useSession();
  const { status } = useAppStatus();
  const { semester, courses, isSynced } = useBrightspace();

  const isSample = !!summary && !summary.latestSession;
  const data: DashSummary | null = summary ? (isSample ? sampleSummary : summary) : null;

  // Suggest the weakest topic until the student types their own
  useEffect(() => {
    if (!topicTouched.current && data?.suggestedTopic) setStudyTopic(data.suggestedTopic);
  }, [data?.suggestedTopic]);

  // Tick the running-session clock
  useEffect(() => {
    if (!isActive) return;
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [isActive]);

  const handleStartSession = async () => {
    setIsStarting(true);
    setMessage(null);
    try {
      const result = await window.ipc.invoke('dash-session-start', {
        studying: studyTopic.trim(),
        plannedMinutes: timerChoice
      });
      if (!result.success) setMessage(result.error ?? 'Could not start the session.');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Could not start the session.');
    } finally {
      setIsStarting(false);
    }
  };

  const handleStopSession = async () => {
    setMessage(null);
    try {
      await stopSession();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Could not end the session.');
    }
  };

  if (!data) {
    return (
      <div className="dashboard-page">
        <h1 className="ws-heading" style={{ margin: 0, fontSize: '20px', color: 'var(--ws-gold)' }}>DASHBOARD</h1>
      </div>
    );
  }

  const latest = data.latestSession;
  const problems = data.latestProblems;
  const weakTopic = data.topics.find((t) => t.band === 'weak');
  const strongTopic = [...data.topics].reverse().find((t) => t.band === 'strong');
  const streak = data.streak;
  const focused = data.hourlyFocus.filter((h) => h.score > 0);
  const peak = focused.length ? focused.reduce((m, h) => (h.score > m.score ? h : m)) : null;
  const low = focused.length > 1 ? focused.reduce((m, h) => (h.score < m.score ? h : m)) : null;

  const elapsedMs = session.active ? now - session.active.startedAt : 0;
  const plannedMs = timerChoice * 60_000;

  const dateStr = new Date().toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
  const semesterStr = semester || 'No semester yet';
  const courseCount = courses.length;

  return (
    <div className="dashboard-page">
      {/* Page header */}
      <div className="dashboard-page__header">
        <h1 className="ws-heading" style={{ margin: 0, fontSize: '20px', color: 'var(--ws-gold)' }}>
          DASHBOARD
        </h1>
        <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
          <Chip>{dateStr}</Chip>
          <Chip>{semesterStr}</Chip>
          <Chip>{courseCount} {courseCount === 1 ? 'course' : 'courses'}</Chip>
          {isSynced ? (
            <Chip style={{ color: 'var(--ws-green)' }}>Brightspace synced</Chip>
          ) : (
            <Chip style={{ color: 'var(--ws-text-muted)' }}>Brightspace not synced</Chip>
          )}
          {status.extensionConnected && (
            <Chip style={{ color: 'var(--ws-green)' }}>Extension connected</Chip>
          )}
        </div>
        {isSample && <SampleNotice>Showing an example until you finish your first session.</SampleNotice>}
      </div>

      {/* Start session card */}
      <PixelCard as="section" aria-labelledby="start-h" style={{ padding: '26px', display: 'flex', flexWrap: 'wrap', gap: '28px', alignItems: 'center' }}>
        <div style={{ flex: 'none', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '10px' }}>
          <WolfieSprite size={96} />
        </div>
        <div style={{ flex: '1 1 320px', minWidth: 0, display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <h2 id="start-h" className="ws-heading" style={{ margin: 0, fontSize: '13px', color: 'var(--ws-gold)' }}>
            {isActive && <span className="live-dot" aria-hidden="true" />}
            {isActive ? 'SESSION RUNNING' : 'START A STUDY SESSION'}
          </h2>
          {isActive ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              <span className="ws-heading" style={{ fontSize: '24px', color: elapsedMs >= plannedMs ? 'var(--ws-green)' : 'var(--ws-gold)' }} role="timer" aria-live="off">
                {clock(elapsedMs)} <span style={{ fontSize: '12px', color: 'var(--ws-text-muted)' }}>/ {clock(plannedMs)}</span>
              </span>
              <span style={{ fontSize: '15px', color: 'var(--ws-text-muted)' }}>
                {elapsedMs >= plannedMs ? 'Your timer is up. Log what you solved, then end the session or keep going.' : `Studying ${studyTopic || 'something new'}. Log each problem below as you finish it.`}
              </span>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              <label htmlFor="topic" className="ws-heading" style={{ fontSize: '10px', color: 'var(--ws-text-muted)' }}>
                WHAT ARE YOU STUDYING?
              </label>
              <PixelInput
                id="topic"
                type="text"
                value={studyTopic}
                maxLength={120}
                onChange={(e) => {
                  topicTouched.current = true;
                  setStudyTopic(e.target.value);
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !isStarting) void handleStartSession();
                }}
              />
              <span style={{ fontSize: '15px', color: 'var(--ws-text-muted)' }}>
                {data.suggestedTopic && studyTopic === data.suggestedTopic
                  ? 'Wolfie suggests this one. It is your weakest topic right now.'
                  : 'Type a topic. Wolfie groups your problems by it.'}
              </span>
            </div>
          )}
          <div style={{ display: 'flex', alignItems: 'center', gap: '14px', flexWrap: 'wrap' }}>
            <span className="ws-heading" style={{ fontSize: '10px', color: 'var(--ws-text-muted)' }}>
              TIMER
            </span>
            {([25, 50, 90] as const).map((m) => (
              <OptionButton key={m} pressed={timerChoice === m} onClick={() => setTimerChoice(m)}>
                {m} MIN
              </OptionButton>
            ))}
          </div>
        </div>
        <div style={{ flex: '0 1 270px', minWidth: '220px', display: 'flex', flexDirection: 'column', gap: '14px', alignItems: 'stretch' }}>
          {isActive ? (
            <PixelButton tone="red" size="lg" onClick={handleStopSession}>
              END SESSION
            </PixelButton>
          ) : (
            <PixelButton tone="gold" size="lg" onClick={handleStartSession} disabled={isStarting}>
              {isStarting ? 'STARTING...' : 'START SESSION'}
            </PixelButton>
          )}
          <span role="status" style={{ fontSize: '15px', color: message ? 'var(--ws-weak-text)' : 'var(--ws-text-muted)', textAlign: 'center' }}>
            {message ?? (isActive ? 'Session is active. Your work is being tracked.' : 'AI sites stay gated until you write an attempt.')}
          </span>
        </div>
      </PixelCard>

      {isActive && <ProblemLogger defaultTopic={studyTopic} />}

      {/* Two column layout */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '32px', alignItems: 'stretch' }}>
        {/* Latest session report */}
        <PixelCard
          as="section"
          aria-labelledby="rep-h"
          style={{
            flex: '2 1 460px',
            minWidth: 0,
            padding: '26px',
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'space-between',
            gap: '22px'
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '14px', flexWrap: 'wrap' }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              <h2 id="rep-h" className="ws-heading" style={{ margin: 0, fontSize: '13px', color: 'var(--ws-gold)' }}>
                LATEST SESSION REPORT
              </h2>
              <span style={{ fontSize: '16px', color: 'var(--ws-text-muted)' }}>
                {latest ? sessionLine(latest) : ''}
              </span>
            </div>
            <PixelButton size="sm" onClick={() => onNavigate('report')}>ALL REPORTS</PixelButton>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            <span className="ws-heading" style={{ fontSize: '10px', color: 'var(--ws-text-muted)' }}>
              WHAT YOU STUDIED
            </span>
            <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
              {(latest?.topics.length ? latest.topics : [latest?.studying ?? '']).filter(Boolean).map((t) => (
                <Chip key={t}>{topicLabel(t)}</Chip>
              ))}
            </div>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
            <span className="ws-heading" style={{ fontSize: '10px', color: 'var(--ws-text-muted)' }}>
              PROBLEMS YOU WORKED ON · {problems.length}
            </span>
            {problems.length === 0 && (
              <span style={{ fontSize: '15px', color: 'var(--ws-text-muted)' }}>
                No problems logged in this session. Log them while a session runs and they show up here.
              </span>
            )}
            {problems.map((problem, index) => (
              <PixelCard
                key={problem.id}
                variant="inset"
                style={{ padding: '12px 14px', display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}
              >
                <span className="ws-heading" style={{ fontSize: '10px', color: 'var(--ws-text-muted)', width: '14px' }}>
                  {index + 1}
                </span>
                <div style={{ flex: '1 1 200px', minWidth: 0, display: 'flex', flexDirection: 'column' }}>
                  <span>{problem.title}</span>
                  <span style={{ fontSize: '15px', color: 'var(--ws-text-muted)' }}>
                    {topicLabel(problem.topic)} · {problem.minutes} min · {problem.aiUnlocked ? 'AI unlocked after an attempt' : problem.hintsUsed > 0 ? `${problem.hintsUsed} hint, no AI` : 'unaided'}
                  </span>
                </div>
                <OutcomeTag outcome={problem.outcome} />
              </PixelCard>
            ))}
          </div>

          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '22px' }}>
            {weakTopic && (
              <PixelCard
                variant="inset"
                style={{ flex: '1 1 220px', minWidth: 0, padding: '16px', display: 'flex', flexDirection: 'column', gap: '10px' }}
              >
                <span className="ws-heading" style={{ fontSize: '10px', color: 'var(--ws-weak-text)' }}>
                  NEEDS WORK
                </span>
                <span style={{ fontWeight: 600 }}>{weakTopic.name}</span>
                <SegBar
                  value={weakTopic.score10}
                  tone="weak"
                  label={`Topic score ${weakTopic.score10} of 10`}
                />
                <span style={{ fontSize: '15px', color: 'var(--ws-text-muted)' }}>
                  Score {weakTopic.score10}/10. {weakTopic.usualStall ? `You stall on: ${weakTopic.usualStall.toLowerCase()}.` : `${weakTopic.unaidedSolved} of ${weakTopic.attempted} solved unaided.`}
                </span>
              </PixelCard>
            )}
            {strongTopic && (
              <PixelCard
                variant="inset"
                style={{ flex: '1 1 220px', minWidth: 0, padding: '16px', display: 'flex', flexDirection: 'column', gap: '10px' }}
              >
                <span className="ws-heading" style={{ fontSize: '10px', color: 'var(--ws-green)' }}>
                  STRONG
                </span>
                <span style={{ fontWeight: 600 }}>{strongTopic.name}</span>
                <SegBar
                  value={strongTopic.score10}
                  tone="green"
                  label={`Topic score ${strongTopic.score10} of 10`}
                />
                <span style={{ fontSize: '15px', color: 'var(--ws-text-muted)' }}>
                  Score {strongTopic.score10}/10. {strongTopic.unaidedSolved} of {strongTopic.attempted} solved unaided.
                </span>
              </PixelCard>
            )}
          </div>
        </PixelCard>

        {/* Sidebar */}
        <aside style={{ flex: '1 1 300px', minWidth: 0, display: 'flex', flexDirection: 'column', gap: '32px' }}>
          {/* Streak */}
          <PixelCard
            as="section"
            aria-labelledby="streak-h"
            style={{ padding: '24px', display: 'flex', flexDirection: 'column', gap: '16px' }}
          >
            <h2 id="streak-h" className="ws-heading" style={{ margin: 0, fontSize: '10px', color: 'var(--ws-gold)' }}>
              INDEPENDENCE STREAK
            </h2>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: '12px', flexWrap: 'wrap' }}>
              <span className="ws-heading" style={{ fontSize: '32px', color: 'var(--ws-gold)' }}>
                <CountUp value={streak.current} />
              </span>
              <span style={{ fontWeight: 600 }}>{streak.current === 1 ? 'day' : 'days'} on your own</span>
            </div>
            <span style={{ fontSize: '15px', color: 'var(--ws-text-muted)' }}>
              Best run: {streak.best} {streak.best === 1 ? 'day' : 'days'}. Today is still open.
            </span>

            <StreakGrid
              days={streak.days}
              label={`Last two weeks of your independence streak. Current: ${streak.current} days`}
            />
            <span style={{ fontSize: '14px', color: 'var(--ws-text-muted)' }}>
              Gold: clean day. X: leaned on AI. Dark: no session. Outline: today.
            </span>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: '10px', fontSize: '16px' }}>
                  <span>Tried first</span>
                  <span className="ws-muted">{Math.round(streak.triedFirstRate * 100)}%</span>
                </div>
                <SegBar
                  value={Math.round(streak.triedFirstRate * 10)}
                  tone="gold"
                  label={`${Math.round(streak.triedFirstRate * 100)} percent`}
                />
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: '10px', fontSize: '16px' }}>
                  <span>AI share of study time</span>
                  <span className="ws-muted">{Math.round(streak.aiShareOfTime * 100)}% of {Math.round(data.aiShareCap * 100)}% cap</span>
                </div>
                <SegBar
                  value={Math.min(10, Math.round((streak.aiShareOfTime / Math.max(data.aiShareCap, 0.01)) * 10))}
                  tone="gold"
                  label={`${Math.round(streak.aiShareOfTime * 100)} percent of a ${Math.round(data.aiShareCap * 100)} percent cap`}
                />
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: '10px', fontSize: '16px' }}>
                  <span>Solved unaided</span>
                  <span className="ws-muted">{Math.round(streak.solvedUnaidedRate * 100)}%</span>
                </div>
                <SegBar
                  value={Math.round(streak.solvedUnaidedRate * 10)}
                  tone="gold"
                  label={`${Math.round(streak.solvedUnaidedRate * 100)} percent`}
                />
              </div>
            </div>
            <span style={{ fontSize: '14px', color: 'var(--ws-text-muted)' }}>
              A day is clean when every AI unlock follows a written attempt and AI stays under your cap.
            </span>
          </PixelCard>

          {/* Sensei says */}
          <PixelCard
            as="section"
            aria-labelledby="says-h"
            style={{ padding: '24px', display: 'flex', flexDirection: 'column', gap: '16px' }}
          >
            <h2 id="says-h" className="ws-heading" style={{ margin: 0, fontSize: '10px', color: 'var(--ws-gold)' }}>
              SENSEI SAYS
            </h2>
            <p style={{ margin: 0, lineHeight: 1.4 }}>
              {data.senseiSays}
            </p>
            <PixelButton style={{ alignSelf: 'flex-start' }} onClick={() => onNavigate('strength-weakness')}>SEE WEAK SPOTS</PixelButton>
          </PixelCard>
        </aside>
      </div>

      {/* Productivity curve (hidden when switched off in Settings) */}
      {data.showProductivityCurve && (
        <PixelCard
          as="section"
          aria-labelledby="prod-h"
          style={{ padding: '26px', display: 'flex', flexWrap: 'wrap', gap: '32px', alignItems: 'flex-start' }}
        >
          <div style={{ flex: '2 1 440px', minWidth: 0, display: 'flex', flexDirection: 'column', gap: '12px' }}>
            <h2 id="prod-h" className="ws-heading" style={{ margin: 0, fontSize: '13px', color: 'var(--ws-gold)' }}>
              PRODUCTIVITY CURVE
            </h2>
            <span style={{ fontSize: '15px', color: 'var(--ws-text-muted)' }}>
              Focus score by hour of day, last 14 days
            </span>
            <StepChart
              data={data.hourlyFocus}
              label={
                peak
                  ? `Focus score by hour from 6 AM to 11 PM. It peaks at ${peak.score} around ${hourRange(peak.hour)}${low ? ` and dips to ${low.score} around ${hourRange(low.hour)}` : ''}.`
                  : 'Focus score by hour from 6 AM to 11 PM. No study time recorded yet.'
              }
            />
          </div>
          <div style={{ flex: '1 1 220px', minWidth: 0, display: 'flex', flexDirection: 'column', gap: '20px' }}>
            {peak ? (
              <>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                  <span className="ws-heading" style={{ fontSize: '10px', color: 'var(--ws-text-muted)' }}>PEAK WINDOW</span>
                  <span className="ws-heading" style={{ fontSize: '16px', color: 'var(--ws-gold)' }}>{hourRange(peak.hour)}</span>
                  <span style={{ fontSize: '15px', color: 'var(--ws-text-muted)' }}>Focus score {peak.score}</span>
                </div>
                {low && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                    <span className="ws-heading" style={{ fontSize: '10px', color: 'var(--ws-text-muted)' }}>LOW POINT</span>
                    <span className="ws-heading" style={{ fontSize: '16px', color: 'var(--ws-weak-text)' }}>{hourRange(low.hour)}</span>
                    <span style={{ fontSize: '15px', color: 'var(--ws-text-muted)' }}>Focus score {low.score}</span>
                  </div>
                )}
                <span style={{ fontSize: '15px', color: 'var(--ws-text)' }}>
                  {weakTopic
                    ? `Save hard topics like ${weakTopic.name.toLowerCase()} for your ${hourRange(peak.hour)} window.`
                    : `Your best focus is ${hourRange(peak.hour)}. Book your hardest work there.`}
                </span>
              </>
            ) : (
              <span style={{ fontSize: '15px', color: 'var(--ws-text-muted)' }}>
                Study for a while with a session running and Wolfie will find your best hours.
              </span>
            )}
          </div>
        </PixelCard>
      )}
    </div>
  );
}

const OUTCOMES: Array<{ id: DashOutcome; label: string }> = [
  { id: 'solved', label: 'SOLVED' },
  { id: 'hinted', label: 'HINTED' },
  { id: 'stuck', label: 'STUCK' }
];

/** Logs one problem into the running session (feeds reports, topic scores and the streak). */
function ProblemLogger({ defaultTopic }: { defaultTopic: string }) {
  const [title, setTitle] = useState('');
  const [topic, setTopic] = useState(defaultTopic);
  const [minutes, setMinutes] = useState('10');
  const [outcome, setOutcome] = useState<DashOutcome>('solved');
  const [aiUnlocked, setAiUnlocked] = useState(false);
  const [wroteFirst, setWroteFirst] = useState(true);
  const [remark, setRemark] = useState('');
  const [note, setNote] = useState<{ text: string; error?: boolean } | null>(null);
  const [saving, setSaving] = useState(false);
  const topicEdited = useRef(false);

  useEffect(() => {
    if (!topicEdited.current) setTopic(defaultTopic);
  }, [defaultTopic]);

  const submit = async () => {
    if (!title.trim()) return setNote({ text: 'Give the problem a title first.', error: true });
    setSaving(true);
    try {
      const r = await window.ipc.invoke('problem-log', {
        title,
        topic,
        minutes: Number(minutes) || 0,
        outcome,
        aiUnlocked,
        attemptWrittenFirst: wroteFirst,
        note: remark
      });
      if (r.success) {
        setNote({ text: `Logged: ${title.trim()}` });
        setTitle('');
        setRemark('');
        setAiUnlocked(false);
        setWroteFirst(true);
        setOutcome('solved');
      } else {
        setNote({ text: r.error ?? 'Could not log that problem.', error: true });
      }
    } catch (err) {
      setNote({ text: err instanceof Error ? err.message : 'Could not log that problem.', error: true });
    } finally {
      setSaving(false);
    }
  };

  return (
    <PixelCard as="section" aria-labelledby="log-h" style={{ padding: '24px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
      <h2 id="log-h" className="ws-heading" style={{ margin: 0, fontSize: '13px', color: 'var(--ws-gold)' }}>
        LOG A PROBLEM
      </h2>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '16px' }}>
        <div style={{ flex: '2 1 240px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
          <label htmlFor="log-title" className="ws-heading" style={{ fontSize: '10px', color: 'var(--ws-text-muted)' }}>PROBLEM</label>
          <PixelInput id="log-title" value={title} maxLength={200} placeholder="Longest common subsequence" onChange={(e) => setTitle(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter' && !saving) void submit(); }} />
        </div>
        <div style={{ flex: '1 1 180px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
          <label htmlFor="log-topic" className="ws-heading" style={{ fontSize: '10px', color: 'var(--ws-text-muted)' }}>TOPIC</label>
          <PixelInput id="log-topic" value={topic} maxLength={60} onChange={(e) => { topicEdited.current = true; setTopic(e.target.value); }} />
        </div>
        <div style={{ flex: '0 1 110px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
          <label htmlFor="log-min" className="ws-heading" style={{ fontSize: '10px', color: 'var(--ws-text-muted)' }}>MINUTES</label>
          <PixelInput id="log-min" type="number" min={0} max={600} value={minutes} onChange={(e) => setMinutes(e.target.value)} />
        </div>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
        <label htmlFor="log-note" className="ws-heading" style={{ fontSize: '10px', color: 'var(--ws-text-muted)' }}>WHERE DID YOU STALL? (OPTIONAL)</label>
        <PixelInput id="log-note" value={remark} maxLength={300} placeholder="Missed the base case on the first pass" onChange={(e) => setRemark(e.target.value)} />
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: '14px', flexWrap: 'wrap' }}>
        <span className="ws-heading" style={{ fontSize: '10px', color: 'var(--ws-text-muted)' }}>HOW IT WENT</span>
        {OUTCOMES.map((o) => (
          <OptionButton key={o.id} pressed={outcome === o.id} onClick={() => setOutcome(o.id)}>{o.label}</OptionButton>
        ))}
        <OptionButton pressed={aiUnlocked} onClick={() => setAiUnlocked((v) => !v)}>OPENED AI</OptionButton>
        <OptionButton pressed={wroteFirst} onClick={() => setWroteFirst((v) => !v)}>WROTE ATTEMPT FIRST</OptionButton>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: '18px', flexWrap: 'wrap' }}>
        <PixelButton tone="gold" onClick={submit} disabled={saving}>{saving ? 'SAVING...' : 'LOG PROBLEM'}</PixelButton>
        <span role="status" style={{ fontSize: '15px', color: note?.error ? 'var(--ws-weak-text)' : 'var(--ws-green)' }}>{note?.text}</span>
      </div>
    </PixelCard>
  );
}
