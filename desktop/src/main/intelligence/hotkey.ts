import type { HintTriggerType } from '@wolfie/shared';

// Global hotkey for "I need help" (SPEC 4d). Electron's globalShortcut is injected so this runs
// under plain Node in tests.

export const HELP_HOTKEY = 'Alt+Shift+H';

export interface GlobalShortcutLike {
  register(accelerator: string, callback: () => void): boolean;
  unregister(accelerator: string): void;
}

/** Returns an unregister function, or null (with a log line) if the key is taken by another app. */
export function registerHelpHotkey(
  shortcuts: GlobalShortcutLike,
  requestHelp: (trigger: HintTriggerType) => void,
  log: (line: string) => void = console.log,
  accelerator: string = HELP_HOTKEY
): (() => void) | null {
  let ok = false;
  try {
    ok = shortcuts.register(accelerator, () => requestHelp('manual'));
  } catch (error) {
    log(`[hotkey] could not register ${accelerator}: ${(error as Error).message}`);
  }
  if (!ok) {
    log(`[hotkey] ${accelerator} is unavailable; clicking Wolfie or saying "I'm stuck" still works`);
    return null;
  }
  return () => shortcuts.unregister(accelerator);
}
