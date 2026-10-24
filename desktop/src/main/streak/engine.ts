import type Database from 'better-sqlite3';
import type { DeviceType, NudgeInput, StreakSnapshotType } from '@wolfie/shared';
import type { RuleLists } from '../rules/matcher.js';
import { addDays, localDate, localMinuteOfDay, parseClock } from './calendar.js';
import { MILESTONES, replayStreak, weekView, type ReplayResult } from './compute.js';
import { focusMinutesByDate } from './focus.js';
import { streakNudge, type StreakNudgeKind } from './messages.js';
import type { DayQualifier } from './rules.js';

// Streak engine (SPEC Phase 9, A9). The desktop is the source of truth: it recomputes the streak
// from raw sessions (both devices) whenever something changes (a periodic tick, a session
// start/stop, a late-synced web session), persists `streak_days` / `streak_state`, and announces
// what happened (celebration, milestone, freeze used, reset, evening reminder) exactly once each.

export interface StreakEngineDeps {
  db: () => Database.Database;
  now: () => number;
  getTimeZone: () => string;
  qualifyingMinutes: () => number;
  reminderEnabled: () => boolean;
  /** "HH:MM" local */
  reminderTime: () => string;
  getLists: () => RuleLists;
  /** NudgeQueue.push: the id if shown, null if dropped. */
  push: (nudge: NudgeInput) => string | null;
  logEvent: (type: `${string}.${string}`, payload: Record<string, unknown>, opts: { device: DeviceType; ts: number; db: Database.Database }) => void;
  /** Called when the persisted streak changed (UI + web app snapshot). */
  onChange?: (snapshot: StreakSnapshotType) => void;
  qualifies?: DayQualifier;
  random?: () => number;
  /** How far back the replay looks. Default 400 days. */
  lookbackDays?: number;
}

const DAY_MS = 24 * 60 * 60 * 1000;

export class StreakEngine {
  private last: StreakSnapshotType | null = null;

  constructor(private readonly deps: StreakEngineDeps) {}

  /** The current streak without announcing anything. */
  getStreak(): StreakSnapshotType {
    return this.compute().snapshot;
  }

  /** Recompute, persist, and announce. Safe to call often. */
  recalculate(): StreakSnapshotType {
    const { snapshot, replay, today, tz } = this.compute();
    this.persist(replay, snapshot);
    this.announce(replay, today, tz);
    if (JSON.stringify(snapshot) !== JSON.stringify(this.last)) {
      this.last = snapshot;
      this.deps.onChange?.(snapshot);
    }
    return snapshot;
  }

  /** Periodic work: recalculate (a running session grows today's minutes) and the evening reminder. */
  tick(): StreakSnapshotType {
    const snapshot = this.recalculate();
    this.maybeRemind();
    return snapshot;
  }

  // ---- computation ---------------------------------------------------------------------------

  private compute() {
    const { deps } = this;
    const now = deps.now();
    const tz = deps.getTimeZone();
    const today = localDate(now, tz);
    const minutesByDate = focusMinutesByDate(deps.db(), {
      now,
      defaultTz: tz,
      lists: deps.getLists(),
      sinceTs: now - (deps.lookbackDays ?? 400) * DAY_MS
    });
    const replay = replayStreak({
      minutesByDate,
      today,
      qualifyingMinutes: deps.qualifyingMinutes(),
      qualifies: deps.qualifies
    });
    const snapshot: StreakSnapshotType = {
      current: replay.current,
      longest: Math.max(replay.longest, this.storedLongest()),
      freezesAvailable: replay.freezesAvailable,
      todayQualified: replay.todayQualified,
      todayMinutes: replay.todayMinutes,
      week: weekView(replay, today)
    };
    return { snapshot, replay, today, tz };
  }

  /** Longest survives even if old sessions fall out of the lookback or data is partly cleared. */
  private storedLongest(): number {
    const row = this.deps.db().prepare('SELECT longest FROM streak_state WHERE id = 1').get() as { longest: number } | undefined;
    return row?.longest ?? 0;
  }

  private persist(replay: ReplayResult, snapshot: StreakSnapshotType): void {
    const db = this.deps.db();
    db.transaction(() => {
      db.prepare('DELETE FROM streak_days').run();
      const insert = db.prepare('INSERT INTO streak_days (local_date, qualified, focus_minutes, freeze_used) VALUES (?, ?, ?, ?)');
      for (const day of replay.days.values()) {
        if (day.minutes <= 0 && day.status !== 'frozen') continue;
        insert.run(day.date, day.status === 'filled' ? 1 : 0, Math.floor(day.minutes), day.status === 'frozen' ? 1 : 0);
      }
      db.prepare(
        `INSERT INTO streak_state (id, current, longest, freezes_available, last_freeze_grant) VALUES (1, ?, ?, ?, ?)
         ON CONFLICT(id) DO UPDATE SET current = excluded.current, longest = excluded.longest,
           freezes_available = excluded.freezes_available, last_freeze_grant = excluded.last_freeze_grant`
      ).run(snapshot.current, snapshot.longest, snapshot.freezesAvailable, replay.lastFreezeGrant);
    })();
  }

  // ---- announcements -------------------------------------------------------------------------

  private hasEvent(type: string, key: string, value: string): boolean {
    return !!this.deps
      .db()
      .prepare(`SELECT 1 FROM events WHERE type = ? AND json_extract(payload_json, '$.${key}') = ? LIMIT 1`)
      .get(type, value);
  }

  private fact(type: `${string}.${string}`, payload: Record<string, unknown>, key: string): void {
    const value = String(payload[key]);
    if (this.hasEvent(type, key, value)) return;
    this.deps.logEvent(type, payload, { device: 'desktop', ts: this.deps.now(), db: this.deps.db() });
  }

  /** Pushes a streak nudge once per (kind, date); only marks it done if the queue showed it. */
  private notifyOnce(kind: StreakNudgeKind, date: string, ctx: Parameters<typeof streakNudge>[1]): void {
    const marker = `${kind}:${date}`;
    if (this.hasEvent('streak.notified', 'marker', marker)) return;
    const id = this.deps.push(streakNudge(kind, ctx, this.deps.random));
    if (id) this.deps.logEvent('streak.notified', { marker, kind, date, current: ctx.current }, { device: 'desktop', ts: this.deps.now(), db: this.deps.db() });
  }

  private announce(replay: ReplayResult, today: string, _tz: string): void {
    const yesterday = addDays(today, -1);

    if (replay.todayQualified) {
      this.fact('streak.qualified', { date: today, minutes: replay.todayMinutes, current: replay.current }, 'date');
      const milestone = (MILESTONES as readonly number[]).includes(replay.current);
      this.notifyOnce(milestone ? 'milestone' : 'celebrate', today, {
        current: replay.current,
        minutes: replay.todayMinutes
      });
    }

    for (const date of replay.frozenDates) {
      this.fact('streak.frozen', { date, freezesLeft: replay.freezesAvailable }, 'date');
    }
    // Talk about a freeze that was just used, not about old history
    const lastFrozen = replay.frozenDates.at(-1);
    if (lastFrozen && lastFrozen >= yesterday) {
      this.notifyOnce('freeze', lastFrozen, { current: replay.current, freezes: replay.freezesAvailable });
    }

    for (const reset of replay.resets) {
      this.fact('streak.reset', { date: reset.date, previous: reset.previous }, 'date');
    }
    // One kind message for the latest reset, shown the next time the app is up (within a week)
    const lastReset = replay.resets.at(-1);
    if (lastReset && lastReset.date >= addDays(today, -7)) {
      this.notifyOnce('reset', lastReset.date, { current: 0 });
    }
  }

  private maybeRemind(): void {
    const { deps } = this;
    if (!deps.reminderEnabled()) return;
    const at = parseClock(deps.reminderTime());
    if (at === null) return;
    const now = deps.now();
    const tz = deps.getTimeZone();
    if (localMinuteOfDay(now, tz) < at) return;
    const snapshot = this.last ?? this.getStreak();
    // Only when a streak is at stake: one exists and today has not qualified yet.
    if (snapshot.current <= 0 || snapshot.todayQualified) return;
    const needed = Math.max(1, Math.ceil(deps.qualifyingMinutes() - snapshot.todayMinutes));
    this.notifyOnce('reminder', localDate(now, tz), { current: snapshot.current, needed });
  }
}
