import { SearchUnavailableError, type HttpGet, type PaperRecord, type PaperSearcher } from './types.js';

// Semantic Scholar Graph API: GET /graph/v1/paper/search?query=...&fields=... Unauthenticated
// callers share a small pool and see 429s often, so we space requests, retry once on 429, and
// otherwise report "unavailable" (the verifier then treats that as "could not check", not "fake").

export const S2_MIN_INTERVAL_MS = 1100;

export interface SemanticScholarOptions {
  http: HttpGet;
  apiKey?: string;
  baseUrl?: string;
  minIntervalMs?: number;
  retryDelayMs?: number;
  now?: () => number;
  sleep?: (ms: number) => Promise<void>;
}

interface S2Result {
  data?: Array<{
    title?: string;
    year?: number | null;
    url?: string;
    authors?: Array<{ name?: string }>;
    externalIds?: { ArXiv?: string; DOI?: string };
  }>;
}

export class SemanticScholarClient implements PaperSearcher {
  readonly name = 'semantic_scholar' as const;
  private lastRequestAt = -Infinity;
  private queue: Promise<unknown> = Promise.resolve();
  private readonly now: () => number;
  private readonly sleep: (ms: number) => Promise<void>;

  constructor(private readonly opts: SemanticScholarOptions) {
    this.now = opts.now ?? Date.now;
    this.sleep = opts.sleep ?? ((ms) => new Promise((r) => setTimeout(r, ms)));
  }

  searchByTitle(title: string): Promise<PaperRecord[]> {
    const run = this.queue.then(() => this.request(title));
    this.queue = run.catch(() => undefined);
    return run;
  }

  private async request(title: string): Promise<PaperRecord[]> {
    const base = (this.opts.baseUrl ?? 'https://api.semanticscholar.org').replace(/\/$/, '');
    const url = `${base}/graph/v1/paper/search?query=${encodeURIComponent(title)}&limit=5&fields=title,authors,year,externalIds,url`;
    const headers: Record<string, string> = this.opts.apiKey ? { 'x-api-key': this.opts.apiKey } : {};

    for (let attempt = 0; attempt < 2; attempt++) {
      const wait = this.lastRequestAt + (this.opts.minIntervalMs ?? S2_MIN_INTERVAL_MS) - this.now();
      if (wait > 0) await this.sleep(wait);
      this.lastRequestAt = this.now();

      let response;
      try {
        response = await this.opts.http(url, headers);
      } catch (error) {
        throw new SearchUnavailableError(`Semantic Scholar request failed: ${(error as Error).message}`);
      }
      if (response.status === 429) {
        if (attempt === 0) {
          await this.sleep(this.opts.retryDelayMs ?? 2000);
          continue;
        }
        throw new SearchUnavailableError('Semantic Scholar is rate limiting requests');
      }
      if (response.status !== 200) throw new SearchUnavailableError(`Semantic Scholar answered HTTP ${response.status}`);
      return parse(response.text);
    }
    throw new SearchUnavailableError('Semantic Scholar is rate limiting requests');
  }
}

function parse(text: string): PaperRecord[] {
  let json: S2Result;
  try {
    json = JSON.parse(text) as S2Result;
  } catch {
    throw new SearchUnavailableError('Semantic Scholar returned something unreadable');
  }
  const out: PaperRecord[] = [];
  for (const item of json.data ?? []) {
    if (!item.title) continue;
    const arxivId = item.externalIds?.ArXiv ?? null;
    const url = arxivId
      ? `https://arxiv.org/abs/${arxivId}`
      : item.externalIds?.DOI
        ? `https://doi.org/${item.externalIds.DOI}`
        : (item.url ?? '');
    if (!url) continue;
    out.push({
      title: item.title,
      authors: (item.authors ?? []).map((a) => a.name ?? '').filter(Boolean),
      year: item.year ?? null,
      url,
      arxivId,
      source: 'semantic_scholar'
    });
  }
  return out;
}
