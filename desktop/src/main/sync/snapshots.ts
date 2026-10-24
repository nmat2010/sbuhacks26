import type { PlanSnapshotType, StreakSnapshotType } from '@wolfie/shared';
import { TypedEmitter } from '../typed-emitter.js';

// Providers for the read-only snapshots pushed to the web app (A8). Both start as empty stubs and
// are replaced by the real implementations: B6 calls setPlanSnapshotProvider(getPlanSnapshot) and
// A9 sets the streak one. Call notifySnapshotsChanged('plan' | 'streak') after a change so
// connected web apps get a fresh push.

let planProvider: () => PlanSnapshotType = () => ({ items: [] });
let streakProvider: () => StreakSnapshotType = () => ({
  current: 0,
  longest: 0,
  freezesAvailable: 0,
  todayQualified: false,
  todayMinutes: 0,
  week: []
});

export const snapshotEvents = new TypedEmitter<{ changed: [which: 'plan' | 'streak'] }>();

export function setPlanSnapshotProvider(fn: () => PlanSnapshotType): void {
  planProvider = fn;
}

export function setStreakSnapshotProvider(fn: () => StreakSnapshotType): void {
  streakProvider = fn;
}

export function getPlanSnapshotForSync(): PlanSnapshotType {
  try {
    return planProvider();
  } catch (error) {
    console.error('[sync] plan snapshot failed:', error instanceof Error ? error.message : error);
    return { items: [] };
  }
}

export function getStreakSnapshotForSync(): StreakSnapshotType {
  return streakProvider();
}

export function notifySnapshotsChanged(which: 'plan' | 'streak'): void {
  snapshotEvents.emit('changed', which);
}
