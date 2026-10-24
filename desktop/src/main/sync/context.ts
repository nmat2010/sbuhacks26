import type { PageSummary } from '@wolfie/shared';

// Seam: the extension server (Agent A, A2) stores the latest PageSummary here and installs a
// requester that asks the extension for a fresh one. The hint service (Agent B, B3) reads it.

let latest: PageSummary | null = null;
let requester: (() => Promise<PageSummary | null>) | null = null;

export function setLatestPageSummary(summary: PageSummary | null): void {
  latest = summary;
}

export function getLatestPageSummary(): PageSummary | null {
  return latest;
}

export function setPageSummaryRequester(fn: (() => Promise<PageSummary | null>) | null): void {
  requester = fn;
}

/** Asks the extension for a fresh summary; falls back to the latest one (or null). */
export async function requestPageSummary(): Promise<PageSummary | null> {
  if (!requester) return latest;
  try {
    return (await requester()) ?? latest;
  } catch {
    return latest;
  }
}
