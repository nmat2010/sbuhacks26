import { useEffect, useMemo, useState } from 'react';
import { PixelCard, PixelButton, OptionButton, Badge, SegBar, SampleNotice } from '../pixel-components';
import type { PageView, SegBarTone, BadgeTone } from '../pixel-components';
import type { DashPracticeItem, DashTopicScore } from '../../../common/ipc-dashboard';
import { sampleTopics, samplePracticePlan } from '../fixtures/sample';
import { useTopicScores } from '../hooks/useTopicScores';
import { useBrightspace } from '../hooks/useBrightspace';
import '../styles/tokens.css';
import './StrengthWeaknessPage.css';

export interface StrengthWeaknessPageProps {
  isSample: boolean;
  onNavigate: (view: PageView) => void;
}

const BANDS: Array<{ band: DashTopicScore['band']; label: string; badge: BadgeTone; bar: SegBarTone }> = [
  { band: 'weak', label: 'WEAK', badge: 'weak', bar: 'weak' },
  { band: 'getting-there', label: 'GETTING THERE', badge: 'gold', bar: 'gold' },
  { band: 'strong', label: 'STRONG', badge: 'green', bar: 'green' }
];

export function StrengthWeaknessPage({ isSample, onNavigate }: StrengthWeaknessPageProps) {
  const [filter, setFilter] = useState<string>('all');
  const [practicePlan, setPracticePlan] = useState<DashPracticeItem[]>([]);
  const [isStartingPractice, setIsStartingPractice] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const { topicScores, loading, getPracticePlan, startPracticeSession } = useTopicScores(isSample || filter === 'all' ? undefined : filter);
  const { courses } = useBrightspace();

  const displayTopics = useMemo(
    () => (isSample ? sampleTopics.filter((t) => filter === 'all' || t.course === filter) : topicScores),
    [isSample, filter, topicScores]
  );

  // Course chips: every Brightspace course plus any course a scored topic belongs to
  const courseChips = useMemo(() => {
    const set = new Set<string>();
    for (const c of courses) set.add(c.code);
    for (const t of isSample ? sampleTopics : topicScores) if (t.course) set.add(t.course);
    return [...set].sort();
  }, [courses, topicScores, isSample]);

  const weakestTopic = useMemo(() => {
    const weak = displayTopics.filter((t) => t.band === 'weak');
    return weak.length ? weak.reduce((a, b) => (a.score10 <= b.score10 ? a : b)) : null;
  }, [displayTopics]);
  const strongestTopic = useMemo(() => {
    const strong = displayTopics.filter((t) => t.band === 'strong');
    return strong.length ? strong.reduce((a, b) => (a.score10 >= b.score10 ? a : b)) : null;
  }, [displayTopics]);

  const weakestId = weakestTopic?.topic;
  useEffect(() => {
    let cancelled = false;
    if (!weakestId) {
      setPracticePlan([]);
      return;
    }
    if (isSample) {
      setPracticePlan(samplePracticePlan);
      return;
    }
    void getPracticePlan(weakestId).then((plan) => {
      if (!cancelled) setPracticePlan(plan);
    });
    return () => {
      cancelled = true;
    };
  }, [weakestId, isSample, getPracticePlan]);

  const handleStartPractice = async () => {
    if (!weakestTopic) return;
    if (isSample) return setMessage('Sample data. Finish a real session first.');
    setIsStartingPractice(true);
    setMessage(null);
    try {
      await startPracticeSession(weakestTopic);
      onNavigate('dashboard'); // the session timer lives there
    } catch (err) {
      setMessage(err instanceof Error ? err.message : 'Could not start the practice session.');
    } finally {
      setIsStartingPractice(false);
    }
  };

  const counts = Object.fromEntries(BANDS.map((b) => [b.band, displayTopics.filter((t) => t.band === b.band).length]));

  return (
    <div className="strength-weakness-page">
      <div className="strength-weakness-page__header">
        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
          <h1 className="ws-heading" style={{ margin: 0, fontSize: '20px', color: 'var(--ws-gold)' }}>
            STRENGTH / WEAKNESS
          </h1>
          <span style={{ fontSize: '16px', color: 'var(--ws-text-muted)' }}>
            Your topic-by-topic scores. Based on speed and how often you solve unaided.
          </span>
        </div>
        <div style={{ display: 'flex', gap: '14px', flexWrap: 'wrap' }}>
          <OptionButton pressed={filter === 'all'} onClick={() => setFilter('all')}>ALL COURSES</OptionButton>
          {courseChips.map((code) => (
            <OptionButton key={code} pressed={filter === code} onClick={() => setFilter(code)}>
              {code}
            </OptionButton>
          ))}
        </div>
      </div>

      {isSample && <SampleNotice>Showing an example until you log problems in a session.</SampleNotice>}

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '32px' }}>
        {BANDS.map((b) => (
          <PixelCard key={b.band} style={{ flex: '1 1 150px', padding: '20px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
            <span className="ws-heading" style={{ fontSize: '10px', color: 'var(--ws-text-muted)' }}>{b.label}</span>
            <span
              className="ws-heading"
              style={{ fontSize: '24px', color: b.band === 'weak' ? 'var(--ws-weak-text)' : b.band === 'strong' ? 'var(--ws-green)' : 'var(--ws-gold)' }}
            >
              {counts[b.band]}
            </span>
          </PixelCard>
        ))}
      </div>

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '32px', alignItems: 'flex-start' }}>
        <PixelCard
          as="section"
          aria-labelledby="topics-h"
          style={{ flex: '2 1 480px', minWidth: 0, padding: '24px', display: 'flex', flexDirection: 'column', gap: '24px' }}
        >
          <h2 id="topics-h" className="ws-heading" style={{ margin: 0, fontSize: '13px', color: 'var(--ws-gold)' }}>
            ALL TOPICS
          </h2>

          {displayTopics.length === 0 && (
            <span style={{ color: 'var(--ws-text-muted)' }}>
              {loading
                ? 'Loading topics...'
                : filter === 'all'
                  ? 'No topics scored yet. Log problems during a session on the Dashboard and Wolfie scores each topic.'
                  : `No scored topics for ${filter} yet.`}
            </span>
          )}

          {BANDS.map((b) => {
            const list = displayTopics.filter((t) => t.band === b.band);
            if (list.length === 0) return null;
            return (
              <div className="topic-band" key={b.band}>
                <div className="topic-band__header">
                  <Badge tone={b.badge}>{b.label}</Badge>
                  <span style={{ fontSize: '15px', color: 'var(--ws-text-muted)' }}>
                    {list.length} {list.length === 1 ? 'topic' : 'topics'}
                  </span>
                </div>
                {list.map((topic) => (
                  <PixelCard key={topic.topic} variant="inset" className="topic-card">
                    <div className="topic-card__main">
                      <span style={{ fontWeight: 600 }}>{topic.name}</span>
                      <span className="ws-heading" style={{ fontSize: '11px', color: 'var(--ws-text-muted)' }}>
                        {topic.unaidedSolved}/{topic.attempted}
                      </span>
                    </div>
                    <SegBar value={topic.score10} tone={b.bar} label={`Score ${topic.score10} of 10`} />
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px', fontSize: '15px', color: 'var(--ws-text-muted)', flexWrap: 'wrap' }}>
                      {topic.course && (
                        <>
                          <span>{topic.course}</span>
                          <span>·</span>
                        </>
                      )}
                      <span>Score {topic.score10}/10</span>
                      {topic.changeVsTwoWeeks !== 0 && (
                        <>
                          <span>·</span>
                          <span style={{ color: topic.changeVsTwoWeeks > 0 ? 'var(--ws-green)' : 'var(--ws-weak-text)' }}>
                            {topic.changeVsTwoWeeks > 0 ? '+' : ''}{topic.changeVsTwoWeeks} vs 2 weeks ago
                          </span>
                        </>
                      )}
                    </div>
                  </PixelCard>
                ))}
              </div>
            );
          })}
        </PixelCard>

        <div style={{ flex: '1 1 320px', minWidth: 0, display: 'flex', flexDirection: 'column', gap: '32px' }}>
          {weakestTopic && (
            <PixelCard as="section" aria-labelledby="focus-h" style={{ padding: '24px', display: 'flex', flexDirection: 'column', gap: '18px' }}>
              <h2 id="focus-h" className="ws-heading" style={{ margin: 0, fontSize: '13px', color: 'var(--ws-weak-text)' }}>
                WORK ON THIS FIRST
              </h2>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                <span style={{ fontSize: '18px', fontWeight: 600 }}>{weakestTopic.name}</span>
                <SegBar value={weakestTopic.score10} tone="weak" label={`Score ${weakestTopic.score10} of 10`} />
                <span style={{ fontSize: '15px', color: 'var(--ws-text-muted)' }}>
                  Score {weakestTopic.score10}/10. {weakestTopic.usualStall ? `Usual stall: ${weakestTopic.usualStall}.` : `${weakestTopic.unaidedSolved} of ${weakestTopic.attempted} solved unaided.`}
                </span>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                <span className="ws-heading" style={{ fontSize: '10px', color: 'var(--ws-text-muted)' }}>PRACTICE PLAN</span>
                {practicePlan.map((item, idx) => (
                  <PixelCard key={idx} variant="inset" style={{ padding: '12px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '12px' }}>
                    <span style={{ fontSize: '15px' }}>{item.title}</span>
                    <span style={{ fontSize: '14px', color: 'var(--ws-text-muted)', whiteSpace: 'nowrap' }}>~{item.estimatedMin} min</span>
                  </PixelCard>
                ))}
              </div>
              <PixelButton tone="red" onClick={handleStartPractice} disabled={isStartingPractice}>
                {isStartingPractice ? 'STARTING...' : 'START PRACTICE'}
              </PixelButton>
              {message && <span role="status" style={{ fontSize: '15px', color: 'var(--ws-weak-text)' }}>{message}</span>}
            </PixelCard>
          )}

          {strongestTopic && (
            <PixelCard as="section" aria-labelledby="strong-h" style={{ padding: '24px', display: 'flex', flexDirection: 'column', gap: '14px' }}>
              <h2 id="strong-h" className="ws-heading" style={{ margin: 0, fontSize: '13px', color: 'var(--ws-green)' }}>
                STRONGEST
              </h2>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                <span style={{ fontSize: '18px', fontWeight: 600 }}>{strongestTopic.name}</span>
                <SegBar value={strongestTopic.score10} tone="green" label={`Score ${strongestTopic.score10} of 10`} />
                <span style={{ fontSize: '15px', color: 'var(--ws-text-muted)' }}>
                  Score {strongestTopic.score10}/10. {strongestTopic.unaidedSolved} of {strongestTopic.attempted} solved unaided.
                </span>
              </div>
            </PixelCard>
          )}
        </div>
      </div>
    </div>
  );
}
