import { normalizeTitle, SearchUnavailableError, type HttpGet, type PaperRecord, type PaperSearcher } from './types.js';

// arXiv API (https://info.arxiv.org/help/api/user-manual.html): Atom XML from
// /api/query?search_query=ti:"..."; the usage policy asks for at most one request every 3 seconds.

export const ARXIV_MIN_INTERVAL_MS = 3000;

export interface ArxivOptions {
  http: HttpGet;
  baseUrl?: string;
  minIntervalMs?: number;
  now?: () => number;
  sleep?: (ms: number) => Promise<void>;
}

export class ArxivClient implements PaperSearcher {
  readonly name = 'arxiv' as const;
  private lastRequestAt = -Infinity;
  private queue: Promise<unknown> = Promise.resolve();
  private readonly now: () => number;
  private readonly sleep: (ms: number) => Promise<void>;

  constructor(private readonly opts: ArxivOptions) {
    this.now = opts.now ?? Date.now;
    this.sleep = opts.sleep ?? ((ms) => new Promise((r) => setTimeout(r, ms)));
  }

  /** Requests are serialized and spaced by the minimum interval, even if callers overlap. */
  searchByTitle(title: string): Promise<PaperRecord[]> {
    const run = this.queue.then(() => this.request(title));
    this.queue = run.catch(() => undefined);
    return run;
  }

  private async request(title: string): Promise<PaperRecord[]> {
    const words = normalizeTitle(title);
    if (!words) return [];
    const wait = this.lastRequestAt + (this.opts.minIntervalMs ?? ARXIV_MIN_INTERVAL_MS) - this.now();
    if (wait > 0) await this.sleep(wait);
    this.lastRequestAt = this.now();

    const base = (this.opts.baseUrl ?? 'https://export.arxiv.org').replace(/\/$/, '');
    const url = `${base}/api/query?search_query=${encodeURIComponent(`ti:"${words}"`)}&max_results=5`;
    let response;
    try {
      response = await this.opts.http(url, { 'User-Agent': 'WolfieSensei/1.0 (student study companion)' });
    } catch (error) {
      throw new SearchUnavailableError(`arXiv request failed: ${(error as Error).message}`);
    }
    if (response.status !== 200) throw new SearchUnavailableError(`arXiv answered HTTP ${response.status}`);
    return parseAtom(response.text);
  }
}

// ---- Atom parsing (small and tolerant; the feed is simple and well formed) ------------------

const ENTITIES: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" };

function decode(text: string): string {
  return text
    .replace(/&#(\d+);/g, (_, n: string) => String.fromCodePoint(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n: string) => String.fromCodePoint(parseInt(n, 16)))
    .replace(/&([a-z]+);/gi, (m, name: string) => ENTITIES[name.toLowerCase()] ?? m)
    .replace(/\s+/g, ' ')
    .trim();
}

function tag(xml: string, name: string): string | null {
  const m = new RegExp(`<${name}(?:\\s[^>]*)?>([\\s\\S]*?)</${name}>`).exec(xml);
  return m ? decode(m[1]) : null;
}

/** "http://arxiv.org/abs/1706.03762v7" -> "1706.03762"; also old-style "hep-th/9901001v1". */
export function arxivIdFromUrl(url: string): string | null {
  const m = /arxiv\.org\/abs\/([^\s?#]+?)(?:v\d+)?$/.exec(url.trim());
  return m ? m[1] : null;
}

export function parseAtom(xml: string): PaperRecord[] {
  const out: PaperRecord[] = [];
  for (const entry of xml.split('<entry>').slice(1)) {
    const body = entry.split('</entry>')[0];
    const title = tag(body, 'title');
    const idUrl = tag(body, 'id');
    if (!title || !idUrl) continue;
    const arxivId = arxivIdFromUrl(idUrl);
    if (!arxivId) continue;
    const published = tag(body, 'published');
    const year = published && /^\d{4}/.test(published) ? Number(published.slice(0, 4)) : null;
    const authors = [...body.matchAll(/<author>[\s\S]*?<name>([\s\S]*?)<\/name>[\s\S]*?<\/author>/g)].map((m) => decode(m[1]));
    out.push({ title, authors, year, url: `https://arxiv.org/abs/${arxivId}`, arxivId, source: 'arxiv' });
  }
  return out;
}
