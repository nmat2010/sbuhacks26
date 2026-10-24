import { TypedEmitter } from '../typed-emitter.js';

/** The active tab as last reported by the extension; the monitor reads it each poll. */
/** Tab reports older than this are not trusted for Watch mode. */
export const TAB_REPORT_MAX_AGE_MS = 45_000;

export class DomainTracker {
  readonly events = new TypedEmitter<{ change: [domain: string | null, title: string | null] }>();
  private domain: string | null = null;
  private title: string | null = null;
  private contentUrl: string | null = null;
  private reportedAt: number | null = null;

  constructor(private readonly now: () => number = Date.now) {}

  set(domain: string, title: string | null, contentUrl: string | null = null): void {
    this.contentUrl = contentUrl;
    this.reportedAt = this.now();
    if (domain === this.domain && title === this.title) return;
    this.domain = domain;
    this.title = title;
    this.events.emit('change', domain, title);
  }

  clear(): void {
    this.contentUrl = null;
    this.reportedAt = null;
    if (this.domain === null && this.title === null) return;
    this.domain = null;
    this.title = null;
    this.events.emit('change', null, null);
  }

  /** When the extension last reported the active tab (it re-reports every ~20 s); null if cleared. */
  getReportedAt(): number | null {
    return this.reportedAt;
  }

  /**
   * Whether the last tab report describes the browser window in front (Watch mode): recent (the
   * extension re-reports every ~20 s), and its tab title matches the OS window title when both are
   * known. A stale domain must not stand in for an excluded, incognito or other-browser page.
   */
  matchesWindow(windowTitle: string | null, now: number): boolean {
    if (!this.domain || this.reportedAt === null || now - this.reportedAt > TAB_REPORT_MAX_AGE_MS) return false;
    const tab = this.title?.trim().toLowerCase();
    const win = windowTitle?.trim().toLowerCase();
    if (!tab || !win) return true;
    return win.includes(tab) || tab.includes(win);
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
