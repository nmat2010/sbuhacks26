import { Nudge, NudgeInput, NudgeKindType, NudgeResponse, NudgeSchema } from '@wolfie/shared';
import { EventEmitter } from 'events';
import { randomUUID } from 'crypto';

export interface NudgeQueueConfig {
  maxNudgesPerHour: number;
  cooldownMinutes: Record<NudgeKindType, number>;
  snoozeDurationMs: number;
}

interface QueuedNudge extends Nudge {
  id: string;
  timestamp: number;
  userInitiated: boolean;
}

export interface PushOptions {
  /**
   * The user asked for this (e.g. "Another hint", a reply in the hint conversation). Skips
   * per-kind cooldowns, the hourly cap, and snooze, and does not count toward them. Pause
   * still applies.
   */
  userInitiated?: boolean;
}

export class NudgeQueue extends EventEmitter {
  private config: NudgeQueueConfig;
  private queue: QueuedNudge[] = [];
  private lastNudgeByKind: Map<NudgeKindType, number> = new Map();
  private nudgeHistory: number[] = []; // timestamps of shown nudges in last hour
  private snoozedUntil: number = 0;
  private paused: boolean = false;

  constructor(config?: Partial<NudgeQueueConfig>) {
    super();

    this.config = {
      maxNudgesPerHour: config?.maxNudgesPerHour ?? 12,
      cooldownMinutes: config?.cooldownMinutes ?? {
        distraction: 10,
        ai_tool: 10,
        stuck: 1,
        streak: 60,
        other: 5
      },
      snoozeDurationMs: config?.snoozeDurationMs ?? 30 * 60 * 1000 // 30 minutes
    };
  }

  /**
   * Push a nudge to the queue. Returns the nudge id if it was shown, or null if it was
   * dropped (paused, snoozed, on cooldown, or over the hourly cap).
   */
  push(input: NudgeInput, opts: PushOptions = {}): string | null {
    const now = Date.now();
    const nudge = NudgeSchema.parse(input);
    const userInitiated = opts.userInitiated ?? false;

    // Check if paused
    if (this.paused) {
      console.log('[NudgeQueue] Paused, ignoring nudge');
      return null;
    }

    if (!userInitiated) {
      // Check if snoozed
      if (this.snoozedUntil > now) {
        console.log('[NudgeQueue] Snoozed, ignoring nudge');
        return null;
      }

      // Check per-kind cooldown
      const lastNudge = this.lastNudgeByKind.get(nudge.kind);
      const cooldownMs = this.config.cooldownMinutes[nudge.kind] * 60 * 1000;

      if (lastNudge && (now - lastNudge) < cooldownMs) {
        console.log(`[NudgeQueue] Kind '${nudge.kind}' on cooldown`);
        return null;
      }

      // Check max nudges per hour
      this.cleanupHistory(now);
      if (this.nudgeHistory.length >= this.config.maxNudgesPerHour) {
        console.log('[NudgeQueue] Max nudges per hour reached');
        return null;
      }
    }

    // Add to queue
    const queuedNudge: QueuedNudge = {
      ...nudge,
      id: nudge.id ?? randomUUID(),
      timestamp: now,
      userInitiated
    };

    this.queue.push(queuedNudge);
    this.queue.sort((a, b) => b.priority - a.priority); // Higher priority first

    console.log(`[NudgeQueue] Added nudge: ${nudge.kind} (priority: ${nudge.priority})`);

    // Process queue immediately
    this.processQueue();

    return queuedNudge.id;
  }

  /**
   * Route the user's answer to a shown nudge (button, voice, or auto-dismiss) to listeners.
   */
  respond(response: NudgeResponse): void {
    this.emit('response', response);
  }

  /**
   * Process the queue and show the highest priority nudge
   */
  private processQueue(): void {
    if (this.queue.length === 0) {
      return;
    }

    const { timestamp: _timestamp, userInitiated, ...nudge } = this.queue.shift()!;
    const now = Date.now();

    // Record this nudge
    if (!userInitiated) {
      this.lastNudgeByKind.set(nudge.kind, now);
      this.nudgeHistory.push(now);
    }

    // Emit to overlay
    this.emit('show', nudge);

    console.log(`[NudgeQueue] Showing nudge: ${nudge.kind}`);
  }

  /**
   * Clean up old entries from history (older than 1 hour)
   */
  private cleanupHistory(now: number): void {
    const oneHourAgo = now - (60 * 60 * 1000);
    this.nudgeHistory = this.nudgeHistory.filter(t => t > oneHourAgo);
  }

  /**
   * Snooze all nudges for the configured duration
   */
  snooze(): void {
    const now = Date.now();
    this.snoozedUntil = now + this.config.snoozeDurationMs;

    // Clear pending queue
    this.queue = [];

    console.log(`[NudgeQueue] Snoozed for ${this.config.snoozeDurationMs / 1000 / 60} minutes`);
    this.emit('snoozed', this.snoozedUntil);
  }

  /**
   * Pause the nudge queue (no nudges will be shown)
   */
  pause(): void {
    this.paused = true;
    this.queue = [];
    console.log('[NudgeQueue] Paused');
    this.emit('paused');
  }

  /**
   * Resume the nudge queue
   */
  resume(): void {
    this.paused = false;
    console.log('[NudgeQueue] Resumed');
    this.emit('resumed');
  }

  /**
   * Check if currently snoozed
   */
  isSnoozed(): boolean {
    return Date.now() < this.snoozedUntil;
  }

  /**
   * Check if currently paused
   */
  isPaused(): boolean {
    return this.paused;
  }

  /**
   * Get current queue status
   */
  getStatus() {
    return {
      paused: this.paused,
      snoozed: this.isSnoozed(),
      snoozedUntil: this.snoozedUntil,
      queueLength: this.queue.length,
      nudgesInLastHour: this.nudgeHistory.length,
      maxNudgesPerHour: this.config.maxNudgesPerHour
    };
  }

  /**
   * Update configuration
   */
  updateConfig(config: Partial<NudgeQueueConfig>): void {
    this.config = {
      ...this.config,
      ...config
    };
    console.log('[NudgeQueue] Config updated', this.config);
  }
}
