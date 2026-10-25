import { useState, useEffect } from 'react';

export interface AppStatus {
  extensionConnected: boolean;
  extensionListening: boolean;
  syncListening: boolean;
  pairedDevices: number;
  geminiKeyPresent: boolean;
  elevenLabsKeyPresent: boolean;
  demoMode: boolean;
  sessionActive: boolean;
  paused: boolean;
}

export function useAppStatus() {
  const [status, setStatus] = useState<AppStatus>({
    extensionConnected: false,
    extensionListening: false,
    syncListening: false,
    pairedDevices: 0,
    geminiKeyPresent: false,
    elevenLabsKeyPresent: false,
    demoMode: false,
    sessionActive: false,
    paused: false
  });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const loadStatus = async () => {
      try {
        const statusData = await window.ipc.invoke('status-get');
        setStatus(statusData);
      } catch (error) {
        console.error('Failed to load app status:', error);
      } finally {
        setLoading(false);
      }
    };

    loadStatus();

    // Poll for status updates every 5 seconds
    const interval = setInterval(loadStatus, 5000);

    // Listen for extension status changes
    const unsubscribe = window.ipc.on('extension-status', ({ connected }: { connected: boolean }) => {
      setStatus(prev => ({ ...prev, extensionConnected: connected }));
    });

    return () => {
      clearInterval(interval);
      unsubscribe();
    };
  }, []);

  return {
    status,
    loading
  };
}
