import { describe, expect, it } from 'vitest';
import { isBrowserApp } from '../browsers.js';
import { getPermissionsStatus, requestPermission, SETTINGS_URLS, type PermissionDeps } from '../permissions.js';
import {
  classifyOsascriptError,
  createOsascriptWindowSource,
  parseWindowInfo,
  WindowSourceError,
  type ExecFile
} from '../window-source.js';

describe('window source', () => {
  it('parses osascript output', () => {
    expect(parseWindowInfo('{"appName":"Safari","windowTitle":"Home"}\n')).toEqual({ appName: 'Safari', windowTitle: 'Home' });
    expect(parseWindowInfo('{"appName":"Finder","windowTitle":null}')).toEqual({ appName: 'Finder', windowTitle: null });
    expect(parseWindowInfo('')).toBeNull();
    expect(() => parseWindowInfo('not json')).toThrow(WindowSourceError);
  });

  it('classifies a denied Automation permission', () => {
    const err = Object.assign(new Error('Command failed'), {
      stderr: 'execution error: Not authorized to send Apple events to System Events. (-1743)'
    });
    expect(classifyOsascriptError(err).kind).toBe('automation_denied');
    expect(classifyOsascriptError(new Error('other')).kind).toBe('unavailable');
  });

  it('runs JXA through execFile with and without the title', async () => {
    const calls: string[][] = [];
    const exec: ExecFile = async (_file, args) => {
      calls.push(args);
      return { stdout: '{"appName":"Code","windowTitle":null}' };
    };
    const source = createOsascriptWindowSource(exec);
    expect(await source.getActiveWindow({ includeTitle: false })).toEqual({ appName: 'Code', windowTitle: null });
    await source.getActiveWindow({ includeTitle: true });
    expect(calls[0].slice(0, 2)).toEqual(['-l', 'JavaScript']);
    expect(calls[0][3]).not.toContain('windows[0]');
    expect(calls[1][3]).toContain('windows[0]');
  });

  it('throws a typed error on failure', async () => {
    const exec: ExecFile = async () => {
      throw Object.assign(new Error('x'), { stderr: 'Not authorized to send Apple events (-1743)' });
    };
    await expect(createOsascriptWindowSource(exec).getActiveWindow({ includeTitle: false })).rejects.toMatchObject({
      kind: 'automation_denied'
    });
  });

  it('knows browsers', () => {
    expect(isBrowserApp('Google Chrome')).toBe(true);
    expect(isBrowserApp('Arc')).toBe(true);
    expect(isBrowserApp('Xcode')).toBe(false);
  });
});

function permDeps(over: Partial<PermissionDeps> = {}): PermissionDeps & { opened: string[]; asked: string[] } {
  const opened: string[] = [];
  const asked: string[] = [];
  return {
    platform: 'darwin',
    getMediaAccessStatus: (k) => (k === 'screen' ? 'denied' : 'not-determined'),
    isTrustedAccessibilityClient: () => false,
    askForMediaAccess: async (k) => {
      asked.push(k);
      return true;
    },
    openExternal: async (url) => {
      opened.push(url);
    },
    getAutomationState: () => 'unknown',
    ...over,
    opened,
    asked
  };
}

describe('permissions', () => {
  it('reports each permission as a status', () => {
    expect(getPermissionsStatus(permDeps())).toEqual({
      platform: 'darwin',
      screen: 'denied',
      accessibility: 'denied',
      automation: 'unknown',
      microphone: 'not-determined'
    });
  });

  it('turns a throwing Electron call into unknown instead of crashing', () => {
    const deps = permDeps({
      getMediaAccessStatus: () => {
        throw new Error('nope');
      }
    });
    expect(getPermissionsStatus(deps)).toMatchObject({ screen: 'unknown', microphone: 'unknown' });
  });

  it('prompts for the microphone, and opens Settings for Screen Recording and Automation', async () => {
    const deps = permDeps();
    await requestPermission('microphone', deps);
    expect(deps.asked).toEqual(['microphone']);
    await requestPermission('screen', deps);
    await requestPermission('automation', deps);
    expect(deps.opened).toEqual([SETTINGS_URLS.screen, SETTINGS_URLS.automation]);
  });

  it('does not gate non-mac platforms', () => {
    expect(getPermissionsStatus(permDeps({ platform: 'linux' })).screen).toBe('granted');
  });
});
