import { useCallback, useEffect, useState } from 'react';
import type { DashSummary } from '../../../common/ipc-dashboard';
import { useLiveData } from './useLiveData';

export function useDashboard() {
  const [summary, setSummary] = useState<DashSummary | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    try {
      setSummary(await window.ipc.invoke('dash-summary'));
    } catch (error) {
      console.error('Failed to load dashboard summary:', error);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
    const timer = setInterval(() => void refresh(), 30_000); // a running session grows the curve and streak
    const off = window.ipc.on('streak-changed', () => void refresh());
    return () => {
      clearInterval(timer);
      off();
    };
  }, [refresh]);
  useLiveData(() => void refresh());

  return { summary, loading, refresh };
}
