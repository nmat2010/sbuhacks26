import type { RuleEntryType } from '@wolfie/shared';

// Rule matching (SPEC Phase 3). Domain suffix matching is the primary path: when the extension
// reports the active tab's domain, only the domain is consulted. Otherwise fall back to the app
// name, and, for browsers only, the window title (titles are unreliable, and matching them in
// every app would flag "Reddit notes.md" open in an editor).

export type RuleKind = 'ai_tool' | 'distraction';

export interface RuleLists {
  aiTools: RuleEntryType[];
  distractions: RuleEntryType[];
}

export interface ForegroundLike {
  appName: string;
  windowTitle: string | null;
  /** Active tab domain from the extension, if connected and reporting. */
  domain: string | null;
  isBrowser: boolean;
}

export interface RuleMatch {
  kind: RuleKind;
  rule: RuleEntryType;
  /** Stable per rule, used for cooldowns and "ignore for this session". */
  key: string;
  via: 'domain' | 'app' | 'title';
}

const escapeRegExp = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** Entry like `youtube.com`; entries with a path (`github.com/copilot`) can't match a bare domain. */
function cleanDomainEntry(entry: string): string | null {
  const d = entry.trim().toLowerCase().replace(/^[a-z]+:\/\//, '');
  if (!d || d.includes('/')) return null;
  return d.replace(/^www\./, '');
}

export function domainMatches(host: string, entry: string): boolean {
  const d = cleanDomainEntry(entry);
  if (!d) return false;
  const h = host.toLowerCase().replace(/^www\./, '');
  return h === d || h.endsWith(`.${d}`);
}

/** Whole-word, case-insensitive containment ("Steam" matches "Steam", not "Steamboat"). */
export function wordMatches(text: string, word: string): boolean {
  const w = word.trim();
  if (!w) return false;
  return new RegExp(`(^|[^\\p{L}\\p{N}])${escapeRegExp(w)}($|[^\\p{L}\\p{N}])`, 'iu').test(text);
}

function matchRule(fg: ForegroundLike, rule: RuleEntryType): RuleMatch['via'] | null {
  if (!rule.enabled) return null;
  if (fg.domain) {
    return rule.domains.some((d) => domainMatches(fg.domain!, d)) ? 'domain' : null;
  }
  if (rule.appNames.some((n) => wordMatches(fg.appName, n))) return 'app';
  if (fg.isBrowser && fg.windowTitle && rule.appNames.some((n) => wordMatches(fg.windowTitle!, n))) return 'title';
  return null;
}

/** AI tools are checked before distractions; the first enabled rule that matches wins. */
export function matchForeground(fg: ForegroundLike, lists: RuleLists): RuleMatch | null {
  const groups: [RuleKind, RuleEntryType[]][] = [
    ['ai_tool', lists.aiTools],
    ['distraction', lists.distractions]
  ];
  for (const [kind, rules] of groups) {
    for (const rule of rules) {
      const via = matchRule(fg, rule);
      if (via) return { kind, rule, key: `${kind}:${rule.name.trim().toLowerCase()}`, via };
    }
  }
  return null;
}
