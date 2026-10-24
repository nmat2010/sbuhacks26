import type { SummaryDeps } from '../summary';

/** jsdom has no layout: visibility and positions come from attributes on the test markup. */
export function testSummaryDeps(over: Partial<SummaryDeps> = {}): SummaryDeps {
  return {
    now: () => 1_000,
    viewportHeight: 800,
    isVisible: (el) => (el as HTMLElement).style?.display !== 'none' && !el.hasAttribute('data-test-hidden'),
    getRect: (el) => {
      const own = el.closest('[data-top]')?.getAttribute('data-top');
      const top = own === null || own === undefined ? 0 : Number(own);
      return { top, bottom: top + 20 };
    },
    ...over
  };
}

/** Manual clock + timers so detectors and throttles run deterministically. */
export class FakeTime {
  now = 1_000_000;
  private nextId = 1;
  private timers = new Map<number, { at: number; fn: () => void }>();

  setTimer = (fn: () => void, ms: number): number => {
    const id = this.nextId++;
    this.timers.set(id, { at: this.now + ms, fn });
    return id;
  };
  clearTimer = (h: unknown): void => {
    this.timers.delete(h as number);
  };

  /** Advance the clock, running due timers in order (timers may schedule more). */
  async advance(ms: number): Promise<void> {
    const end = this.now + ms;
    for (;;) {
      await flush(); // let MutationObserver callbacks run
      const due = [...this.timers.entries()].filter(([, t]) => t.at <= end).sort((a, b) => a[1].at - b[1].at)[0];
      if (!due) break;
      this.timers.delete(due[0]);
      this.now = Math.max(this.now, due[1].at);
      due[1].fn();
    }
    this.now = end;
    await flush();
  }

  get pending(): number {
    return this.timers.size;
  }
}

export const flush = (): Promise<void> => new Promise((resolve) => setTimeout(resolve, 0));
