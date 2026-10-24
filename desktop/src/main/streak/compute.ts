import { addDays, dateRange } from './calendar.js';
import { dayQualifies, type DayQualifier } from './rules.js';

// Pure streak replay (SPEC Phase 9): given focused minutes per local date, derive the streak.
// It always replays from the first qualifying day, so late-synced sessions, edited thresholds or
// a changed rule simply produce the corrected answer; there is no incremental state to repair.
//
//   - a qualifying day adds 1 to the current streak; every 7th consecutive qualifying day earns a
//     freeze (at most MAX_FREEZES stored)
//   - a missed day consumes a freeze if one is stored (the streak is kept, the day does not count),
//     otherwise the streak resets to 0
//   - today never counts as missed: it is 'pending' until it qualifies

export const MAX_FREEZES = 2;
export const FREEZE_EVERY_DAYS = 7;
export const MILESTONES = [3, 7, 14, 30, 60, 100] as const;

export type DayStatus = 'filled' | 'frozen' | 'missed' | 'pending';

export interface ReplayInput {
  minutesByDate: ReadonlyMap<string, number>;
  /** Today's local date. */
  today: string;
  qualifyingMinutes: number;
  qualifies?: DayQualifier;
}

export interface DayResult {
  date: string;
  minutes: number;
  status: DayStatus;
}

export interface ReplayResult {
  current: number;
  longest: number;
  freezesAvailable: number;
  /** Date of the most recent freeze grant. */
  lastFreezeGrant: string | null;
  todayQualified: boolean;
  todayMinutes: number;
  days: Map<string, DayResult>;
  /** Dates a freeze covered. */
  frozenDates: string[];
  /** Dates on which a streak of `previous` days ended. */
  resets: { date: string; previous: number }[];
}

export function replayStreak(input: ReplayInput): ReplayResult {
  const qualifies = input.qualifies ?? dayQualifies;
  const { minutesByDate, today, qualifyingMinutes } = input;
  const minutesOn = (date: string) => minutesByDate.get(date) ?? 0;
  const ok = (date: string) => qualifies({ localDate: date, focusMinutes: minutesOn(date) }, qualifyingMinutes);

  const result: ReplayResult = {
    current: 0,
    longest: 0,
    freezesAvailable: 0,
    lastFreezeGrant: null,
    todayQualified: ok(today),
    todayMinutes: Math.floor(minutesOn(today)),
    days: new Map(),
    frozenDates: [],
    resets: []
  };

  const past = [...minutesByDate.keys()].filter((d) => d <= today).sort();
  const first = past.find((d) => ok(d));
  if (first === undefined) {
    for (const d of past) result.days.set(d, { date: d, minutes: minutesOn(d), status: d === today ? 'pending' : 'missed' });
    return result;
  }

  for (const date of dateRange(first, today)) {
    const minutes = minutesOn(date);
    if (ok(date)) {
      result.current++;
      result.longest = Math.max(result.longest, result.current);
      if (result.current % FREEZE_EVERY_DAYS === 0 && result.freezesAvailable < MAX_FREEZES) {
        result.freezesAvailable++;
        result.lastFreezeGrant = date;
      }
      result.days.set(date, { date, minutes, status: 'filled' });
    } else if (date === today) {
      result.days.set(date, { date, minutes, status: 'pending' });
    } else if (result.freezesAvailable > 0) {
      result.freezesAvailable--;
      result.frozenDates.push(date);
      result.days.set(date, { date, minutes, status: 'frozen' });
    } else {
      if (result.current > 0) result.resets.push({ date, previous: result.current });
      result.current = 0;
      result.days.set(date, { date, minutes, status: 'missed' });
    }
  }
  return result;
}

/** Last 7 local dates ending today, oldest first, for the weekly calendar. */
export function weekView(result: ReplayResult, today: string): { localDate: string; status: DayStatus }[] {
  const out: { localDate: string; status: DayStatus }[] = [];
  for (let i = 6; i >= 0; i--) {
    const date = addDays(today, -i);
    const known = result.days.get(date);
    out.push({ localDate: date, status: known ? known.status : date === today ? 'pending' : 'missed' });
  }
  return out;
}
