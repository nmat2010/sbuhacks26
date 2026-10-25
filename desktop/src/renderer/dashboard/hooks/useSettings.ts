import { useState, useEffect, useCallback } from 'react';
import type { DashPrefs } from '../../../common/ipc-dashboard';
import { useLiveData } from './useLiveData';

/** Dashboard preferences (powers, reports, independence rules, appearance). Saved by the main process. */
export function useSettings() {
  const [settings, setSettings] = useState<DashPrefs | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    try {
      setSettings(await window.ipc.invoke('dash-prefs-get'));
    } catch (error) {
      console.error('Failed to load settings:', error);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);
  useLiveData(() => void load());

  const updateSettings = useCallback(async (updates: Partial<DashPrefs>) => {
    const result = await window.ipc.invoke('dash-prefs-update', updates);
    if (!result.success) throw new Error(result.error ?? 'Could not save settings.');
    setSettings(result.prefs);
    return result.prefs;
  }, []);

  const resetSettings = useCallback(async () => {
    const result = await window.ipc.invoke('dash-prefs-reset');
    if (!result.success) throw new Error(result.error ?? 'Could not reset settings.');
    setSettings(result.prefs);
    return result.prefs;
  }, []);

  return { settings, loading, updateSettings, resetSettings };
}
