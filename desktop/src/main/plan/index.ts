import type { PlanSnapshotType } from '@wolfie/shared';
import { getDatabase } from '../db/index.js';
import { logEvent } from '../events.js';
import { getLLMClient } from '../llm/client.js';
import { PlanService } from './service.js';
import { PlanStore } from './store.js';

// App-wide plan service plus the two functions other modules call (SPEC Phase 5):
//   getPlanSnapshot()     Agent A's sync server sends it to the web app as `plan.snapshot`
//   getTodayPlanContext() nudges can quote "Today's goal: ..."

let service: PlanService | null = null;

export function getPlanService(): PlanService {
  return (service ??= new PlanService({
    store: new PlanStore(getDatabase),
    llm: getLLMClient,
    now: Date.now,
    log: (type, payload) => {
      try {
        logEvent(type, payload);
      } catch (error) {
        console.error('[plan] could not log event:', error);
      }
    }
  }));
}

/** Test helper. */
export function setPlanServiceForTesting(next: PlanService | null): void {
  service = next;
}

export function getPlanSnapshot(): PlanSnapshotType {
  return getPlanService().snapshot();
}

export function getTodayPlanContext(): ReturnType<PlanService['todayContext']> {
  return getPlanService().todayContext();
}

export { PlanService } from './service.js';
export { PlanStore } from './store.js';
