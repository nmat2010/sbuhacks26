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
  /** When the monitor last saw this window. */
  ts: number;
}

let provider: (() => ForegroundInfo | null) | null = null;

export function setForegroundProvider(fn: (() => ForegroundInfo | null) | null): void {
  provider = fn;
}

export function getForeground(): ForegroundInfo | null {
  return provider?.() ?? null;
}
