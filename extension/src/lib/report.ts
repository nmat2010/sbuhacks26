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

/**
 * The full URL to send for a paper or a video (a PDF, an arXiv abstract/PDF page, a YouTube watch
 * page) so Watch mode can read it; null for every other page, which only ever reports its domain.
 */
export function contentUrlFor(rawUrl: string | undefined): string | null {
  if (!rawUrl) return null;
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    return null;
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return null;
  const host = url.hostname.toLowerCase();
  if (/\.pdf$/i.test(url.pathname)) return `${url.origin}${url.pathname}`;
  if ((host === 'arxiv.org' || host.endsWith('.arxiv.org')) && /^\/(abs|pdf)\//.test(url.pathname)) {
    return `${url.origin}${url.pathname}`;
  }
  if (host === 'youtube.com' || host.endsWith('.youtube.com')) {
    // watch?v=ID, /shorts/ID and /live/ID all become the standard watch URL Gemini can read
    const v = url.pathname === '/watch' ? url.searchParams.get('v') : /^\/(shorts|live)\/([\w-]+)/.exec(url.pathname)?.[2];
    return v && /^[\w-]{6,20}$/.test(v) ? `https://www.youtube.com/watch?v=${v}` : null;
  }
  if (host === 'youtu.be') {
    const v = url.pathname.slice(1);
    return /^[\w-]{6,20}$/.test(v) ? `https://www.youtube.com/watch?v=${v}` : null;
  }
  return null;
}

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
