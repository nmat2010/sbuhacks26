import { describe, expect, it, vi } from 'vitest';
import { HELP_HOTKEY, registerHelpHotkey } from '../hotkey.js';

describe('help hotkey', () => {
  it('registers Alt+Shift+H and raises a manual help request', () => {
    let cb: (() => void) | undefined;
    const unregister = vi.fn();
    const request = vi.fn();
    const off = registerHelpHotkey({ register: (_a, c) => ((cb = c), true), unregister }, request, () => {});
    expect(HELP_HOTKEY).toBe('Alt+Shift+H');
    cb!();
    expect(request).toHaveBeenCalledWith('manual');
    off!();
    expect(unregister).toHaveBeenCalledWith('Alt+Shift+H');
  });

  it('degrades quietly when the shortcut is taken or throws', () => {
    const logs: string[] = [];
    expect(registerHelpHotkey({ register: () => false, unregister: vi.fn() }, vi.fn(), (l) => logs.push(l))).toBeNull();
    expect(
      registerHelpHotkey(
        {
          register: () => {
            throw new Error('nope');
          },
          unregister: vi.fn()
        },
        vi.fn(),
        (l) => logs.push(l)
      )
    ).toBeNull();
    expect(logs).toHaveLength(3);
  });
});
