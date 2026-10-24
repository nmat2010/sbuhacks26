import type { RequestFollowup, RequestHints } from '@wolfie/shared';
import { getDatabase } from '../db/index.js';
import { logEvent } from '../events.js';
import { getLLMClient } from '../llm/client.js';
import { getActiveSession } from '../session/index.js';
import { getSetting } from '../settings.js';
import { HintService, type HintServiceDeps } from './service.js';

// Frozen signatures (SPEC 11, contract 3). Agent A's LAN sync server (A8) routes web app
// hint.request / hint.followup messages here; B3b's hint flow uses the same service.

let imageDir: string | null = null;
let service: HintService | null = null;

/** register.ts tells the service where stored images may go (<userData>/images). */
export function configureHintService(opts: { imageDir?: string | null }): void {
  if (opts.imageDir !== undefined) imageDir = opts.imageDir;
}

export function createDefaultHintDeps(): HintServiceDeps {
  return {
    llm: getLLMClient,
    db: getDatabase,
    now: Date.now,
    getSetting,
    activeSession: () => getActiveSession(),
    imageDir: () => imageDir,
    log: (type, payload) => {
      try {
        logEvent(type, payload);
      } catch (error) {
        console.error('[hints] could not log event:', error);
      }
    }
  };
}

export function getHintService(): HintService {
  return (service ??= new HintService(createDefaultHintDeps()));
}

/** Test helper. */
export function setHintServiceForTesting(next: HintService | null): void {
  service = next;
}

export const requestHints: RequestHints = (context, source, assessment) =>
  getHintService().requestHints(context, source, assessment);

export const requestFollowup: RequestFollowup = (followup, context, source, assessment) =>
  getHintService().requestFollowup(followup, context, source, assessment);

export { HintService } from './service.js';
