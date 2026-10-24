import type { PageSummary, StruggleSignal } from '@wolfie/shared';

// chrome.runtime messages between the content script, popup and background worker.

export interface PopupStatus {
  connected: boolean;
  /** Desktop says to report right now. */
  reporting: boolean;
  /** Desktop paused monitoring. */
  deskPaused: boolean;
  localPaused: boolean;
  hasToken: boolean;
  /** Excluded by the desktop's settings (edit them in Wolfie). */
  deskExcluded: string[];
  /** Added in this popup. */
  localExcluded: string[];
}

export type ContentState = { reporting: boolean; capturePageText: boolean };

export type RuntimeMessage =
  | { type: 'PAGE_SUMMARY'; data: PageSummary }
  | { type: 'SIGNAL'; signal: StruggleSignal }
  | { type: 'GET_CONTENT_STATE' }
  | { type: 'GET_STATUS' }
  | { type: 'SET_PAIRING_TOKEN'; token: string }
  | { type: 'SET_LOCAL_PAUSED'; paused: boolean }
  | { type: 'SET_LOCAL_EXCLUDED'; domains: string[] };

/** background -> content script */
export type TabMessage = { type: 'REQUEST_SUMMARY' } | ({ type: 'STATE' } & ContentState);
