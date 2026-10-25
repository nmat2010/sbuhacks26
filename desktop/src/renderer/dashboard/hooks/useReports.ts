import { useState, useEffect, useCallback, useRef } from 'react';
import type { DashProblem, DashSession, DashTimeFilter } from '../../../common/ipc-dashboard';
import { useLiveData } from './useLiveData';

export type ReportSession = DashSession;
export type TimeFilter = DashTimeFilter;

export function useReports(filter: TimeFilter) {
  const [sessions, setSessions] = useState<ReportSession[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  const filterRef = useRef(filter);
  filterRef.current = filter;

  const fetchSessions = useCallback(async () => {
    try {
      const data = await window.ipc.invoke('reports-get-sessions', { filter: filterRef.current });
      setSessions(Array.isArray(data) ? data : []);
      setError(null);
    } catch (err) {
      console.error('Failed to fetch sessions:', err);
      setError(err as Error);
      setSessions([]);
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchSessionProblems = useCallback(async (sessionId: string): Promise<DashProblem[]> => {
    try {
      const problems = await window.ipc.invoke('reports-get-session-problems', { sessionId });
      return Array.isArray(problems) ? problems : [];
    } catch (err) {
      console.error('Failed to fetch session problems:', err);
      return [];
    }
  }, []);

  useEffect(() => {
    setLoading(true);
    void fetchSessions();
  }, [filter, fetchSessions]);
  useLiveData(() => void fetchSessions());

  return { sessions, loading, error, refresh: fetchSessions, fetchSessionProblems };
}
