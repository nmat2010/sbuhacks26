import type { CategorySeconds, HistorySession } from '../../common/ipc-sensing';

// Small display helpers shared by the dashboard pages.

export function minutes(seconds: number): number {
  return Math.round(seconds / 60);
}

/** "1 h 25 min" / "12 min". */
export function duration(seconds: number): string {
  const m = minutes(seconds);
  if (m < 60) return `${m} min`;
  return `${Math.floor(m / 60)} h ${m % 60} min`;
}

export function totalSeconds(s: CategorySeconds): number {
  return s.work + s.ai_tool + s.distraction + s.idle;
}

/** "Fri, Oct 24, 3:10 PM". */
export function sessionDate(session: HistorySession): string {
  return new Date(session.startedAt).toLocaleString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit'
  });
}

/** Shares of a session's time per category (0-100), for the focus bars. */
export function shares(s: CategorySeconds): CategorySeconds {
  const total = totalSeconds(s) || 1;
  return {
    work: (s.work / total) * 100,
    ai_tool: (s.ai_tool / total) * 100,
    distraction: (s.distraction / total) * 100,
    idle: (s.idle / total) * 100
  };
}
