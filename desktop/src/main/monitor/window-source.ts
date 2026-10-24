// Active-window source (SPEC Phase 2). OS specifics live behind WindowSource so tests (and a
// future Windows port) can inject a stream. The default implementation runs JXA through
// `osascript` and talks to System Events, which needs the macOS Automation permission.
// Window titles also need Accessibility; without it the title is simply null.

export interface WindowInfo {
  appName: string;
  windowTitle: string | null;
  /** Unix pid of the frontmost process, when known. Used to skip Wolfie's own windows. */
  pid?: number;
}

export type WindowSourceErrorKind = 'automation_denied' | 'unavailable';

export class WindowSourceError extends Error {
  constructor(
    public readonly kind: WindowSourceErrorKind,
    message: string
  ) {
    super(message);
    this.name = 'WindowSourceError';
  }
}

export interface WindowSource {
  /** Frontmost window, or null if there is none. Throws WindowSourceError. */
  getActiveWindow(opts: { includeTitle: boolean }): Promise<WindowInfo | null>;
}

export type ExecFile = (
  file: string,
  args: string[],
  opts: { timeout: number }
) => Promise<{ stdout: string; stderr?: string }>;

const JXA_APP_ONLY = `
const se = Application('System Events');
const p = se.applicationProcesses.whose({ frontmost: true })[0];
JSON.stringify({ appName: p.name(), windowTitle: null, pid: p.unixId() });
`;

const JXA_WITH_TITLE = `
const se = Application('System Events');
const p = se.applicationProcesses.whose({ frontmost: true })[0];
let title = null;
try { title = p.windows[0].name(); } catch (e) {}
JSON.stringify({ appName: p.name(), windowTitle: title, pid: p.unixId() });
`;

/** Parses osascript output; returns null for empty output or an unnamed process. */
export function parseWindowInfo(stdout: string): WindowInfo | null {
  const text = stdout.trim();
  if (!text) return null;
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new WindowSourceError('unavailable', 'unparseable osascript output');
  }
  const obj = raw as { appName?: unknown; windowTitle?: unknown; pid?: unknown };
  if (typeof obj.appName !== 'string' || !obj.appName) return null;
  const title = typeof obj.windowTitle === 'string' && obj.windowTitle ? obj.windowTitle : null;
  const pid = typeof obj.pid === 'number' && Number.isInteger(obj.pid) ? { pid: obj.pid } : {};
  return { appName: obj.appName, windowTitle: title, ...pid };
}

/** Maps an osascript failure to a typed error. -1743 is "not authorized to send Apple events". */
export function classifyOsascriptError(error: unknown): WindowSourceError {
  const e = error as { stderr?: unknown; message?: unknown; killed?: boolean };
  const text = `${String(e?.stderr ?? '')} ${String(e?.message ?? '')}`;
  if (/-1743|not authori[sz]ed to send apple events|not allowed to send apple events/i.test(text)) {
    return new WindowSourceError('automation_denied', 'Automation permission denied for System Events');
  }
  return new WindowSourceError('unavailable', e?.killed ? 'osascript timed out' : 'osascript failed');
}

export function createOsascriptWindowSource(execFile: ExecFile, timeoutMs = 3000): WindowSource {
  return {
    async getActiveWindow({ includeTitle }) {
      try {
        const { stdout } = await execFile(
          'osascript',
          ['-l', 'JavaScript', '-e', includeTitle ? JXA_WITH_TITLE : JXA_APP_ONLY],
          { timeout: timeoutMs }
        );
        return parseWindowInfo(stdout);
      } catch (error) {
        if (error instanceof WindowSourceError) throw error;
        throw classifyOsascriptError(error);
      }
    }
  };
}
