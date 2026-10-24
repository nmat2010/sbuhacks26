import { describe, expect, it } from 'vitest';
import { createExtensionBridge } from '../extension-bridge.js';
import { DomainTracker } from '../domain-tracker.js';
import type { DeskState } from '../desk-state.js';

const state: DeskState = { reporting: true, paused: false, capturePageText: true, excludedDomains: ['chase.com'] };

function make() {
  const tracker = new DomainTracker();
  const bridge = createExtensionBridge({
    tracker,
    getDeskState: () => state,
    setLatestPageSummary: () => {},
    emitProblemChanged: () => {}
  });
  return { tracker, bridge };
}

describe('extension bridge: content URLs (Watch mode)', () => {
  it('keeps a paper or video URL that belongs to the reported domain', () => {
    const { tracker, bridge } = make();
    bridge.handlers.onTab({ domain: 'www.youtube.com', title: 'Attention', contentUrl: 'https://www.youtube.com/watch?v=abcdef123' });
    expect(tracker.getContentUrl()).toBe('https://www.youtube.com/watch?v=abcdef123');
  });

  it('drops a content URL for a different host', () => {
    const { tracker, bridge } = make();
    bridge.handlers.onTab({ domain: 'example.edu', contentUrl: 'https://evil.example.com/x.pdf' });
    expect(tracker.getDomain()).toBe('example.edu');
    expect(tracker.getContentUrl()).toBeNull();
  });

  it('a later tab without a content URL clears it, and so does clearContext', () => {
    const { tracker, bridge } = make();
    bridge.handlers.onTab({ domain: 'example.edu', contentUrl: 'https://example.edu/a.pdf' });
    bridge.handlers.onTab({ domain: 'example.edu', title: 'Home' });
    expect(tracker.getContentUrl()).toBeNull();
    bridge.handlers.onTab({ domain: 'example.edu', contentUrl: 'https://example.edu/a.pdf' });
    bridge.clearContext();
    expect(tracker.getContentUrl()).toBeNull();
  });

  it('excluded domains report nothing, content URL included', () => {
    const { tracker, bridge } = make();
    bridge.handlers.onTab({ domain: 'secure.chase.com', contentUrl: 'https://secure.chase.com/statement.pdf' });
    expect(tracker.getDomain()).toBeNull();
    expect(tracker.getContentUrl()).toBeNull();
  });
});
