// Screenshot fallback for the hint flow (SPEC 4e.1): used for non-browser apps, canvas, PDF
// viewers and pages whose summary is empty. Electron's desktopCapturer is injected (it is only
// importable from register.ts). Matching the frontmost window by title needs a provider from the
// monitor (Agent A); without one we capture the primary screen.

export interface ThumbnailLike {
  isEmpty(): boolean;
  toDataURL(): string;
  /** Electron's NativeImage has it; used for smaller frames (Watch mode). */
  toJPEG?(quality: number): Buffer;
}

export interface CaptureSourceLike {
  id: string;
  name: string;
  thumbnail: ThumbnailLike;
}

export interface DesktopCapturerLike {
  getSources(opts: {
    types: Array<'window' | 'screen'>;
    thumbnailSize: { width: number; height: number };
  }): Promise<CaptureSourceLike[]>;
}

export type ScreenAccess = 'granted' | 'denied' | 'not-determined' | 'restricted' | 'unknown';

export interface FrontWindow {
  title?: string;
  app?: string;
}

export interface CaptureDeps {
  desktopCapturer: DesktopCapturerLike;
  /** systemPreferences.getMediaAccessStatus('screen') */
  screenAccess: () => ScreenAccess;
  frontWindow?: () => FrontWindow | null;
  thumbnailSize?: { width: number; height: number };
  /** JPEG (quality 0-100) instead of PNG when the thumbnail supports it. */
  jpegQuality?: number;
  /**
   * Only the active window, never the whole screen (Watch mode): if the window can't be matched,
   * the result is `empty`, because a screen capture would include other apps' windows.
   */
  windowOnly?: boolean;
}

export type CaptureResult =
  | { ok: true; dataUrl: string; sourceName: string }
  | { ok: false; reason: 'permission' | 'empty' | 'error' };

let frontWindowProvider: (() => FrontWindow | null) | null = null;

/** Agent A's monitor can call this once so captures match the window the student is in. */
export function setFrontWindowProvider(fn: (() => FrontWindow | null) | null): void {
  frontWindowProvider = fn;
}

export function getFrontWindowProvider(): (() => FrontWindow | null) | null {
  return frontWindowProvider;
}

function encode(thumbnail: ThumbnailLike, jpegQuality: number | undefined): string {
  if (jpegQuality !== undefined && thumbnail.toJPEG) {
    return `data:image/jpeg;base64,${thumbnail.toJPEG(jpegQuality).toString('base64')}`;
  }
  return thumbnail.toDataURL();
}

export async function captureActiveWindow(deps: CaptureDeps): Promise<CaptureResult> {
  // Without Screen Recording permission macOS returns blank thumbnails, so check first.
  if (deps.screenAccess() !== 'granted') return { ok: false, reason: 'permission' };
  try {
    const size = deps.thumbnailSize ?? { width: 1280, height: 800 };
    const front = deps.frontWindow?.() ?? frontWindowProvider?.() ?? null;

    if (front && (front.title || front.app)) {
      const windows = await deps.desktopCapturer.getSources({ types: ['window'], thumbnailSize: size });
      const title = front.title?.toLowerCase();
      const app = front.app?.toLowerCase();
      const match =
        windows.find((w) => title && w.name.toLowerCase().includes(title)) ??
        windows.find((w) => app && w.name.toLowerCase().includes(app));
      if (match && !match.thumbnail.isEmpty()) {
        return { ok: true, dataUrl: encode(match.thumbnail, deps.jpegQuality), sourceName: 'window' };
      }
    }

    if (deps.windowOnly) return { ok: false, reason: 'empty' };
    const screens = await deps.desktopCapturer.getSources({ types: ['screen'], thumbnailSize: size });
    const screen = screens.find((s) => !s.thumbnail.isEmpty());
    if (!screen) return { ok: false, reason: 'empty' };
    return { ok: true, dataUrl: encode(screen.thumbnail, deps.jpegQuality), sourceName: 'screen' };
  } catch {
    return { ok: false, reason: 'error' };
  }
}

/**
 * Exactly one window, by its macOS window number (desktopCapturer ids are "window:<n>:0"). Watch
 * mode uses this with the native front-window helper, so it never captures a different window and
 * never falls back to the whole screen.
 */
export async function captureWindowById(
  deps: Pick<CaptureDeps, 'desktopCapturer' | 'screenAccess' | 'thumbnailSize' | 'jpegQuality'>,
  windowId: number
): Promise<CaptureResult> {
  if (deps.screenAccess() !== 'granted') return { ok: false, reason: 'permission' };
  try {
    const size = deps.thumbnailSize ?? { width: 1024, height: 640 };
    const windows = await deps.desktopCapturer.getSources({ types: ['window'], thumbnailSize: size });
    const match = windows.find((w) => w.id.startsWith(`window:${windowId}:`));
    if (!match || match.thumbnail.isEmpty()) return { ok: false, reason: 'empty' };
    return { ok: true, dataUrl: encode(match.thumbnail, deps.jpegQuality), sourceName: 'window' };
  } catch {
    return { ok: false, reason: 'error' };
  }
}
