// Emits stuckBus 'input' (A6): the escalation engine never offers help within 5 s of input
// (SPEC 4c). Nothing else emits it. Polls the system idle time every second; input happened if the
// idle time is under one second. Only while a session is running and not paused.

export interface InputPollerDeps {
  getIdleSeconds(): number;
  isActive(): boolean;
  now(): number;
  emit(at: number): void;
}

export class InputPoller {
  private timer: ReturnType<typeof setInterval> | null = null;

  constructor(private readonly deps: InputPollerDeps) {}

  start(intervalMs = 1000): void {
    if (this.timer) return;
    this.timer = setInterval(() => this.tick(), intervalMs);
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  tick(): void {
    if (!this.deps.isActive()) return;
    let idle: number;
    try {
      idle = this.deps.getIdleSeconds();
    } catch {
      return;
    }
    if (idle < 1) this.deps.emit(this.deps.now());
  }
}
