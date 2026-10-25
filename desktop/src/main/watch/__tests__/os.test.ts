import { describe, expect, it, vi } from 'vitest';
import { createBrowserProbe, isScriptableBrowser, parseProbe } from '../browser-probe.js';
import { createFrontWindowReader, parseFrontWindow } from '../front-window.js';
import { captureWindowById } from '../../hints/capture.js';

describe('front-window helper output', () => {
  it('parses the helper JSON; a missing or empty title becomes null', () => {
    expect(parseFrontWindow('{"app":"Google Chrome","pid":622,"windowId":2083,"title":"Coin Change - LeetCode","bounds":{}}\n')).toEqual({
      app: 'Google Chrome',
      pid: 622,
      windowId: 2083,
      title: 'Coin Change - LeetCode'
    });
    expect(parseFrontWindow('{"app":"Code","pid":1,"title":""}')).toEqual({ app: 'Code', pid: 1, windowId: null, title: null });
    expect(parseFrontWindow('garbage')).toBeNull();
  });

  it('returns null without the helper or when it fails', async () => {
    expect(await createFrontWindowReader(vi.fn(), null)()).toBeNull();
    expect(await createFrontWindowReader(async () => Promise.reject(new Error('x')), '/bin/fw')()).toBeNull();
  });
});

describe('browser probe', () => {
  it('reduces the tab URL to the host, plus a content URL for papers and videos only', () => {
    expect(parseProbe('{"mode":"normal","title":"Coin Change","url":"https://leetcode.com/problems/coin-change/?envType=x"}')).toEqual({
      incognito: false,
      host: 'leetcode.com',
      title: 'Coin Change',
      contentUrl: null
    });
    expect(parseProbe('{"mode":"normal","title":"Paper","url":"https://arxiv.org/abs/1706.03762"}')?.contentUrl).toBe('https://arxiv.org/abs/1706.03762');
    expect(parseProbe('{"mode":"incognito","title":"x","url":"https://a.com"}')?.incognito).toBe(true);
    expect(parseProbe('{"mode":"normal","title":"New Tab","url":"chrome://newtab/"}')?.host).toBeNull();
  });

  it('only scripts Chromium browsers, and reports a denied Automation permission', async () => {
    expect(isScriptableBrowser('Google Chrome')).toBe(true);
    expect(isScriptableBrowser('Safari')).toBe(false);
    const probe = createBrowserProbe(async () => Promise.reject(Object.assign(new Error('x'), { stderr: 'Not authorized to send Apple events (-1743)' })));
    expect(await probe('Safari')).toEqual({ ok: false, reason: 'unsupported' });
    expect(await probe('Google Chrome')).toEqual({ ok: false, reason: 'denied' });
  });
});

describe('captureWindowById', () => {
  const thumb = { isEmpty: () => false, toDataURL: () => 'data:image/png;base64,UE5H' };
  it('captures exactly the window with that number, or nothing', async () => {
    const getSources = vi.fn(async () => [
      { id: 'window:11:0', name: 'Messages', thumbnail: thumb },
      { id: 'window:2083:0', name: 'Coin Change', thumbnail: thumb }
    ]);
    expect(await captureWindowById({ desktopCapturer: { getSources }, screenAccess: () => 'granted' }, 2083)).toMatchObject({ ok: true });
    expect(await captureWindowById({ desktopCapturer: { getSources }, screenAccess: () => 'granted' }, 20)).toEqual({ ok: false, reason: 'empty' });
    expect(await captureWindowById({ desktopCapturer: { getSources }, screenAccess: () => 'denied' }, 2083)).toEqual({ ok: false, reason: 'permission' });
  });
});
