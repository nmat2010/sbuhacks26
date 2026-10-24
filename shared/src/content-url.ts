// Which pages may be identified by their full URL (WATCH_MODE.md): papers and videos only.
// Used by the extension (ext.tab contentUrl) and by the desktop when it reads Chrome's tab URL.

/**
 * The full URL to use for a paper or a video (a PDF, an arXiv abstract/PDF page, a YouTube watch
 * page) so Watch mode can read it; null for every other page, which only ever reports its domain.
 */
export function contentUrlFor(rawUrl: string | undefined): string | null {
  if (!rawUrl) return null;
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    return null;
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return null;
  const host = url.hostname.toLowerCase();
  if (/\.pdf$/i.test(url.pathname)) return `${url.origin}${url.pathname}`;
  if ((host === 'arxiv.org' || host.endsWith('.arxiv.org')) && /^\/(abs|pdf)\//.test(url.pathname)) {
    return `${url.origin}${url.pathname}`;
  }
  if (host === 'youtube.com' || host.endsWith('.youtube.com')) {
    // watch?v=ID, /shorts/ID and /live/ID all become the standard watch URL Gemini can read
    const v = url.pathname === '/watch' ? url.searchParams.get('v') : /^\/(shorts|live)\/([\w-]+)/.exec(url.pathname)?.[2];
    return v && /^[\w-]{6,20}$/.test(v) ? `https://www.youtube.com/watch?v=${v}` : null;
  }
  if (host === 'youtu.be') {
    const v = url.pathname.slice(1);
    return /^[\w-]{6,20}$/.test(v) ? `https://www.youtube.com/watch?v=${v}` : null;
  }
  return null;
}

