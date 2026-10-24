import { SettingsDefaults } from '@wolfie/shared';

// The one swappable rule for "did the student show up today" (SPEC Phase 9). Change this function
// (or pass another to replayStreak) to change what counts; nothing else knows the threshold.

export interface DayStats {
  /** Local calendar date, 'YYYY-MM-DD'. */
  localDate: string;
  /** Focused minutes that day, both devices combined, work category only. */
  focusMinutes: number;
}

/** A day qualifies with at least `qualifyingMinutes` focused minutes (setting `streak.qualifying_minutes`). */
export function dayQualifies(
  day: DayStats,
  qualifyingMinutes: number = SettingsDefaults['streak.qualifying_minutes']
): boolean {
  return day.focusMinutes >= qualifyingMinutes;
}

export type DayQualifier = typeof dayQualifies;
