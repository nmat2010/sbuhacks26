import { describe, expect, it } from 'vitest';
import { addDays, dateRange, localDate, localMinuteOfDay, parseClock, splitByLocalDate } from '../calendar.js';
import { MAX_FREEZES, replayStreak, weekView } from '../compute.js';
import { dayQualifies } from '../rules.js';
import { HOUR, MIN, zoned } from './helpers.js';

const NY = 'America/New_York';

/** minutes by date, from a list like [['2026-10-01', 25], ...] */
const days = (entries: [string, number][]) => new Map(entries);
/** `n` consecutive qualifying days starting at `from` (25 minutes each). */
const run = (from: string, n: number): [string, number][] => dateRange(from, addDays(from, n - 1)).map((d) => [d, 25]);

const replay = (entries: [string, number][], today: string, qualifyingMinutes = 20) =>
  replayStreak({ minutesByDate: days(entries), today, qualifyingMinutes });

describe('dayQualifies', () => {
  it('needs the configured focused minutes', () => {
    expect(dayQualifies({ localDate: 'd', focusMinutes: 19.99 }, 20)).toBe(false);
    expect(dayQualifies({ localDate: 'd', focusMinutes: 20 }, 20)).toBe(true);
    expect(dayQualifies({ localDate: 'd', focusMinutes: 5 }, 5)).toBe(true);
    expect(dayQualifies({ localDate: 'd', focusMinutes: 20 })).toBe(true); // default threshold 20
  });

  it('is swappable', () => {
    const lenient = () => true;
    const r = replayStreak({ minutesByDate: days([['2026-10-01', 0], ['2026-10-02', 0]]), today: '2026-10-02', qualifyingMinutes: 20, qualifies: lenient });
    expect(r.current).toBe(2);
  });
});

describe('replayStreak', () => {
  it('counts consecutive qualifying days; an unqualified today is pending, not a miss', () => {
    const r = replay(run('2026-10-01', 5), '2026-10-06');
    expect(r).toMatchObject({ current: 5, longest: 5, todayQualified: false, freezesAvailable: 0 });
    expect(r.days.get('2026-10-06')).toMatchObject({ status: 'pending' });
    expect(r.resets).toEqual([]);
  });

  it('today qualifying extends the streak', () => {
    const r = replay([...run('2026-10-01', 3), ['2026-10-04', 21.5]], '2026-10-04');
    expect(r).toMatchObject({ current: 4, todayQualified: true, todayMinutes: 21 });
  });

  it('a day just under the threshold does not count', () => {
    const r = replay([...run('2026-10-01', 2), ['2026-10-03', 19.9]], '2026-10-04');
    expect(r.current).toBe(0);
    expect(r.resets).toEqual([{ date: '2026-10-03', previous: 2 }]);
    expect(r.longest).toBe(2);
  });

  it('a miss without a freeze resets the streak, and longest is kept', () => {
    const r = replay([...run('2026-10-01', 4), ...run('2026-10-06', 2)], '2026-10-07');
    expect(r).toMatchObject({ current: 2, longest: 4 });
    expect(r.resets).toEqual([{ date: '2026-10-05', previous: 4 }]);
    expect(r.days.get('2026-10-05')?.status).toBe('missed');
  });

  it('earns a freeze every 7th consecutive day and spends it automatically on a miss', () => {
    const week = replay(run('2026-10-01', 7), '2026-10-08');
    expect(week).toMatchObject({ current: 7, freezesAvailable: 1, lastFreezeGrant: '2026-10-07' });

    // Day 8 missed, day 9 back: the freeze keeps the streak at 7 (frozen days do not count)
    const missed = replay([...run('2026-10-01', 7), ['2026-10-09', 30]], '2026-10-09');
    expect(missed).toMatchObject({ current: 8, freezesAvailable: 0, longest: 8 });
    expect(missed.frozenDates).toEqual(['2026-10-08']);
    expect(missed.days.get('2026-10-08')?.status).toBe('frozen');
    expect(missed.resets).toEqual([]);
  });

  it('stores at most two freezes', () => {
    const r = replay(run('2026-10-01', 28), '2026-10-29');
    expect(r.current).toBe(28);
    expect(r.freezesAvailable).toBe(MAX_FREEZES);
  });

  it('two missed days with one freeze: the first is frozen, the second resets', () => {
    const r = replay([...run('2026-10-01', 7), ['2026-10-11', 25]], '2026-10-11');
    expect(r.frozenDates).toEqual(['2026-10-08']);
    expect(r.resets).toEqual([{ date: '2026-10-09', previous: 7 }]);
    expect(r).toMatchObject({ current: 1, longest: 7, freezesAvailable: 0 });
  });

  it('a freeze earned again after the streak restarts', () => {
    const r = replay([...run('2026-10-01', 3), ...run('2026-10-06', 7)], '2026-10-13');
    expect(r).toMatchObject({ current: 7, freezesAvailable: 1, longest: 7 });
  });

  it('has nothing to count without a qualifying day', () => {
    const r = replay([['2026-10-01', 5]], '2026-10-03');
    expect(r).toMatchObject({ current: 0, longest: 0, freezesAvailable: 0, todayQualified: false });
    expect(replay([], '2026-10-03').current).toBe(0);
  });

  it('builds the weekly calendar ending today', () => {
    const r = replay([...run('2026-10-01', 3), ['2026-10-06', 25]], '2026-10-07');
    expect(weekView(r, '2026-10-07')).toEqual([
      { localDate: '2026-10-01', status: 'filled' },
      { localDate: '2026-10-02', status: 'filled' },
      { localDate: '2026-10-03', status: 'filled' },
      { localDate: '2026-10-04', status: 'missed' },
      { localDate: '2026-10-05', status: 'missed' },
      { localDate: '2026-10-06', status: 'filled' },
      { localDate: '2026-10-07', status: 'pending' }
    ]);
  });
});

describe('calendar (zones and DST)', () => {
  it('computes local dates in a zone', () => {
    const t = zoned('2026-10-24T23:30', NY);
    expect(localDate(t, NY)).toBe('2026-10-24');
    expect(localDate(t, 'Asia/Tokyo')).toBe('2026-10-25');
    expect(localMinuteOfDay(t, NY)).toBe(23 * 60 + 30);
  });

  it('adds days across month ends and ranges', () => {
    expect(addDays('2026-10-31', 1)).toBe('2026-11-01');
    expect(addDays('2026-03-01', -1)).toBe('2026-02-28');
    expect(dateRange('2026-10-30', '2026-11-02')).toEqual(['2026-10-30', '2026-10-31', '2026-11-01', '2026-11-02']);
    expect(dateRange('2026-10-05', '2026-10-04')).toEqual([]);
  });

  it('splits at local midnight', () => {
    const start = zoned('2026-10-24T23:00', NY);
    const end = zoned('2026-10-25T01:30', NY);
    expect(splitByLocalDate(start, end, NY)).toEqual([
      { date: '2026-10-24', ms: HOUR },
      { date: '2026-10-25', ms: 90 * MIN }
    ]);
  });

  it('spring forward: the 23-hour day has no 2am hour', () => {
    const slices = splitByLocalDate(zoned('2026-03-07T23:00', NY), zoned('2026-03-08T04:00', NY), NY);
    // 23:00-24:00 on the 7th, then 00:00-04:00 on the 8th with 02:00-03:00 skipped = 3 hours
    expect(slices).toEqual([
      { date: '2026-03-07', ms: HOUR },
      { date: '2026-03-08', ms: 3 * HOUR }
    ]);
  });

  it('fall back: the 25-hour day has a repeated 1am hour', () => {
    const slices = splitByLocalDate(zoned('2026-10-31T22:00', NY), zoned('2026-11-01T03:00', NY), NY);
    expect(slices).toEqual([
      { date: '2026-10-31', ms: 2 * HOUR },
      { date: '2026-11-01', ms: 4 * HOUR } // 00:00 EDT -> 03:00 EST crosses the repeated hour
    ]);
  });

  it('parses reminder clock times', () => {
    expect(parseClock('20:00')).toBe(1200);
    expect(parseClock('7:05')).toBe(425);
    expect(parseClock('25:00')).toBeNull();
    expect(parseClock('soon')).toBeNull();
  });
});
