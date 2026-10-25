import { useState, useEffect, useCallback, useRef } from 'react';
import type { DashPracticeItem, DashTopicScore } from '../../../common/ipc-dashboard';
import { useLiveData } from './useLiveData';

export function useTopicScores(courseFilter?: string) {
  const [topicScores, setTopicScores] = useState<DashTopicScore[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  const courseRef = useRef(courseFilter);
  courseRef.current = courseFilter;

  const fetchTopicScores = useCallback(async () => {
    try {
      const data = await window.ipc.invoke('reports-get-topic-scores', { courseFilter: courseRef.current });
      setTopicScores(Array.isArray(data) ? data : []);
      setError(null);
    } catch (err) {
      console.error('Failed to fetch topic scores:', err);
      setError(err as Error);
      setTopicScores([]);
    } finally {
      setLoading(false);
    }
  }, []);

  const getPracticePlan = useCallback(async (topicId: string): Promise<DashPracticeItem[]> => {
    try {
      const plan = await window.ipc.invoke('reports-get-practice-plan', { topicId });
      return Array.isArray(plan) ? plan : [];
    } catch (err) {
      console.error('Failed to fetch practice plan:', err);
      return [];
    }
  }, []);

  /** Starts a session whose topic is the weak one. */
  const startPracticeSession = useCallback(async (topic: DashTopicScore) => {
    const result = await window.ipc.invoke('dash-session-start', {
      studying: topic.name,
      topic: topic.topic,
      plannedMinutes: 25
    });
    if (!result.success) throw new Error(result.error ?? 'Could not start the session.');
  }, []);

  useEffect(() => {
    setLoading(true);
    void fetchTopicScores();
  }, [courseFilter, fetchTopicScores]);
  useLiveData(() => void fetchTopicScores());

  return { topicScores, loading, error, refresh: fetchTopicScores, getPracticePlan, startPracticeSession };
}
