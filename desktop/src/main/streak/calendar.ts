// Local-calendar helpers for the streak (SPEC Phase 9: "the user's local calendar date, handled
// correctly across time zones and DST"). Dates are 'YYYY-MM-DD' strings in an IANA zone, computed
// with Intl so tests can use any zone without touching the process time zone.

const formatters = new Map<string, Intl.DateTimeFormat>();

function formatter(tz: string): Intl.DateTimeFormat {
  let f = formatters.get(tz);
  if (!f) {
    f = new Intl.DateTimeFormat('en-US', {
      timeZone: tz,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23'
    });
    formatters.set(tz, f);
  }
  return f;
}

function parts(ts: number, tz: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const p of formatter(tz).formatToParts(ts)) out[p.type] = p.value;
  return out;
}

export function localDate(ts: number, tz: string): string {
  const p = parts(ts, tz);
  return `${p.year}-${p.month}-${p.day}`;
}

/** Minutes since local midnight, e.g. 20:30 -> 1230. */
export function localMinuteOfDay(ts: number, tz: string): number {
  const p = parts(ts, tz);
  return Number(p.hour) * 60 + Number(p.minute);
}

/** "20:00" -> 1200; null if malformed. */
export function parseClock(hhmm: string): number | null {
  const m = /^([01]?\d|2[0-3]):([0-5]\d)$/.exec(hhmm.trim());
  return m ? Number(m[1]) * 60 + Number(m[2]) : null;
}

export function addDays(date: string, n: number): string {
  const [y, m, d] = date.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10);
}

/** Inclusive list of dates from `from` to `to` (empty if from > to). */
export function dateRange(from: string, to: string): string[] {
  const out: string[] = [];
  for (let d = from; d <= to; d = addDays(d, 1)) out.push(d);
  return out;
}

/**
 * Splits [start, end) at local midnights in `tz`. A day with a DST change is 23 or 25 hours long,
 * so boundaries are found by search, never by adding 24 h.
 */
export function splitByLocalDate(start: number, end: number, tz: string): { date: string; ms: number }[] {
  const out: { date: string; ms: number }[] = [];
  let cur = start;
  while (cur < end) {
    const date = localDate(cur, tz);
    if (localDate(end - 1, tz) === date) {
      out.push({ date, ms: end - cur });
      break;
    }
    // Smallest instant in (cur, end) whose local date differs: that is the next midnight.
    let lo = cur;
    let hi = end - 1;
    while (hi - lo > 1) {
      const mid = Math.floor((lo + hi) / 2);
      if (localDate(mid, tz) === date) lo = mid;
      else hi = mid;
    }
    out.push({ date, ms: hi - cur });
    cur = hi;
  }
  return out;
}
