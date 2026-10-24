import type { PopupStatus } from '../lib/messages';
import { normalizeDomainInput } from '../lib/report';

// Popup rendering and actions, separated from chrome.* so jsdom tests can drive it.
// Only textContent is used: domains come from users and from the desktop.

export interface PopupApi {
  getStatus(): Promise<PopupStatus>;
  setToken(token: string): Promise<PopupStatus>;
  setPaused(paused: boolean): Promise<PopupStatus>;
  setExcluded(domains: string[]): Promise<PopupStatus>;
}

export function statusText(s: PopupStatus): { text: string; className: 'connected' | 'disconnected' | 'waiting' } {
  if (!s.hasToken) return { text: 'Enter the pairing code from Wolfie to connect', className: 'waiting' };
  if (!s.connected) return { text: 'Not connected to desktop (is Wolfie running?)', className: 'disconnected' };
  if (s.localPaused) return { text: 'Connected, reporting paused here', className: 'waiting' };
  if (s.deskPaused) return { text: 'Connected, monitoring paused in Wolfie', className: 'waiting' };
  return s.reporting
    ? { text: 'Connected and reporting this tab', className: 'connected' }
    : { text: 'Connected, waiting for a study session', className: 'connected' };
}

function fillList(ul: HTMLElement, items: string[], className: string, onRemove?: (d: string) => void): void {
  ul.replaceChildren();
  for (const item of items) {
    const li = ul.ownerDocument.createElement('li');
    li.className = className;
    const label = ul.ownerDocument.createElement('span');
    label.textContent = item;
    li.append(label);
    if (onRemove) {
      const btn = ul.ownerDocument.createElement('button');
      btn.textContent = 'x';
      btn.title = `Remove ${item}`;
      btn.addEventListener('click', () => onRemove(item));
      li.append(btn);
    }
    ul.append(li);
  }
}

export function mountPopup(doc: Document, api: PopupApi): { refresh(): Promise<void> } {
  const $ = <T extends HTMLElement>(id: string): T => doc.getElementById(id) as T;
  let current: PopupStatus | null = null;

  const render = (s: PopupStatus) => {
    current = s;
    const st = statusText(s);
    $('status').textContent = st.text;
    $('status').className = `status ${st.className}`;
    $('pause').textContent = s.localPaused ? 'Resume reporting' : 'Pause reporting';
    $('pause-note').textContent = s.deskPaused ? 'Monitoring is also paused in the Wolfie desktop app.' : '';
    fillList($('managed'), s.deskExcluded, 'managed');
    fillList($('local'), s.localExcluded, 'local', (d) => void update(api.setExcluded(s.localExcluded.filter((x) => x !== d))));
  };

  const update = async (p: Promise<PopupStatus>) => {
    try {
      render(await p);
    } catch {
      $('status').textContent = 'The extension is not responding. Reload it from chrome://extensions.';
      $('status').className = 'status disconnected';
    }
  };

  $('save-token').addEventListener('click', () => {
    const token = $<HTMLInputElement>('token').value.trim();
    if (token) void update(api.setToken(token));
  });
  $('pause').addEventListener('click', () => void update(api.setPaused(!(current?.localPaused ?? false))));
  $('add-domain').addEventListener('click', () => {
    const input = $<HTMLInputElement>('new-domain');
    const domain = normalizeDomainInput(input.value);
    if (!domain) {
      $('error').textContent = 'Enter a site like example.com';
      return;
    }
    $('error').textContent = '';
    input.value = '';
    const existing = current?.localExcluded ?? [];
    void update(api.setExcluded([...new Set([...existing, domain])]));
  });

  return { refresh: () => update(api.getStatus()) };
}
