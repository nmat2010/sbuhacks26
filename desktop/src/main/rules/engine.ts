import type { NudgeInput, NudgeResponse } from '@wolfie/shared';
import { matchForeground, type ForegroundLike, type RuleKind, type RuleLists, type RuleMatch } from './matcher.js';
import { pickMessage, parseRuleAction, ruleButtons } from './messages.js';

// AI-tool and distraction warnings (SPEC Phase 3). Listens to monitor foreground changes; when a
// matched app/domain comes to the front during an active session it pushes a nudge, subject to a
// per-rule cooldown and the user's "ignore for this session". Nothing fires outside a session or
// while paused. The NudgeQueue still applies its own per-kind cooldown and hourly cap on top.

export interface RulesEngineDeps {
  monitorEvents: { on(event: 'foreground', fn: (fg: ForegroundLike) => void): () => void };
  sessionEvents: { on(event: 'change', fn: () => void): () => void };
  nudgeEvents: { on(event: 'response', fn: (response: NudgeResponse) => void): unknown; off(event: 'response', fn: (response: NudgeResponse) => void): unknown };
  getSession(): { id: string } | null;
  isPaused(): boolean;
  getLists(): RuleLists;
  /** `monitored.rule_cooldown_minutes` */
  getCooldownMinutes(): number;
  /** NudgeQueue.push: returns the nudge id if shown, null if dropped. */
  push(nudge: NudgeInput): string | null;
  logEvent(type: `${string}.${string}`, payload: Record<string, unknown>): void;
  now(): number;
  random(): number;
}

/** "I need this for the task" quiets that rule for this many cooldown periods. */
const NEED_THIS_COOLDOWNS = 3;

export class RulesEngine {
  private lastMatchKey: string | null = null;
  private lastShownAt = new Map<string, number>();
  private suppressedUntil = new Map<string, number>();
  private ignored = new Set<string>();
  private pending = new Map<string, RuleMatch>();
  private lastMessageIndex = new Map<RuleKind, number>();
  private offs: Array<() => void> = [];
  private onResponse = (response: NudgeResponse) => this.handleResponse(response);

  constructor(private readonly deps: RulesEngineDeps) {}

  start(): void {
    this.offs.push(
      this.deps.monitorEvents.on('foreground', (fg) => this.handleForeground(fg)),
      this.deps.sessionEvents.on('change', () => this.reset())
    );
    this.deps.nudgeEvents.on('response', this.onResponse);
  }

  stop(): void {
    this.offs.forEach((off) => off());
    this.offs = [];
    this.deps.nudgeEvents.off('response', this.onResponse);
  }

  isIgnored(key: string): boolean {
    return this.ignored.has(key);
  }

  /** New session (or none): forget cooldowns, ignores and pending nudges. */
  private reset(): void {
    this.lastMatchKey = null;
    this.lastShownAt.clear();
    this.suppressedUntil.clear();
    this.ignored.clear();
    this.pending.clear();
  }

  handleForeground(fg: ForegroundLike): void {
    const { deps } = this;
    if (!deps.getSession() || deps.isPaused()) return;

    const match = matchForeground(fg, deps.getLists());
    if (!match) {
      this.lastMatchKey = null;
      return;
    }
    // Fire when a matched app or domain *comes to the front*, not on every title/idle change.
    if (match.key === this.lastMatchKey) return;
    this.lastMatchKey = match.key;

    if (this.ignored.has(match.key)) return;
    const now = deps.now();
    if ((this.suppressedUntil.get(match.key) ?? 0) > now) return;
    const cooldownMs = deps.getCooldownMinutes() * 60_000;
    const last = this.lastShownAt.get(match.key);
    if (last !== undefined && now - last < cooldownMs) return;

    const { text, index } = pickMessage(match.kind, match.rule.name, deps.random, this.lastMessageIndex.get(match.kind) ?? null);
    const id = deps.push({
      kind: match.kind,
      level: 1,
      text,
      spokenText: text,
      buttons: ruleButtons(),
      priority: 6
    });
    if (!id) return; // dropped by the queue (snooze, its own cooldown, hourly cap): try on the next arrival
    this.lastMessageIndex.set(match.kind, index);
    this.lastShownAt.set(match.key, now);
    this.pending.set(id, match);
  }

  private handleResponse(response: NudgeResponse): void {
    const match = this.pending.get(response.id);
    if (!match) return;
    this.pending.delete(response.id);
    const answer = parseRuleAction(response.action);
    if (answer === 'ignore') this.ignored.add(match.key);
    else if (answer === 'need') {
      this.suppressedUntil.set(match.key, this.deps.now() + NEED_THIS_COOLDOWNS * this.deps.getCooldownMinutes() * 60_000);
    }
    this.deps.logEvent('rule.response', {
      rule: match.rule.name,
      kind: match.kind,
      answer: answer ?? response.action,
      via: response.via
    });
  }
}
