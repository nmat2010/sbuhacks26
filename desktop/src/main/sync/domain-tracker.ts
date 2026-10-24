import { TypedEmitter } from '../typed-emitter.js';

/** The active tab as last reported by the extension; the monitor reads it each poll. */
export class DomainTracker {
  readonly events = new TypedEmitter<{ change: [domain: string | null, title: string | null] }>();
  private domain: string | null = null;
  private title: string | null = null;
  private contentUrl: string | null = null;

  set(domain: string, title: string | null, contentUrl: string | null = null): void {
    this.contentUrl = contentUrl;
    if (domain === this.domain && title === this.title) return;
    this.domain = domain;
    this.title = title;
    this.events.emit('change', domain, title);
  }

  clear(): void {
    this.contentUrl = null;
    if (this.domain === null && this.title === null) return;
    this.domain = null;
    this.title = null;
    this.events.emit('change', null, null);
  }

  /** Paper or video URL for the current tab (see ext.tab `contentUrl`); null otherwise. */
  getContentUrl(): string | null {
    return this.contentUrl;
  }

  getDomain(): string | null {
    return this.domain;
  }

  getTitle(): string | null {
    return this.title;
  }
}
