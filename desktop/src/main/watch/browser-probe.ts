import { contentUrlFor } from '@wolfie/shared';
import type { ExecFileFn } from './front-window.js';

// What the front browser window shows, asked from the browser itself (Chromium's AppleScript
// dictionary, via the macOS Automation permission). This is how Watch mode knows for sure that a
// window is incognito, or which site it is on, without trusting window titles. The full URL is
// reduced here to the host plus, for papers and videos only, the content URL; it is not kept.

export interface BrowserTab {
  incognito: boolean;
  host: string | null;
  title: string | null;
  /** Paper or video URL (PDF, arXiv, YouTube); null for any other page. */
  contentUrl: string | null;
}

export type ProbeResult = { ok: true; tab: BrowserTab } | { ok: false; reason: 'unsupported' | 'denied' | 'error' };

/** Browsers with Chrome's scripting dictionary (windows[0].mode, activeTab.url/title). */
const CHROMIUM_SCRIPTABLE = ['google chrome', 'google chrome canary', 'google chrome beta', 'chromium', 'brave browser', 'microsoft edge'];

export function isScriptableBrowser(app: string): boolean {
  return CHROMIUM_SCRIPTABLE.includes(app.trim().toLowerCase());
}

const script = (app: string) => `
const b = Application(${JSON.stringify(app)});
const w = b.windows[0];
JSON.stringify({ mode: w.mode(), title: w.activeTab.title(), url: w.activeTab.url() });
`;

export function parseProbe(stdout: string): BrowserTab | null {
  try {
    const raw = JSON.parse(stdout.trim()) as { mode?: unknown; title?: unknown; url?: unknown };
    const url = typeof raw.url === 'string' ? raw.url : '';
    let host: string | null = null;
    try {
      const u = new URL(url);
      if (u.protocol === 'http:' || u.protocol === 'https:') host = u.hostname.toLowerCase();
    } catch {
      host = null;
    }
    return {
      incognito: raw.mode !== 'normal',
      host,
      title: typeof raw.title === 'string' && raw.title.trim() ? raw.title : null,
      contentUrl: contentUrlFor(url)
    };
  } catch {
    return null;
  }
}

export function createBrowserProbe(execFile: ExecFileFn): (app: string) => Promise<ProbeResult> {
  return async (app) => {
    if (!isScriptableBrowser(app)) return { ok: false, reason: 'unsupported' };
    try {
      const { stdout } = await execFile('osascript', ['-l', 'JavaScript', '-e', script(app)], { timeout: 2500 });
      const tab = parseProbe(stdout);
      return tab ? { ok: true, tab } : { ok: false, reason: 'error' };
    } catch (error) {
      const text = `${String((error as { stderr?: unknown }).stderr ?? '')} ${String((error as Error).message ?? '')}`;
      return { ok: false, reason: /-1743|not authori[sz]ed|not allowed/i.test(text) ? 'denied' : 'error' };
    }
  };
}
