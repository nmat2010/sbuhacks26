import { Nudge, NudgeKindType } from '@wolfie/shared';
import { EventEmitter } from 'events';

export interface NudgeQueueConfig {
  maxNudgesPerHour: number;
  cooldownMinutes: Record<NudgeKindType, number>;
  snoozeDurationMs: number;
}

interface QueuedNudge extends Nudge {
  timestamp: number;
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
        stuck: 3,
        streak: 60,
        other: 5
      },
      snoozeDurationMs: config?.snoozeDurationMs ?? 30 * 60 * 1000 // 30 minutes
    };
  }

  /**
   * Push a nudge to the queue
   */
  push(nudge: Nudge): boolean {
    const now = Date.now();

    // Check if paused
    if (this.paused) {
      console.log('[NudgeQueue] Paused, ignoring nudge');
      return false;
    }

    // Check if snoozed
    if (this.snoozedUntil > now) {
      console.log('[NudgeQueue] Snoozed, ignoring nudge');
      return false;
    }

    // Check per-kind cooldown
    const lastNudge = this.lastNudgeByKind.get(nudge.kind);
    const cooldownMs = this.config.cooldownMinutes[nudge.kind] * 60 * 1000;

    if (lastNudge && (now - lastNudge) < cooldownMs) {
      console.log(`[NudgeQueue] Kind '${nudge.kind}' on cooldown`);
      return false;
    }

    // Check max nudges per hour
    this.cleanupHistory(now);
    if (this.nudgeHistory.length >= this.config.maxNudgesPerHour) {
      console.log('[NudgeQueue] Max nudges per hour reached');
      return false;
    }

    // Add to queue
    const queuedNudge: QueuedNudge = {
      ...nudge,
      timestamp: now
    };

    this.queue.push(queuedNudge);
    this.queue.sort((a, b) => b.priority - a.priority); // Higher priority first

    console.log(`[NudgeQueue] Added nudge: ${nudge.kind} (priority: ${nudge.priority})`);

    // Process queue immediately
    this.processQueue();

    return true;
  }

  /**
   * Process the queue and show the highest priority nudge
   */
  private processQueue(): void {
    if (this.queue.length === 0) {
      return;
    }

    const nudge = this.queue.shift()!;
    const now = Date.now();

    // Record this nudge
    this.lastNudgeByKind.set(nudge.kind, now);
    this.nudgeHistory.push(now);

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
