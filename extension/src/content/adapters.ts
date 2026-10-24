// At most two tiny per-site adapters (SPEC 4b: "do not build per-site adapters beyond that").
// They only add what generic detection cannot know: a stable problem id from the URL and the
// site's own submit/run buttons. Selectors marked UNVERIFIED were written from memory of the
// sites' markup and have not been checked against the live pages.

export interface SiteAdapter {
  name: string;
  matches(hostname: string): boolean;
  /** Stable id of the problem on screen, derived from the URL path. */
  problemId(pathname: string): string | undefined;
  /** UNVERIFIED: elements whose click means "check my answer". */
  submitSelectors: string[];
}

export const ADAPTERS: SiteAdapter[] = [
  {
    // Coding-practice site. The /problems/<slug>/ URL shape is stable.
    name: 'leetcode',
    matches: (h) => h === 'leetcode.com' || h.endsWith('.leetcode.com'),
    problemId: (path) => {
      const slug = /^\/problems\/([^/]+)/.exec(path)?.[1];
      return slug ? `leetcode-${slug}` : undefined;
    },
    submitSelectors: ['[data-e2e-locator="console-submit-button"]', '[data-e2e-locator="console-run-button"]']
  },
  {
    // Generic quiz/exercise site (exercise URLs end in /e/<slug>).
    name: 'khan-academy',
    matches: (h) => h === 'khanacademy.org' || h.endsWith('.khanacademy.org'),
    problemId: (path) => {
      const slug = /\/e\/([^/]+)/.exec(path)?.[1];
      return slug ? `khan-${slug}` : undefined;
    },
    submitSelectors: ['[data-testid="exercise-check-answer"]']
  }
];

export function adapterFor(hostname: string): SiteAdapter | null {
  return ADAPTERS.find((a) => a.matches(hostname.toLowerCase())) ?? null;
}
