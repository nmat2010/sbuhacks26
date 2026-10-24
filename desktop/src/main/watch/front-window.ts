// The frontmost app's frontmost window, from the native helper (desktop/native/front-window.swift).
// Its window number matches Electron desktopCapturer ids ("window:<n>:0"), so Watch mode captures
// exactly that window, with no title guessing. macOS only; null when the helper is missing or fails.

export interface FrontWindow {
  app: string;
  /** Registered to open https links: some browser, possibly one we don't know by name. */
  isBrowser?: boolean;
  pid: number;
  windowId: number | null;
  /** Needs Screen Recording; null without it. */
  title: string | null;
}

export type ExecFileFn = (file: string, args: string[], opts: { timeout: number }) => Promise<{ stdout: string }>;

export function parseFrontWindow(stdout: string): FrontWindow | null {
  try {
    const raw = JSON.parse(stdout.trim()) as Record<string, unknown>;
    if (typeof raw.app !== 'string' || typeof raw.pid !== 'number') return null;
    return {
      app: raw.app,
      ...(typeof raw.isBrowser === 'boolean' ? { isBrowser: raw.isBrowser } : {}),
      pid: raw.pid,
      windowId: typeof raw.windowId === 'number' ? raw.windowId : null,
      title: typeof raw.title === 'string' && raw.title.trim() ? raw.title : null
    };
  } catch {
    return null;
  }
}

export function createFrontWindowReader(execFile: ExecFileFn, helperPath: string | null): () => Promise<FrontWindow | null> {
  return async () => {
    if (!helperPath) return null;
    try {
      const { stdout } = await execFile(helperPath, [], { timeout: 2000 });
      return parseFrontWindow(stdout);
    } catch {
      return null;
    }
  };
}
