import { NudgeQueue } from './queue.js';
import { Nudge } from '@wolfie/shared';

let nudgeQueue: NudgeQueue | null = null;

export function initNudgeQueue(): NudgeQueue {
  if (nudgeQueue) return nudgeQueue;

  nudgeQueue = new NudgeQueue();

  // Log all nudge events
  nudgeQueue.on('show', (nudge: Nudge) => {
    console.log(`[Nudge] Showing: ${nudge.kind} - ${nudge.text}`);
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

export * from './queue.js';
