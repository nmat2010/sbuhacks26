import type Database from 'better-sqlite3';
import type { DeviceType } from '@wolfie/shared';
import { getDatabase } from './db/index.js';

// Generic append-only event log (SPEC 9). Call for: session start/end, nudge shown/answered,
// stuck signals, hint requested + deepest level, offers accepted/declined, plan item completed,
// streak qualified/frozen/reset.

export type EventType =
  | 'session.start'
  | 'session.end'
  | 'nudge.shown'
  | 'nudge.answered'
  | 'stuck.signal'
  | 'stuck.level'
  | 'hint.requested'
  | 'hint.level_shown'
  | 'offer.accepted'
  | 'offer.declined'
  | 'plan.item_completed'
  | 'streak.qualified'
  | 'streak.frozen'
  | 'streak.reset'
  // Agents may add new dotted types without editing this union.
  | `${string}.${string}`;

export function logEvent(
  type: EventType,
  payload: Record<string, unknown> = {},
  opts: { device?: DeviceType; ts?: number; db?: Database.Database } = {}
): void {
  const db = opts.db ?? getDatabase();
  db.prepare('INSERT INTO events (ts, device, type, payload_json) VALUES (?, ?, ?, ?)').run(
    opts.ts ?? Date.now(),
    opts.device ?? 'desktop',
    type,
    JSON.stringify(payload)
  );
}
