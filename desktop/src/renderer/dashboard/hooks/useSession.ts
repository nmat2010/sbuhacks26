import { useState, useEffect, useCallback } from 'react';

export interface SessionInfo {
  active: { id: string; startedAt: number; assessmentMode: boolean; goalId?: string } | null;
  paused: boolean;
}

export function useSession() {
  const [session, setSession] = useState<SessionInfo>({ active: null, paused: false });
  const [loading, setLoading] = useState(true);

  // Load initial session state
  useEffect(() => {
    const loadSession = async () => {
      try {
        const sessionInfo = await window.ipc.invoke('session-get');
        setSession(sessionInfo);
      } catch (error) {
        console.error('Failed to load session:', error);
      } finally {
        setLoading(false);
      }
    };

    loadSession();

    // Listen for session changes
    const unsubscribe = window.ipc.on('session-changed', (sessionInfo: SessionInfo) => {
      setSession(sessionInfo);
    });

    return unsubscribe;
  }, []);

  const startSession = useCallback(async (opts?: { assessmentMode?: boolean; goalId?: string }) => {
    try {
      const sessionInfo = await window.ipc.invoke('session-start', opts);
      setSession(sessionInfo);
      return sessionInfo;
    } catch (error) {
      console.error('Failed to start session:', error);
      throw error;
    }
  }, []);

  const stopSession = useCallback(async () => {
    try {
      const sessionInfo = await window.ipc.invoke('session-stop');
      setSession(sessionInfo);
      return sessionInfo;
    } catch (error) {
      console.error('Failed to stop session:', error);
      throw error;
    }
  }, []);

  const setAssessmentMode = useCallback(async (assessmentMode: boolean) => {
    try {
      const sessionInfo = await window.ipc.invoke('session-set-assessment', assessmentMode);
      setSession(sessionInfo);
      return sessionInfo;
    } catch (error) {
      console.error('Failed to set assessment mode:', error);
      throw error;
    }
  }, []);

  return {
    session,
    loading,
    startSession,
    stopSession,
    setAssessmentMode,
    isActive: session.active !== null,
    isPaused: session.paused
  };
}
