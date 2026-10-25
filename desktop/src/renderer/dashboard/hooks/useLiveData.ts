import { useEffect, useRef } from 'react';

type Refetch = () => void;

/** Calls `refetch` whenever the main process says dashboard data changed (problems, prefs, Brightspace, sessions). */
export function useLiveData(refetch: Refetch): void {
  const ref = useRef(refetch);
  ref.current = refetch;
  useEffect(() => {
    const call = () => ref.current();
    const offs = [
      window.ipc.on('dash-data-changed', call),
      window.ipc.on('session-changed', call),
      window.ipc.on('data-cleared', call)
    ];
    return () => offs.forEach((off) => off());
  }, []);
}
