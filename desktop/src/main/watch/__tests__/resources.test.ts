import { describe, expect, it } from 'vitest';
import { createResourceFinder, parseYouTubeResults, safeUrl } from '../resources.js';
import type { ResourceSuggestion } from '../types.js';

function ytPage(videos: Array<{ id: string; title: string; length?: string }>): string {
  const data = {
    contents: {
      sectionListRenderer: {
        contents: [
          {
            itemSectionRenderer: {
              contents: videos.map((v) => ({
                videoRenderer: {
                  videoId: v.id,
                  title: { runs: [{ text: v.title }] },
                  ownerText: { runs: [{ text: 'Channel' }] },
                  ...(v.length ? { lengthText: { simpleText: v.length } } : {})
                }
              }))
            }
          }
        ]
      }
    }
  };
  return `<html><script>var ytInitialData = ${JSON.stringify(data)};</script></html>`;
}

const video = (q: string): ResourceSuggestion => ({ kind: 'video', title: q, search_query: q, url: null, why: 'Basics' });

function finder(routes: Record<string, () => Response>) {
  const seen: string[] = [];
  const find = createResourceFinder({
    fetch: (async (input: string) => {
      seen.push(String(input));
      const key = Object.keys(routes).find((k) => String(input).includes(k));
      if (!key) throw new Error('offline');
      return routes[key]();
    }) as unknown as typeof fetch
  });
  return { find, seen };
}

describe('parseYouTubeResults', () => {
  it('reads videos in order and skips live streams (no length)', () => {
    const html = ytPage([
      { id: 'aaaaaaaaaaa', title: 'Live now' },
      { id: 'bbbbbbbbbbb', title: 'Factor analysis', length: '6:38' }
    ]);
    expect(parseYouTubeResults(html)).toEqual([{ id: 'bbbbbbbbbbb', title: 'Factor analysis', channel: 'Channel', length: '6:38' }]);
    expect(parseYouTubeResults('<html>no data</html>')).toEqual([]);
  });
});

describe('createResourceFinder', () => {
  it('a video suggestion becomes the top real YouTube result, skipping videos the student has', async () => {
    const { find, seen } = finder({
      'youtube.com/results': () =>
        new Response(ytPage([
          { id: 'abcdef12345', title: 'Already watched', length: '5:00' },
          { id: 'lJ0cXPoEozg', title: 'Factor Analysis and Probabilistic PCA', length: '17:46' }
        ]))
    });
    const out = await find([video('factor analysis explained')], ['https://www.youtube.com/watch?v=abcdef12345']);
    expect(seen[0]).toContain('search_query=factor%20analysis%20explained');
    expect(out).toEqual([
      {
        kind: 'video',
        title: 'Factor Analysis and Probabilistic PCA',
        url: 'https://www.youtube.com/watch?v=lJ0cXPoEozg',
        why: 'Basics',
        detail: 'Channel · 17:46',
        checked: true
      }
    ]);
  });

  it('two suggestions that find the same video get different videos', async () => {
    const { find } = finder({
      'youtube.com/results': () =>
        new Response(ytPage([
          { id: 'aaaaaaaaaaa', title: 'A', length: '1:00' },
          { id: 'bbbbbbbbbbb', title: 'B', length: '2:00' }
        ]))
    });
    const out = await find([video('one'), video('two')]);
    expect(out.map((r) => r.title)).toEqual(['A', 'B']);
  });

  it('a link that loads is kept; a broken or unsafe one becomes a Google search', async () => {
    const { find } = finder({
      'aclanthology.org/D17-1119': () => new Response('ok'),
      'aclanthology.org/': () => new Response('home'),
      'example.com/made-up': () => new Response('nope', { status: 404 })
    });
    const out = await find([
      { kind: 'paper', title: 'User-factor adaptation', search_query: null, url: 'https://aclanthology.org/D17-1119.pdf', why: 'The paper' },
      { kind: 'article', title: 'Made up', search_query: 'domain adaptation tutorial', url: 'https://example.com/made-up', why: 'x' },
      { kind: 'course', title: 'Bad', search_query: null, url: 'javascript:alert(1)', why: 'x' },
      { kind: 'article', title: 'Neural user adaptation', search_query: null, url: 'https://aclanthology.org/', why: 'x' }
    ]);
    expect(out[0]).toMatchObject({ url: 'https://aclanthology.org/D17-1119.pdf', detail: 'aclanthology.org', checked: true });
    expect(out[1]).toMatchObject({ url: 'https://www.google.com/search?q=domain%20adaptation%20tutorial', checked: false });
    expect(out[2]).toMatchObject({ url: 'https://www.google.com/search?q=Bad', checked: false });
    // A site's home page is not the article: search for it instead
    expect(out[3]).toMatchObject({ url: 'https://www.google.com/search?q=Neural%20user%20adaptation', checked: false });
  });

  it('offline: a video suggestion becomes a YouTube search link', async () => {
    const { find } = finder({});
    expect(await find([video('latent variables')])).toEqual([
      expect.objectContaining({ url: 'https://www.youtube.com/results?search_query=latent%20variables', checked: false, detail: 'Search on YouTube' })
    ]);
  });
});

describe('safeUrl', () => {
  it('allows http(s) only', () => {
    expect(safeUrl('https://a.org/x')).toBe('https://a.org/x');
    expect(safeUrl('file:///etc/passwd')).toBeNull();
    expect(safeUrl('not a url')).toBeNull();
  });
});
