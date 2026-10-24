import type { ExtensionMessageOf } from '@wolfie/shared';

export type DeskState = ExtensionMessageOf<'desk.state'>['payload'];

export interface DeskStateInput {
  sessionActive: boolean;
  /** A browser the extension runs in is the frontmost app. */
  browserFrontmost: boolean;
  paused: boolean;
  excludedDomains: string[];
  capturePageText: boolean;
}

/** The extension reports only while a session is active, a browser is frontmost, and not paused. */
export function computeDeskState(input: DeskStateInput): DeskState {
  return {
    reporting: input.sessionActive && input.browserFrontmost && !input.paused,
    paused: input.paused,
    capturePageText: input.capturePageText,
    excludedDomains: [...input.excludedDomains]
  };
}

/** Suffix match: `chase.com` excludes `www.chase.com`. */
export function isExcludedDomain(domain: string, excluded: string[]): boolean {
  const d = domain.toLowerCase();
  return excluded.some((e) => {
    const x = e.trim().toLowerCase();
    return x !== '' && (d === x || d.endsWith(`.${x}`));
  });
}
