import type Database from 'better-sqlite3';
import { localDate, localMinuteOfDay } from '../calendar.js';

export const MIN = 60_000;
export const HOUR = 60 * MIN;
export const DAY = 24 * HOUR;

/** The instant at which the wall clock in `tz` reads `local` ("2026-03-08T03:30"). Handles DST. */
export function zoned(local: string, tz: string): number {
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(local);
  if (!m) throw new Error(`bad local time ${local}`);
  const [y, mo, d, h, mi] = m.slice(1).map(Number);
  const wallAsUtc = Date.UTC(y, mo - 1, d, h, mi);
  let guess = wallAsUtc;
  // Two passes converge across a DST jump
  for (let i = 0; i < 3; i++) {
    const ld = localDate(guess, tz);
    const [ly, lm, lday] = ld.split('-').map(Number);
    const shown = Date.UTC(ly, lm - 1, lday) + localMinuteOfDay(guess, tz) * MIN;
    guess += wallAsUtc - shown;
  }
  return guess;
}

let nextSession = 1;

export interface SeedEvent {
  at: number;
  app?: string;
  title?: string | null;
  domain?: string | null;
  idle?: boolean;
}

/** Inserts a desktop session with its app_events (and optionally the zone it ran in). */
export function seedDesktopSession(
  db: Database.Database,
  opts: { start: number; end: number | null; events: SeedEvent[]; tz?: string; id?: string }
): string {
  const id = opts.id ?? `d${nextSession++}`;
  db.prepare("INSERT INTO sessions (id, device, started_at, ended_at) VALUES (?, 'desktop', ?, ?)").run(id, opts.start, opts.end);
  if (opts.tz) db.prepare('INSERT INTO a_session_tz (session_id, tz) VALUES (?, ?)').run(id, opts.tz);
  const insert = db.prepare('INSERT INTO app_events (session_id, ts, app_name, window_title, url_domain, is_idle) VALUES (?, ?, ?, ?, ?, ?)');
  for (const e of opts.events) insert.run(id, e.at, e.app ?? 'Xcode', e.title ?? null, e.domain ?? null, e.idle ? 1 : 0);
  return id;
}

/** A desktop session that is all work for `minutes`, starting at `start`. */
export function workSession(db: Database.Database, start: number, minutes: number, tz?: string): string {
  return seedDesktopSession(db, { start, end: start + minutes * MIN, events: [{ at: start }], tz });
}

export function seedWebSession(
  db: Database.Database,
  opts: { start: number; end: number | null; hidden?: [number, number][]; id?: string }
): string {
  const id = opts.id ?? `w${nextSession++}`;
  db.prepare("INSERT INTO sessions (id, device, started_at, ended_at) VALUES (?, 'webapp', ?, ?)").run(id, opts.start, opts.end);
  const insert = db.prepare('INSERT INTO webapp_activity (session_id, ts, type) VALUES (?, ?, ?)');
  for (const [from, to] of opts.hidden ?? []) {
    insert.run(id, from, 'tab_hidden');
    insert.run(id, to, 'tab_visible');
  }
  return id;
}
