// Background service worker (MV3). A3: reconnect with backoff, keep the worker alive, report only
// while the desktop says `reporting`, honor pause / exclusions / incognito, serve the popup.
// The pure parts live in ../lib and ./connection so they are unit-tested without chrome.*.
import { EXTENSION_WS_PORT } from '@wolfie/shared';
import { BacktrackDetector } from '../lib/backtrack';
import { contentUrlFor, normalizeDomainInput, reportableDomain, type ReportState } from '../lib/report';
import type { ContentState, PopupStatus, RuntimeMessage, TabMessage } from '../lib/messages';
import { DesktopConnection, type DeskStatePayload, type SocketLike } from './connection';

const KEEPALIVE_ALARM = 'wolfie-keepalive';
/** MV3 workers are stopped after ~30 s without activity; traffic every 20 s keeps them alive. */
const HEARTBEAT_MS = 20_000;

let pairingToken: string | null = null;
let localPaused = false;
let localExcluded: string[] = [];
// Report nothing until the desktop says to.
let desk: DeskStatePayload = { reporting: false, paused: false, capturePageText: false, excludedDomains: [] };

const reportState = (): ReportState => ({
  reporting: desk.reporting,
  paused: desk.paused,
  localPaused,
  excludedDomains: desk.excludedDomains,
  localExcludedDomains: localExcluded
});

const conn = new DesktopConnection({
  url: `ws://127.0.0.1:${EXTENSION_WS_PORT}`, // loopback only; the token goes in the first message
  createSocket: (url) => new WebSocket(url) as unknown as SocketLike,
  getToken: () => pairingToken,
  extensionVersion: chrome.runtime.getManifest().version,
  newId: () => crypto.randomUUID(),
  now: () => Date.now(),
  setTimer: (fn, ms) => setTimeout(fn, ms),
  clearTimer: (h) => clearTimeout(h as ReturnType<typeof setTimeout>),
  onDeskState: (state) => {
    const wasReporting = desk.reporting;
    desk = state;
    if (!wasReporting && state.reporting) void reportActiveTab();
    void broadcastContentState();
  },
  onRequestSummary: () => void askActiveTabForSummary(),
  onStatus: () => {
    if (!conn.connected) desk = { ...desk, reporting: false };
    void broadcastContentState();
  }
});

// ---- storage -------------------------------------------------------------------------------

const ready = chrome.storage.local
  .get(['pairingToken', 'localPaused', 'localExcluded'])
  .then((stored) => {
    pairingToken = typeof stored.pairingToken === 'string' && stored.pairingToken ? stored.pairingToken : null;
    localPaused = stored.localPaused === true;
    localExcluded = Array.isArray(stored.localExcluded) ? stored.localExcluded.filter((d) => typeof d === 'string') : [];
    conn.connect();
  });

// ---- reporting -----------------------------------------------------------------------------

async function reportActiveTab(): Promise<void> {
  const [tab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
  if (tab) reportTab(tab);
}

function reportTab(tab: chrome.tabs.Tab): void {
  const domain = reportableDomain(tab, reportState());
  if (!domain) return;
  const contentUrl = contentUrlFor(tab.url);
  conn.send('ext.tab', contentUrl ? { domain, title: tab.title, contentUrl } : { domain, title: tab.title });
}

async function askActiveTabForSummary(): Promise<void> {
  const [tab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
  if (!tab?.id || !reportableDomain(tab, reportState()) || !desk.capturePageText) return;
  const message: TabMessage = { type: 'REQUEST_SUMMARY' };
  chrome.tabs.sendMessage(tab.id, message).catch(() => undefined); // no content script on this page
}

function contentStateFor(tab: { url?: string; incognito?: boolean }): ContentState {
  return { reporting: reportableDomain(tab, reportState()) !== null, capturePageText: desk.capturePageText };
}

/** Tell each tab's content script whether it may report (it sends domain-only when text is off). */
async function broadcastContentState(): Promise<void> {
  const tabs = await chrome.tabs.query({});
  for (const tab of tabs) {
    if (!tab.id) continue;
    const message: TabMessage = { type: 'STATE', ...contentStateFor(tab) };
    chrome.tabs.sendMessage(tab.id, message).catch(() => undefined);
  }
}

chrome.tabs.onActivated.addListener((info) => {
  chrome.tabs.get(info.tabId).then(reportTab, () => undefined);
});
chrome.tabs.onUpdated.addListener((_tabId, changeInfo, tab) => {
  if (changeInfo.status === 'complete' && tab.active) reportTab(tab);
  // URL oscillation (backtracking) is tracked here because page loads destroy content scripts.
  if (changeInfo.url && tab.active) trackNavigation(tab);
});

const backtrack = new BacktrackDetector({
  now: () => Date.now(),
  emit: (signal) => {
    void chrome.tabs.query({ active: true, lastFocusedWindow: true }).then(([tab]) => {
      const domain = tab ? reportableDomain(tab, reportState()) : null;
      if (domain) conn.send('ext.signal', { signal, domain });
    });
  }
});

function trackNavigation(tab: chrome.tabs.Tab): void {
  if (tab.url && reportableDomain(tab, reportState())) backtrack.visit(tab.url);
}

// ---- keep-alive ----------------------------------------------------------------------------

chrome.alarms.create(KEEPALIVE_ALARM, { periodInMinutes: 0.5 });
chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name !== KEEPALIVE_ALARM) return;
  void ready.then(() => {
    conn.connect(); // reconnect if the worker was restarted or the socket died
    if (desk.reporting) void reportActiveTab();
  });
});
// While the worker is alive, re-report the active tab so the socket is never idle for 30 s.
setInterval(() => {
  if (conn.connected && desk.reporting) void reportActiveTab();
}, HEARTBEAT_MS);

// ---- messages from the content script and popup --------------------------------------------

function status(): PopupStatus {
  return {
    connected: conn.connected,
    reporting: desk.reporting,
    deskPaused: desk.paused,
    localPaused,
    hasToken: pairingToken !== null,
    deskExcluded: desk.excludedDomains,
    localExcluded
  };
}

async function handle(message: RuntimeMessage, sender: chrome.runtime.MessageSender): Promise<unknown> {
  await ready;
  switch (message.type) {
    case 'PAGE_SUMMARY': {
      const tab = sender.tab;
      const domain = tab ? reportableDomain(tab, reportState()) : null;
      // Domain-only mode: never forward page text. Also require the summary to match the tab.
      if (domain && desk.capturePageText && message.data.domain.toLowerCase() === domain) {
        conn.send('ext.page_summary', { summary: message.data });
      }
      return { success: true };
    }
    case 'SIGNAL': {
      const domain = sender.tab ? reportableDomain(sender.tab, reportState()) : null;
      if (domain) conn.send('ext.signal', { signal: message.signal, domain });
      return { success: true };
    }
    case 'GET_CONTENT_STATE':
      return sender.tab ? contentStateFor(sender.tab) : { reporting: false, capturePageText: false };
    case 'GET_STATUS':
      return status();
    case 'SET_PAIRING_TOKEN': {
      pairingToken = message.token.trim() || null;
      await chrome.storage.local.set({ pairingToken });
      if (pairingToken) conn.restart();
      else conn.disconnect();
      return status();
    }
    case 'SET_LOCAL_PAUSED':
      localPaused = message.paused;
      await chrome.storage.local.set({ localPaused });
      void broadcastContentState();
      return status();
    case 'SET_LOCAL_EXCLUDED': {
      localExcluded = [...new Set(message.domains.map(normalizeDomainInput).filter((d): d is string => d !== null))];
      await chrome.storage.local.set({ localExcluded });
      void broadcastContentState();
      return status();
    }
    default:
      return undefined;
  }
}

chrome.runtime.onMessage.addListener((message: RuntimeMessage, sender, sendResponse) => {
  handle(message, sender).then(sendResponse, () => sendResponse(undefined));
  return true; // async response
});
