import { useState, useEffect, useCallback, useRef } from 'react';
import type { DashMaterial } from '../../../common/ipc-dashboard';
import { useLiveData } from './useLiveData';

export type MaterialFilter = 'all' | 'new' | 'weak-spots';

export function useBrightspaceMaterial(filter: MaterialFilter, courseFilter?: string) {
  const [materials, setMaterials] = useState<DashMaterial[]>([]);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const args = useRef({ filter, courseFilter });
  args.current = { filter, courseFilter };

  const fetchMaterials = useCallback(async () => {
    try {
      const { filter: f, courseFilter: c } = args.current;
      const data = await window.ipc.invoke('brightspace-get-materials', {
        filter: f === 'all' ? undefined : f,
        courseFilter: c
      });
      setMaterials(Array.isArray(data) ? data : []);
      setError(null);
    } catch (err) {
      console.error('Failed to fetch Brightspace materials:', err);
      setError(err as Error);
      setMaterials([]);
    } finally {
      setLoading(false);
    }
  }, []);

  /** Resolves with the sync outcome; never throws, the caller shows `error`. */
  const syncBrightspace = useCallback(async () => {
    setSyncing(true);
    try {
      const result = await window.ipc.invoke('brightspace-sync');
      await fetchMaterials();
      return result;
    } finally {
      setSyncing(false);
    }
  }, [fetchMaterials]);

  const openMaterial = useCallback(async (materialId: string) => {
    return window.ipc.invoke('brightspace-open-material', { materialId });
  }, []);

  useEffect(() => {
    setLoading(true);
    void fetchMaterials();
  }, [filter, courseFilter, fetchMaterials]);
  useLiveData(() => void fetchMaterials());

  return { materials, loading, syncing, error, refresh: fetchMaterials, syncBrightspace, openMaterial };
}
