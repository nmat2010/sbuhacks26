import type { PageSummary, StruggleSignal } from '@wolfie/shared';
import { isExcludedDomain, type DeskState } from './desk-state.js';
import type { DomainTracker } from './domain-tracker.js';
import type { ExtensionHandlers } from './extension-server.js';

// What the desktop does with what the extension reports (A2). Defence in depth: the extension
// already honours desk.state, but the desktop re-checks it so a misbehaving client reports nothing.

export interface ExtensionBridgeDeps {
  tracker: DomainTracker;
  getDeskState(): DeskState;
  setLatestPageSummary(summary: PageSummary | null): void;
  /** Emit stuckBus 'problem-changed'. */
  emitProblemChanged(problemId: string | null): void;
  /** A6 forwards extension signals into stuckBus + web_signals. */
  onSignal?(signal: StruggleSignal, domain: string): void;
}

export interface ExtensionBridge {
  handlers: ExtensionHandlers;
  /** The browser lost focus, the session ended, or monitoring paused: forget the page. */
  clearContext(): void;
  /** New session: the first problem seen counts as a change again. */
  resetProblem(): void;
}

/** Same site for content URLs: www./m. prefixes and youtu.be count as the same YouTube. */
function sameSite(a: string | null, b: string): boolean {
  if (!a) return false;
  const norm = (h: string) => {
    const x = h.toLowerCase().replace(/^(www|m)\./, '');
    return x === 'youtu.be' ? 'youtube.com' : x;
  };
  return norm(a) === norm(b);
}

function hostOf(url: string): string | null {
  try {
    return new URL(url).hostname.toLowerCase();
  } catch {
    return null;
  }
}

export function createExtensionBridge(deps: ExtensionBridgeDeps): ExtensionBridge {
  let lastProblemId: string | null = null;

  const allowed = (domain: string, needsText = false): boolean => {
    const state = deps.getDeskState();
    if (!state.reporting) return false;
    if (needsText && !state.capturePageText) return false;
    return !isExcludedDomain(domain, state.excludedDomains);
  };

  return {
    handlers: {
      onTab({ domain, title, contentUrl }) {
        if (!allowed(domain)) {
          // An excluded page is in front: forget the previous one rather than keep it
          deps.tracker.clear();
          return;
        }
        // The tab title and content URL are kept in memory only; app_events stores the OS window
        // title instead. A content URL must belong to the reported domain.
        deps.tracker.set(domain, title ?? null, contentUrl && sameSite(hostOf(contentUrl), domain) ? contentUrl : null);
      },
      onTabNone() {
        deps.tracker.clear();
      },
      onPageSummary(summary) {
        if (!allowed(summary.domain, true)) return;
        deps.setLatestPageSummary(summary);
        // Only a different, known problemId counts: URL and tab switches never do (plan A2).
        if (summary.problemId && summary.problemId !== lastProblemId) {
          lastProblemId = summary.problemId;
          deps.emitProblemChanged(summary.problemId);
        }
      },
      onSignal(signal, domain) {
        if (!allowed(domain)) return;
        deps.onSignal?.(signal, domain);
      }
    },
    clearContext() {
      deps.tracker.clear();
      deps.setLatestPageSummary(null);
    },
    resetProblem() {
      lastProblemId = null;
    }
  };
}
