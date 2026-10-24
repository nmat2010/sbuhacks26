import type { NudgeInput } from '@wolfie/shared';
import type { logEvent } from '../events.js';
import type { getSetting } from '../settings.js';
import type { stuckBus } from '../stuck/bus.js';

// Registry for future resilience features (SPEC 9): new mascot behaviors register here instead
// of editing core code. v1 registers none besides the streak, which lives in streak/.

export interface FeatureContext {
  pushNudge: (nudge: NudgeInput) => string | null;
  logEvent: typeof logEvent;
  getSetting: typeof getSetting;
  stuckBus: typeof stuckBus;
}

export interface Feature {
  name: string;
  /** Called once at startup; may return a cleanup function. */
  init(ctx: FeatureContext): void | (() => void);
}

const features: Feature[] = [];
const cleanups: Array<() => void> = [];

export function registerFeature(feature: Feature): void {
  features.push(feature);
}

export function startFeatures(ctx: FeatureContext): void {
  for (const feature of features) {
    const cleanup = feature.init(ctx);
    if (cleanup) cleanups.push(cleanup);
  }
}

export function stopFeatures(): void {
  while (cleanups.length) cleanups.pop()!();
}
