import type { PermissionKind, PermissionsStatus, PermissionState } from '../../common/ipc-sensing.js';

// macOS permission status (SPEC Phase 2, plan "Gotchas"). Electron's systemPreferences is
// injected from sensing/register.ts. Every read is guarded: a failure becomes 'unknown'.

export const SETTINGS_URLS = {
  screen: 'x-apple.systempreferences:com.apple.preference.security?Privacy_ScreenCapture',
  accessibility: 'x-apple.systempreferences:com.apple.preference.security?Privacy_Accessibility',
  automation: 'x-apple.systempreferences:com.apple.preference.security?Privacy_Automation',
  microphone: 'x-apple.systempreferences:com.apple.preference.security?Privacy_Microphone'
} as const;

export interface PermissionDeps {
  platform: string;
  getMediaAccessStatus(kind: 'screen' | 'microphone'): string;
  isTrustedAccessibilityClient(prompt: boolean): boolean;
  askForMediaAccess(kind: 'microphone'): Promise<boolean>;
  openExternal(url: string): Promise<void> | void;
  /** From the window poller: only learnable by trying (Automation has no query API). */
  getAutomationState(): PermissionState;
}

function mediaState(raw: string): PermissionState {
  switch (raw) {
    case 'granted':
    case 'denied':
    case 'restricted':
    case 'not-determined':
      return raw;
    default:
      return 'unknown';
  }
}

function safe<T>(fn: () => T, fallback: T): T {
  try {
    return fn();
  } catch {
    return fallback;
  }
}

export function getPermissionsStatus(deps: PermissionDeps): PermissionsStatus {
  if (deps.platform !== 'darwin') {
    return { platform: deps.platform, screen: 'granted', accessibility: 'granted', automation: 'granted', microphone: 'granted' };
  }
  return {
    platform: deps.platform,
    screen: safe(() => mediaState(deps.getMediaAccessStatus('screen')), 'unknown'),
    accessibility: safe(() => (deps.isTrustedAccessibilityClient(false) ? 'granted' : 'denied'), 'unknown'),
    automation: safe(() => deps.getAutomationState(), 'unknown'),
    microphone: safe(() => mediaState(deps.getMediaAccessStatus('microphone')), 'unknown')
  };
}

/**
 * Microphone and Accessibility can prompt; Screen Recording cannot be requested and Automation
 * prompts only on the first Apple event, so those open the matching System Settings pane.
 */
export async function requestPermission(kind: PermissionKind, deps: PermissionDeps): Promise<PermissionsStatus> {
  if (deps.platform === 'darwin') {
    try {
      if (kind === 'microphone') {
        const current = safe(() => mediaState(deps.getMediaAccessStatus('microphone')), 'unknown');
        if (current === 'not-determined') await deps.askForMediaAccess('microphone');
        else if (current !== 'granted') await deps.openExternal(SETTINGS_URLS.microphone);
      } else if (kind === 'accessibility') {
        if (!deps.isTrustedAccessibilityClient(true)) await deps.openExternal(SETTINGS_URLS.accessibility);
      } else {
        await deps.openExternal(SETTINGS_URLS[kind]);
      }
    } catch (error) {
      console.error(`[permissions] request ${kind} failed:`, error instanceof Error ? error.message : error);
    }
  }
  return getPermissionsStatus(deps);
}
