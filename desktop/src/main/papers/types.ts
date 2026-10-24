// Shared shapes for paper lookup. Network access is injected everywhere (HttpGet), so tests and
// DEMO_MODE never touch the internet.

export interface HttpResponse {
  status: number;
  text: string;
}

export type HttpGet = (url: string, headers?: Record<string, string>) => Promise<HttpResponse>;

/** A paper as reported by a search API (not yet matched to a recommendation). */
export interface PaperRecord {
  title: string;
  authors: string[];
  year: number | null;
  url: string;
  arxivId: string | null;
  source: 'arxiv' | 'semantic_scholar' | 'demo_catalog';
}

export interface PaperSearcher {
  readonly name: PaperRecord['source'];
  /** Throws on network errors, rate limiting, or bad responses; returns [] for "no results". */
  searchByTitle(title: string): Promise<PaperRecord[]>;
}

export class SearchUnavailableError extends Error {}

/** Lowercase, letters and digits only, single spaces. */
export function normalizeTitle(title: string): string {
  return title
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

/**
 * Same paper? Normalized titles must be equal, or one must be the other without its subtitle
 * (models often drop "...: A Survey"), and long enough that a short title cannot match by accident.
 */
export function titlesMatch(a: string, b: string): boolean {
  const na = normalizeTitle(a);
  const nb = normalizeTitle(b);
  if (!na || !nb) return false;
  if (na === nb) return true;
  const [short, long] = na.length <= nb.length ? [na, nb] : [nb, na];
  return short.length >= 15 && long.startsWith(`${short} `);
}
