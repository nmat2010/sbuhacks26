import { TypedEmitter } from '../typed-emitter.js';

/** The active tab as last reported by the extension; the monitor reads it each poll. */
/** Lower-case, trimmed, without a leading unread count like "(3) ". */
function normalizeTitle(title: string | null | undefined): string {
  return (title ?? '').trim().replace(/^\(\d+\)\s+/, '').toLowerCase();
}

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
    // Fail closed: without both titles we can't tell this tab from an incognito or other-browser window
    const tab = normalizeTitle(this.title);
    const win = normalizeTitle(windowTitle);
    if (!tab || !win) return false;
    // The window title is the tab title, optionally followed by " - <browser/profile>"
    return win === tab || [' - ', ' – ', ' — '].some((sep) => win.startsWith(tab + sep));
  }

  /** Forget the report, unless a newer one arrived since `reportedAt` (used for delayed clears). */
  clearIfUnchanged(reportedAt: number | null): void {
    if (this.reportedAt === reportedAt) this.clear();
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
