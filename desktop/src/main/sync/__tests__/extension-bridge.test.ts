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

describe('stale tab reports (review fix)', () => {
  it('an excluded tab or ext.tab_none clears the previous domain', () => {
    const { tracker, bridge } = make();
    bridge.handlers.onTab({ domain: 'arxiv.org', title: 'Attention', contentUrl: 'https://arxiv.org/abs/1706.03762' });
    bridge.handlers.onTab({ domain: 'secure.chase.com', title: 'Chase' });
    expect(tracker.getDomain()).toBeNull();
    expect(tracker.getContentUrl()).toBeNull();
    bridge.handlers.onTab({ domain: 'arxiv.org', title: 'Attention' });
    bridge.handlers.onTabNone?.();
    expect(tracker.getDomain()).toBeNull();
  });

  it('accepts m./www. YouTube hosts and youtu.be for the content URL', () => {
    const { tracker, bridge } = make();
    bridge.handlers.onTab({ domain: 'm.youtube.com', contentUrl: 'https://www.youtube.com/watch?v=abcdef123' });
    expect(tracker.getContentUrl()).toBe('https://www.youtube.com/watch?v=abcdef123');
    bridge.handlers.onTab({ domain: 'youtu.be', contentUrl: 'https://www.youtube.com/watch?v=abcdef123' });
    expect(tracker.getContentUrl()).toBe('https://www.youtube.com/watch?v=abcdef123');
  });
});

describe('DomainTracker.matchesWindow', () => {
  it('trusts a fresh report whose tab title matches the window', () => {
    let now = 1_000;
    const tracker = new DomainTracker(() => now);
    tracker.set('arxiv.org', 'Attention Is All You Need');
    expect(tracker.matchesWindow('Attention Is All You Need', now)).toBe(true);
    expect(tracker.matchesWindow('Attention Is All You Need - Work', now)).toBe(true); // profile suffix
    expect(tracker.matchesWindow(null, now)).toBe(false); // titles off: fail closed
    expect(tracker.matchesWindow('Chase - Accounts', now)).toBe(false); // another tab or browser
    now += 46_000;
    expect(tracker.matchesWindow('Attention Is All You Need', now)).toBe(false); // stale
    tracker.clear();
    expect(tracker.matchesWindow('Attention Is All You Need', now)).toBe(false);
  });
});

describe('DomainTracker.matchesWindow strictness (re-review)', () => {
  it('a short tab title does not match a different page that merely contains it', () => {
    const tracker = new DomainTracker(() => 0);
    tracker.set('www.google.com', 'Google');
    expect(tracker.matchesWindow('Google', 0)).toBe(true);
    expect(tracker.matchesWindow('Google Search – chase', 0)).toBe(false);
    expect(tracker.matchesWindow('New Tab', 0)).toBe(false);
  });

  it('ignores an unread-count prefix on either side', () => {
    const tracker = new DomainTracker(() => 0);
    tracker.set('www.youtube.com', '(3) Attention explained - YouTube');
    expect(tracker.matchesWindow('Attention explained - YouTube', 0)).toBe(true);
    expect(tracker.matchesWindow('(4) Attention explained - YouTube', 0)).toBe(true);
  });

  it('a delayed clear is skipped when a newer report arrived', () => {
    let t = 0;
    const tracker = new DomainTracker(() => t);
    tracker.set('arxiv.org', 'Paper');
    const at = tracker.getReportedAt();
    t = 1000;
    tracker.set('arxiv.org', 'Paper');
    tracker.clearIfUnchanged(at);
    expect(tracker.getDomain()).toBe('arxiv.org');
    tracker.clearIfUnchanged(tracker.getReportedAt());
    expect(tracker.getDomain()).toBeNull();
  });
});

describe('ext.tab_none with a scheduler (focus moved to Wolfie)', () => {
  it('hands the clear to the scheduler, which can skip it', () => {
    const tracker = new DomainTracker();
    const scheduled: Array<() => void> = [];
    const bridge = createExtensionBridge({
      tracker,
      getDeskState: () => state,
      setLatestPageSummary: () => {},
      emitProblemChanged: () => {},
      scheduleTabNone: (clear) => void scheduled.push(clear)
    });
    bridge.handlers.onTab({ domain: 'arxiv.org', title: 'Paper' });
    bridge.handlers.onTabNone?.();
    expect(tracker.getDomain()).toBe('arxiv.org'); // not yet
    scheduled[0]();
    expect(tracker.getDomain()).toBeNull();
  });
});
