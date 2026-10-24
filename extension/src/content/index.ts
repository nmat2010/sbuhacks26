// Content script glue (A5): wires the chrome.runtime messaging to ContentRuntime, which holds all
// the logic. Top frame only; does nothing until the background says this tab may report.
import type { ContentState, RuntimeMessage, TabMessage } from '../lib/messages';
import { ContentRuntime } from './runtime';
import { defaultSummaryDeps } from './summary';

if (window === window.top) {
  const runtime = new ContentRuntime({
    doc: document,
    win: window,
    location: () => ({ href: location.href, hostname: location.hostname, pathname: location.pathname }),
    summaryDeps: defaultSummaryDeps(window),
    send: (message: RuntimeMessage) => {
      chrome.runtime.sendMessage(message).catch(() => undefined); // worker restarting: drop it
    },
    now: () => Date.now(),
    setTimer: (fn, ms) => setTimeout(fn, ms),
    clearTimer: (h) => clearTimeout(h as ReturnType<typeof setTimeout>)
  });

  const message: RuntimeMessage = { type: 'GET_CONTENT_STATE' };
  chrome.runtime
    .sendMessage(message)
    .then((state: ContentState | undefined) => state && runtime.setState(state))
    .catch(() => undefined);

  chrome.runtime.onMessage.addListener((msg: TabMessage) => {
    if (msg.type === 'STATE') runtime.setState({ reporting: msg.reporting, capturePageText: msg.capturePageText });
    else if (msg.type === 'REQUEST_SUMMARY') runtime.requestSummary();
  });
}
