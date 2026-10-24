import { TypedEmitter } from '../typed-emitter.js';

/** The active tab as last reported by the extension; the monitor reads it each poll. */
export class DomainTracker {
  readonly events = new TypedEmitter<{ change: [domain: string | null, title: string | null] }>();
  private domain: string | null = null;
  private title: string | null = null;

  set(domain: string, title: string | null): void {
    if (domain === this.domain && title === this.title) return;
    this.domain = domain;
    this.title = title;
    this.events.emit('change', domain, title);
  }

  clear(): void {
    if (this.domain === null && this.title === null) return;
    this.domain = null;
    this.title = null;
    this.events.emit('change', null, null);
  }

  getDomain(): string | null {
    return this.domain;
  }

  getTitle(): string | null {
    return this.title;
  }
}
