// Pure decisions about what the extension may report (SPEC Phase 2). No chrome.* here, so it is
// unit-testable. Excluded and incognito pages report nothing.

export interface ReportState {
  /** desk.state.reporting: session active, browser frontmost, desktop not paused. */
  reporting: boolean;
  /** desk.state.paused */
  paused: boolean;
  /** Paused from the popup. */
  localPaused: boolean;
  /** From the desktop settings (defaults: banking, email, health portals). */
  excludedDomains: string[];
  /** Added in the popup, enforced here as well. */
  localExcludedDomains: string[];
}

/** Suffix match: `chase.com` excludes `www.chase.com` but not `notchase.com`. */
export function isExcluded(domain: string, excluded: string[]): boolean {
  const d = domain.toLowerCase();
  return excluded.some((e) => {
    const x = e.trim().toLowerCase();
    return x !== '' && (d === x || d.endsWith(`.${x}`));
  });
}

/** Normalizes user input like "https://www.Example.com/path" to "www.example.com"; null if junk. */
export function normalizeDomainInput(input: string): string | null {
  let text = input.trim().toLowerCase();
  if (!text) return null;
  text = text.replace(/^[a-z][a-z0-9+.-]*:\/\//, '').split(/[/?#]/)[0].replace(/:\d+$/, '');
  return /^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)*$/.test(text) ? text : null;
}

// Paper/video URL rule, shared with the desktop's Watch mode (which applies it to Chrome's tab URL)
export { contentUrlFor } from '@wolfie/shared';

/**
 * The domain to report for a tab, or null if this tab must report nothing: not reporting,
 * paused (desktop or popup), incognito, no/unsupported URL, or excluded.
 */
export function reportableDomain(tab: { url?: string; incognito?: boolean }, state: ReportState): string | null {
  if (!state.reporting || state.paused || state.localPaused) return null;
  if (tab.incognito || !tab.url) return null;
  let url: URL;
  try {
    url = new URL(tab.url);
  } catch {
    return null;
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return null;
  const host = url.hostname.toLowerCase();
  if (!host) return null;
  return isExcluded(host, [...state.excludedDomains, ...state.localExcludedDomains]) ? null : host;
}
