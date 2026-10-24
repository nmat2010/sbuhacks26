// Popup script: connection status, pairing token, pause toggle, excluded sites.
import type { PopupStatus, RuntimeMessage } from '../lib/messages';
import { mountPopup, type PopupApi } from './view';

const send = (message: RuntimeMessage) => chrome.runtime.sendMessage(message) as Promise<PopupStatus>;

const api: PopupApi = {
  getStatus: () => send({ type: 'GET_STATUS' }),
  setToken: (token) => send({ type: 'SET_PAIRING_TOKEN', token }),
  setPaused: (paused) => send({ type: 'SET_LOCAL_PAUSED', paused }),
  setExcluded: (domains) => send({ type: 'SET_LOCAL_EXCLUDED', domains })
};

document.addEventListener('DOMContentLoaded', () => {
  const popup = mountPopup(document, api);
  void popup.refresh();
  // The handshake finishes shortly after a token is saved; keep the status fresh while open.
  setInterval(() => void popup.refresh(), 1500);
});
