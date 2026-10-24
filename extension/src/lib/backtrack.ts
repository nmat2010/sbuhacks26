import { SettingsDefaults, type StruggleSignal } from '@wolfie/shared';

// `backtracking` (weak, SPEC 4b): URL oscillation A -> B -> A, 3 or more times within 2 minutes
// (three round trips between two pages, e.g. A B A B A B A).
// It lives in the background worker because full-page navigations destroy content scripts.
// Only normalized URLs are compared (origin + path, no query/fragment) and nothing is sent but
// the signal itself.

export function normalizeUrl(href: string): string | null {
  try {
    const u = new URL(href);
    if (u.protocol !== 'http:' && u.protocol !== 'https:') return null;
    return `${u.origin}${u.pathname.replace(/\/+$/, '') || '/'}`;
  } catch {
    return null;
  }
}

export class BacktrackDetector {
  private visits: { url: string; at: number }[] = [];

  constructor(
    private readonly opts: {
      count?: number;
      windowMs?: number;
      now(): number;
      emit(signal: StruggleSignal): void;
    }
  ) {}

  /** Call on each committed navigation of the active tab. Repeated reports of one URL are ignored. */
  visit(href: string): void {
    const url = normalizeUrl(href);
    if (!url) return;
    const now = this.opts.now();
    const windowMs = this.opts.windowMs ?? SettingsDefaults['stuck.thresholds'].backtrackWindowSec * 1000;
    const count = this.opts.count ?? SettingsDefaults['stuck.thresholds'].backtrackCount;

    const last = this.visits.at(-1);
    if (last && last.url === url) return;
    this.visits.push({ url, at: now });
    this.visits = this.visits.filter((v) => now - v.at <= windowMs);

    // Longest recent run that only alternates between two pages; A B A is one round trip,
    // A B A B A B A is three. Browsing a hub (search -> result -> search -> other result) is not it.
    let start = this.visits.length - 1;
    const pair = new Set<string>();
    while (start >= 0) {
      pair.add(this.visits[start].url);
      if (pair.size > 2) break;
      start--;
    }
    const run = this.visits.length - (start + 1);
    const oscillations = Math.floor((run - 1) / 2);
    if (oscillations >= count) {
      this.opts.emit({ type: 'backtracking', strength: 'weak', timestamp: now, metadata: { oscillations } });
    }
  }

  reset(): void {
    this.visits = [];
  }
}
