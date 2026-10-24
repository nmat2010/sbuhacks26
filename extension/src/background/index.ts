// Background service worker for Wolfie Sensei extension.
// Phase 0 fix-up: speaks the frozen contract in @wolfie/shared/schemas/extension.ts.
// Agent A (A3) owns the rest: popup UI, exclusions editing, incognito, PageSummary forwarding.
import {
  EXTENSION_WS_PORT,
  ExtensionMessageSchema,
  type ExtensionMessage,
  type ExtensionMessageOf
} from '@wolfie/shared';

console.log('Wolfie Sensei extension background script loaded');

// Extension state
let desktopConnected = false;
let pairingToken: string | null = null;
let ws: WebSocket | null = null;
// Last desk.state from the desktop. Report nothing until the desktop says to.
let deskState: ExtensionMessageOf<'desk.state'>['payload'] = {
  reporting: false,
  paused: false,
  capturePageText: false,
  excludedDomains: []
};

type Outbound = Extract<ExtensionMessage, { type: `ext.${string}` }>;

function send<T extends Outbound['type']>(type: T, payload: Extract<Outbound, { type: T }>['payload']): void {
  if (!ws || ws.readyState !== WebSocket.OPEN) return;
  ws.send(JSON.stringify({ id: crypto.randomUUID(), type, ts: Date.now(), payload }));
}

function isExcluded(domain: string): boolean {
  return deskState.excludedDomains.some((d) => domain === d || domain.endsWith(`.${d}`));
}

/** Domain to report for a tab, or null if this tab must report nothing. */
function reportableDomain(tab: chrome.tabs.Tab): string | null {
  if (!deskState.reporting || deskState.paused || tab.incognito || !tab.url) return null;
  let url: URL;
  try {
    url = new URL(tab.url);
  } catch {
    return null;
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return null;
  return isExcluded(url.hostname) ? null : url.hostname;
}

function reportTab(tab: chrome.tabs.Tab): void {
  const domain = reportableDomain(tab);
  if (domain) send('ext.tab', { domain, title: tab.title });
}

// Load pairing token from storage
chrome.storage.local.get(['pairingToken'], (result) => {
  if (result.pairingToken) {
    pairingToken = result.pairingToken;
    connectToDesktop();
  }
});

// Listen for messages from content scripts and the popup
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'PAGE_SUMMARY') {
    // Forward page summary to desktop if allowed for this tab
    if (sender.tab && reportableDomain(sender.tab)) {
      send('ext.page_summary', { summary: message.data });
    }
    sendResponse({ success: true });
  } else if (message.type === 'SET_PAIRING_TOKEN') {
    pairingToken = message.token;
    chrome.storage.local.set({ pairingToken });
    ws?.close();
    connectToDesktop();
    sendResponse({ success: true });
  } else if (message.type === 'GET_CONNECTION_STATUS') {
    sendResponse({ connected: desktopConnected, reporting: deskState.reporting });
  }
  return true; // Keep message channel open for async response
});

// Track active tab changes
chrome.tabs.onActivated.addListener((activeInfo) => {
  chrome.tabs.get(activeInfo.tabId, reportTab);
});

// Track tab updates
chrome.tabs.onUpdated.addListener((_tabId, changeInfo, tab) => {
  if (changeInfo.status === 'complete' && tab.active) reportTab(tab);
});

function connectToDesktop() {
  if (!pairingToken) {
    console.log('No pairing token, skipping desktop connection');
    return;
  }

  // Loopback only; the token goes in the first message, never in the URL
  try {
    ws = new WebSocket(`ws://127.0.0.1:${EXTENSION_WS_PORT}`);

    ws.onopen = () => {
      send('ext.hello', { token: pairingToken!, extensionVersion: chrome.runtime.getManifest().version });
    };

    ws.onclose = () => {
      console.log('Disconnected from Wolfie desktop');
      desktopConnected = false;
      deskState = { ...deskState, reporting: false };
      // Retry connection after 5 seconds
      setTimeout(connectToDesktop, 5000);
    };

    ws.onerror = () => {
      desktopConnected = false;
    };

    ws.onmessage = (event) => {
      const parsed = ExtensionMessageSchema.safeParse(safeJson(event.data));
      if (parsed.success) handleDesktopMessage(parsed.data);
      else console.warn('Ignoring invalid desktop message');
    };
  } catch (error) {
    console.error('Failed to connect to desktop:', error);
    desktopConnected = false;
  }
}

function safeJson(data: unknown): unknown {
  try {
    return JSON.parse(String(data));
  } catch {
    return null;
  }
}

function handleDesktopMessage(message: ExtensionMessage) {
  switch (message.type) {
    case 'desk.hello_result':
      desktopConnected = message.payload.ok;
      console.log(message.payload.ok ? 'Connected to Wolfie desktop' : `Pairing rejected: ${message.payload.reason}`);
      break;
    case 'desk.state':
      deskState = message.payload;
      if (deskState.reporting) {
        chrome.tabs.query({ active: true, lastFocusedWindow: true }, ([tab]) => tab && reportTab(tab));
      }
      break;
    case 'desk.request_summary':
      // A5: ask the active tab's content script for a fresh PageSummary
      break;
    default:
      break;
  }
}
