// Content script glue (A5): wires the chrome.runtime messaging to ContentRuntime, which holds all
// the logic. Top frame only; does nothing until the background says this tab may report.
import type { ContentState, RuntimeMessage, TabMessage } from '../lib/messages';
import { ContentRuntime } from './runtime';
import { defaultSummaryDeps } from './summary';
import { isBrightspace, isBrightspaceCoursePage, scrapeBrightspace, scrapeCoursePage } from './brightspace';

console.log('[Wolfie Extension] Content script loaded on:', location.hostname, location.pathname);

if (window === window.top) {
  console.log('[Wolfie Extension] Running in top frame');
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

  // Detect and scrape Brightspace if we're on a Brightspace page
  const loc = { hostname: location.hostname, pathname: location.pathname };
  if (isBrightspace(loc.hostname, loc.pathname)) {
    // Wait for page to be fully loaded
    const tryScrapeBrightspace = async () => {
      // Only scrape on homepage (not course pages) since we fetch all resources via API
      if (!isBrightspaceCoursePage(loc.pathname)) {
        console.log('[Wolfie Extension] Detected Brightspace homepage');
        const data = await scrapeBrightspace(document, loc.pathname);
        if (data && data.courses.length > 0) {
          console.log('[Wolfie Extension] Scraped Brightspace data:', data);
          const message: RuntimeMessage = { type: 'BRIGHTSPACE_DATA', data };
          chrome.runtime.sendMessage(message).catch(() => undefined);
        }
      }
    };

    if (document.readyState === 'complete') {
      // Page already loaded, scrape after a short delay to let JS widgets render
      setTimeout(tryScrapeBrightspace, 2000);
    } else {
      window.addEventListener('load', () => setTimeout(tryScrapeBrightspace, 2000));
    }
  }
}
