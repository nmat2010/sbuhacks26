import { Nudge, NudgeResponse } from '@wolfie/shared';
import { NudgeQueue, NudgeQueueConfig } from './queue.js';
import { getDatabase } from '../db/index.js';
import { logEvent } from '../events.js';
import { getActiveSession } from '../session/index.js';
import { getSetting } from '../settings.js';

let nudgeQueue: NudgeQueue | null = null;

/** Limits come from settings (nudge.max_per_hour, nudge.cooldown_minutes) unless overridden. */
export function initNudgeQueue(config?: Partial<NudgeQueueConfig>): NudgeQueue {
  if (nudgeQueue) return nudgeQueue;

  nudgeQueue = new NudgeQueue({
    maxNudgesPerHour: getSetting('nudge.max_per_hour'),
    cooldownMinutes: getSetting('nudge.cooldown_minutes'),
    ...config
  });

  // Log all nudge events
  nudgeQueue.on('show', (nudge: Nudge) => {
    console.log(`[Nudge] Showing: ${nudge.kind} level ${nudge.level}`);
    recordShown(nudge);
  });

  nudgeQueue.on('response', (response: NudgeResponse) => {
    console.log(`[Nudge] Response: ${response.id} -> ${response.action}`);
    recordResponse(response);
  });

  nudgeQueue.on('snoozed', (until: number) => {
    console.log(`[Nudge] Snoozed until ${new Date(until).toLocaleTimeString()}`);
  });

  nudgeQueue.on('paused', () => {
    console.log('[Nudge] Paused');
  });

  nudgeQueue.on('resumed', () => {
    console.log('[Nudge] Resumed');
  });

  return nudgeQueue;
}

export function getNudgeQueue(): NudgeQueue {
  if (!nudgeQueue) {
    throw new Error('NudgeQueue not initialized');
  }
  return nudgeQueue;
}

/** Test helper. */
export function resetNudgeQueueForTesting(): void {
  nudgeQueue?.removeAllListeners();
  nudgeQueue = null;
}

// Every shown nudge and every response is logged (SPEC Phase 3 accept, SPEC 9).
function recordShown(nudge: Nudge): void {
  try {
    const ts = Date.now();
    getDatabase()
      .prepare(
        'INSERT INTO nudges (uid, session_id, ts, device, kind, level, payload_json) VALUES (?, ?, ?, ?, ?, ?, ?)'
      )
      .run(nudge.id, getActiveSession()?.id ?? null, ts, 'desktop', nudge.kind, nudge.level, JSON.stringify(nudge));
    logEvent('nudge.shown', { id: nudge.id, kind: nudge.kind, level: nudge.level }, { ts });
  } catch (error) {
    console.error('[Nudge] Failed to log nudge:', error);
  }
}

function recordResponse(response: NudgeResponse): void {
  try {
    getDatabase().prepare('UPDATE nudges SET user_response = ? WHERE uid = ?').run(response.action, response.id);
    logEvent('nudge.answered', { id: response.id, action: response.action, via: response.via });
  } catch (error) {
    console.error('[Nudge] Failed to log response:', error);
  }
}

export * from './queue.js';
