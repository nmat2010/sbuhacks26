import { beforeEach, describe, expect, it } from 'vitest';
import type { PopupStatus } from '../../lib/messages';
import { mountPopup, statusText, type PopupApi } from '../view';

const html = `
<div id="status"></div><input id="token"><button id="save-token"></button>
<button id="pause"></button><div id="pause-note"></div>
<ul id="managed"></ul><ul id="local"></ul>
<input id="new-domain"><button id="add-domain"></button><div id="error"></div>`;

const base: PopupStatus = {
  connected: true,
  reporting: true,
  deskPaused: false,
  localPaused: false,
  hasToken: true,
  deskExcluded: ['chase.com'],
  localExcluded: ['reddit.com']
};

let status: PopupStatus;
let calls: string[];
const api: PopupApi = {
  getStatus: async () => status,
  setToken: async (t) => {
    calls.push(`token:${t}`);
    return status;
  },
  setPaused: async (p) => {
    calls.push(`paused:${p}`);
    status = { ...status, localPaused: p };
    return status;
  },
  setExcluded: async (d) => {
    calls.push(`excluded:${d.join(',')}`);
    status = { ...status, localExcluded: d };
    return status;
  }
};
const tick = () => new Promise((r) => setTimeout(r, 0));
const click = (id: string) => (document.getElementById(id) as HTMLElement).click();

beforeEach(() => {
  document.body.innerHTML = html;
  status = { ...base };
  calls = [];
});

describe('popup', () => {
  it('describes each connection state', () => {
    expect(statusText({ ...base, hasToken: false }).className).toBe('waiting');
    expect(statusText({ ...base, connected: false }).className).toBe('disconnected');
    expect(statusText(base)).toEqual({ text: 'Connected and reporting this tab', className: 'connected' });
    expect(statusText({ ...base, localPaused: true }).text).toContain('paused here');
    expect(statusText({ ...base, deskPaused: true }).text).toContain('paused in Wolfie');
  });

  it('renders status and both exclusion lists', async () => {
    await mountPopup(document, api).refresh();
    expect(document.getElementById('status')!.textContent).toContain('reporting');
    expect(document.querySelectorAll('#managed li')).toHaveLength(1);
    expect(document.querySelectorAll('#managed button')).toHaveLength(0); // managed by the desktop
    expect(document.querySelector('#local li span')!.textContent).toBe('reddit.com');
  });

  it('toggles pause', async () => {
    const popup = mountPopup(document, api);
    await popup.refresh();
    click('pause');
    await tick();
    expect(calls).toEqual(['paused:true']);
    expect(document.getElementById('pause')!.textContent).toBe('Resume reporting');
  });

  it('adds a normalized domain, rejects junk, and removes one', async () => {
    const popup = mountPopup(document, api);
    await popup.refresh();
    (document.getElementById('new-domain') as HTMLInputElement).value = 'https://News.Example.com/x';
    click('add-domain');
    await tick();
    expect(calls).toEqual(['excluded:reddit.com,news.example.com']);

    (document.getElementById('new-domain') as HTMLInputElement).value = '<b>nope</b>';
    click('add-domain');
    expect(document.getElementById('error')!.textContent).not.toBe('');
    expect(calls).toHaveLength(1);

    (document.querySelector('#local li button') as HTMLElement).click();
    await tick();
    expect(calls.at(-1)).toBe('excluded:news.example.com');
  });

  it('saves a trimmed pairing token', async () => {
    await mountPopup(document, api).refresh();
    (document.getElementById('token') as HTMLInputElement).value = '  ABCD-EFGH-JKLM ';
    click('save-token');
    await tick();
    expect(calls).toEqual(['token:ABCD-EFGH-JKLM']);
  });

  it('never injects HTML from domain names', async () => {
    status = { ...base, deskExcluded: ['<img src=x onerror=alert(1)>'] };
    await mountPopup(document, api).refresh();
    expect(document.querySelector('#managed img')).toBeNull();
  });
});
