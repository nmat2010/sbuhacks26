// What is in front right now, for modules outside sensing (Watch mode). The sensing register
// installs the provider from the monitor's last poll and the extension's last tab report.

export interface ForegroundInfo {
  appName: string;
  windowTitle: string | null;
  isBrowser: boolean;
  /** Tab domain from the extension while a browser is in front; null if unknown or not reported. */
  domain: string | null;
  /** Paper or video URL from the extension (PDF, arXiv, YouTube watch page); null otherwise. */
  contentUrl: string | null;
  /**
   * The extension's last reported domain even when it can't be matched to this window. Only for
   * deciding "graded work" (assessment domains), never for capturing.
   */
  reportedDomain: string | null;
  /** When the monitor last saw this window. */
  ts: number;
}

let provider: (() => ForegroundInfo | null) | null = null;
let tabReportProvider: ((windowTitle: string | null) => { domain: string; contentUrl: string | null } | null) | null = null;

/**
 * The extension's tab report, but only if it describes the window with this title (fresh, and the
 * titles match). Watch mode's fallback when the browser itself can't be asked.
 */
export function setTabReportProvider(fn: typeof tabReportProvider): void {
  tabReportProvider = fn;
}

export function getTabReport(windowTitle: string | null): { domain: string; contentUrl: string | null } | null {
  return tabReportProvider?.(windowTitle) ?? null;
}

export function setForegroundProvider(fn: (() => ForegroundInfo | null) | null): void {
  provider = fn;
}

export function getForeground(): ForegroundInfo | null {
  return provider?.() ?? null;
}
