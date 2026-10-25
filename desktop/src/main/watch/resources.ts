import type { WatchResource } from '../../common/ipc-intelligence.js';
import type { ResourceSuggestion } from './types.js';

// New study material from outside the session ("what should I watch to understand this paper?").
// The model only suggests: a search phrase for each video, a link for each article/course/book.
// Nothing it makes up reaches the student: videos are the top real YouTube result for the phrase,
// links are opened to check they load, and anything that can't be checked becomes a search link.
// (Gemini's Google Search tool would do this too, but it is not on the free tier.)

const TIMEOUT_MS = 6000;
export const MAX_RESOURCES = 4;
const UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36';

export interface ResourceFinderDeps {
  fetch: typeof fetch;
  timeoutMs?: number;
}

export interface YouTubeResult {
  id: string;
  title: string;
  channel: string | null;
  length: string | null;
}

export function createResourceFinder(deps: ResourceFinderDeps) {
  const timeoutMs = deps.timeoutMs ?? TIMEOUT_MS;

  const get = async (url: string): Promise<Response> => {
    return deps.fetch(url, {
      redirect: 'follow',
      signal: AbortSignal.timeout(timeoutMs),
      headers: { 'user-agent': UA, 'accept-language': 'en-US,en;q=0.9' }
    });
  };

  const searchYouTube = async (query: string): Promise<YouTubeResult[]> => {
    const res = await get(`https://www.youtube.com/results?search_query=${encodeURIComponent(query)}&hl=en`);
    if (!res.ok) return [];
    return parseYouTubeResults(await res.text());
  };

  const loads = async (url: string): Promise<boolean> => {
    try {
      const res = await get(url);
      void res.body?.cancel().catch(() => {});
      return res.ok;
    } catch {
      return false;
    }
  };

  /**
   * Real, checked links for the model's suggestions (in order, at most MAX_RESOURCES).
   * `exclude` holds URLs the student already has (videos in the session), so they are not suggested again.
   */
  return async function findResources(suggestions: ResourceSuggestion[], exclude: string[] = []): Promise<WatchResource[]> {
    const taken = new Set(exclude.map((u) => youTubeId(u) ?? u));
    const resolved = await Promise.all(
      suggestions.slice(0, MAX_RESOURCES).map(async (s): Promise<WatchResource[]> => {
        const why = s.why.trim();
        if (s.kind === 'video') {
          const query = (s.search_query || s.title).trim();
          try {
            const results = await searchYouTube(query);
            // A few candidates, so a video already suggested above (or already watched) is skipped
            return results.slice(0, 5).map((v) => ({
              kind: 'video' as const,
              title: v.title,
              url: `https://www.youtube.com/watch?v=${v.id}`,
              why,
              detail: [v.channel, v.length].filter(Boolean).join(' · ') || null,
              checked: true
            }));
          } catch {
            /* falls back to a search link below */
          }
          return [searchLink(s, why)];
        }
        // A site's home page is not the resource itself ("Neural User Adaptation" -> aclanthology.org/)
        const url = specific(safeUrl(s.url));
        if (url && (await loads(url))) return [{ kind: s.kind, title: s.title.trim(), url, why, detail: hostOf(url), checked: true }];
        return [searchLink(s, why)];
      })
    );

    const out: WatchResource[] = [];
    for (const candidates of resolved) {
      const pick = candidates.find((c) => !taken.has(youTubeId(c.url) ?? c.url));
      if (!pick) continue;
      taken.add(youTubeId(pick.url) ?? pick.url);
      out.push(pick);
    }
    return out;
  };
}

export type FindResources = ReturnType<typeof createResourceFinder>;

/** A search the student can open when a suggestion could not be checked (always a working link). */
function searchLink(s: ResourceSuggestion, why: string): WatchResource {
  const query = (s.search_query || s.title).trim();
  const video = s.kind === 'video';
  return {
    kind: s.kind,
    title: s.title.trim(),
    url: video
      ? `https://www.youtube.com/results?search_query=${encodeURIComponent(query)}`
      : `https://www.google.com/search?q=${encodeURIComponent(query)}`,
    why,
    detail: video ? 'Search on YouTube' : 'Search on Google',
    checked: false
  };
}

/** Videos from a YouTube results page (its embedded ytInitialData), in ranking order. */
export function parseYouTubeResults(html: string): YouTubeResult[] {
  const match = /var ytInitialData = (\{.*?\});<\/script>/s.exec(html);
  if (!match) return [];
  let data: unknown;
  try {
    data = JSON.parse(match[1]);
  } catch {
    return [];
  }
  const out: YouTubeResult[] = [];
  const walk = (node: unknown): void => {
    if (!node || typeof node !== 'object') return;
    if (Array.isArray(node)) {
      node.forEach(walk);
      return;
    }
    const record = node as Record<string, unknown>;
    const video = record.videoRenderer as
      | { videoId?: string; title?: { runs?: Array<{ text?: string }> }; ownerText?: { runs?: Array<{ text?: string }> }; lengthText?: { simpleText?: string } }
      | undefined;
    // Live streams and upcoming premieres have no length: skip them
    if (video?.videoId && video.lengthText?.simpleText) {
      out.push({
        id: video.videoId,
        title: video.title?.runs?.map((r) => r.text ?? '').join('') || 'YouTube video',
        channel: video.ownerText?.runs?.[0]?.text ?? null,
        length: video.lengthText.simpleText
      });
      return;
    }
    for (const value of Object.values(record)) walk(value);
  };
  walk(data);
  return out;
}

/** http(s) URLs only; anything else (javascript:, file:, garbage) is null. */
export function safeUrl(raw: string | null | undefined): string | null {
  if (!raw) return null;
  try {
    const url = new URL(raw.trim());
    return url.protocol === 'https:' || url.protocol === 'http:' ? url.toString() : null;
  } catch {
    return null;
  }
}

/** The URL when it points at a page, not just a site's home page. */
function specific(url: string | null): string | null {
  if (!url) return null;
  const { pathname, search } = new URL(url);
  return pathname.replace(/\/+$/, '') || search ? url : null;
}

function hostOf(url: string): string | null {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return null;
  }
}

function youTubeId(url: string): string | null {
  const m = /(?:youtube\.com\/watch\?(?:.*&)?v=|youtu\.be\/)([\w-]{11})/.exec(url);
  return m ? m[1] : null;
}
