import { describe, expect, it } from 'vitest';
import { reconnectDelay } from '../backoff';
import { contentUrlFor, isExcluded, normalizeDomainInput, reportableDomain, type ReportState } from '../report';

const base: ReportState = {
  reporting: true,
  paused: false,
  localPaused: false,
  excludedDomains: ['chase.com', 'mail.google.com'],
  localExcludedDomains: []
};
const tab = (url: string, incognito = false) => ({ url, incognito });

describe('reportableDomain', () => {
  it('reports the hostname of a normal tab', () => {
    expect(reportableDomain(tab('https://www.YouTube.com/watch?v=1'), base)).toBe('www.youtube.com');
    expect(reportableDomain(tab('http://localhost:5174/algebra.html'), base)).toBe('localhost');
  });

  it('reports nothing for excluded domains, including subdomains, but not lookalikes', () => {
    expect(reportableDomain(tab('https://chase.com/'), base)).toBeNull();
    expect(reportableDomain(tab('https://secure.chase.com/accounts'), base)).toBeNull();
    expect(reportableDomain(tab('https://mail.google.com/mail/u/0'), base)).toBeNull();
    expect(reportableDomain(tab('https://notchase.com/'), base)).toBe('notchase.com');
    expect(reportableDomain(tab('https://docs.google.com/'), base)).toBe('docs.google.com');
  });

  it('reports nothing in incognito', () => {
    expect(reportableDomain(tab('https://youtube.com/', true), base)).toBeNull();
  });

  it('honors the popup exclusions', () => {
    const state = { ...base, localExcludedDomains: ['reddit.com'] };
    expect(reportableDomain(tab('https://old.reddit.com/r/x'), state)).toBeNull();
    expect(reportableDomain(tab('https://youtube.com'), state)).toBe('youtube.com');
  });

  it('reports nothing unless the desktop says reporting, and honors both pauses', () => {
    expect(reportableDomain(tab('https://youtube.com'), { ...base, reporting: false })).toBeNull();
    expect(reportableDomain(tab('https://youtube.com'), { ...base, paused: true })).toBeNull();
    expect(reportableDomain(tab('https://youtube.com'), { ...base, localPaused: true })).toBeNull();
  });

  it('reports nothing for non-web or malformed URLs', () => {
    expect(reportableDomain({ url: undefined }, base)).toBeNull();
    expect(reportableDomain(tab('chrome://extensions'), base)).toBeNull();
    expect(reportableDomain(tab('file:///Users/me/a.html'), base)).toBeNull();
    expect(reportableDomain(tab('about:blank'), base)).toBeNull();
    expect(reportableDomain(tab('not a url'), base)).toBeNull();
  });
});

describe('helpers', () => {
  it('isExcluded ignores blank entries and case', () => {
    expect(isExcluded('A.Chase.com', ['CHASE.com'])).toBe(true);
    expect(isExcluded('anything.com', ['', '  '])).toBe(false);
  });

  it('normalizes user-entered domains', () => {
    expect(normalizeDomainInput(' https://www.Example.com:8080/a/b?c#d ')).toBe('www.example.com');
    expect(normalizeDomainInput('example.com')).toBe('example.com');
    expect(normalizeDomainInput('')).toBeNull();
    expect(normalizeDomainInput('not a domain')).toBeNull();
    expect(normalizeDomainInput('<script>')).toBeNull();
  });

  it('backs off 1 s, 2 s, 4 s ... up to 30 s', () => {
    const none = () => 0;
    expect([0, 1, 2, 3, 4, 5, 6, 10].map((n) => reconnectDelay(n, none))).toEqual([
      1000, 2000, 4000, 8000, 16000, 30000, 30000, 30000
    ]);
    expect(reconnectDelay(0, () => 1)).toBe(1200);
  });
});

describe('contentUrlFor (Watch mode)', () => {
  it('sends the URL only for papers and videos', () => {
    expect(contentUrlFor('https://example.edu/papers/niranjan.pdf?token=secret')).toBe('https://example.edu/papers/niranjan.pdf');
    expect(contentUrlFor('https://arxiv.org/abs/1706.03762v7')).toBe('https://arxiv.org/abs/1706.03762v7');
    expect(contentUrlFor('https://arxiv.org/pdf/1706.03762')).toBe('https://arxiv.org/pdf/1706.03762');
    expect(contentUrlFor('https://www.youtube.com/watch?v=aircAruvnKk&t=42s&list=abc')).toBe('https://www.youtube.com/watch?v=aircAruvnKk');
    expect(contentUrlFor('https://youtu.be/aircAruvnKk')).toBe('https://www.youtube.com/watch?v=aircAruvnKk');
  });

  it('sends nothing for other pages or odd URLs', () => {
    expect(contentUrlFor('https://mail.google.com/mail/u/0/#inbox')).toBeNull();
    expect(contentUrlFor('https://www.youtube.com/results?search_query=attention')).toBeNull();
    expect(contentUrlFor('https://arxiv.org/list/cs.LG/recent')).toBeNull();
    expect(contentUrlFor('file:///Users/me/paper.pdf')).toBeNull();
    expect(contentUrlFor('https://www.youtube.com/watch?v=<script>')).toBeNull();
    expect(contentUrlFor(undefined)).toBeNull();
    expect(contentUrlFor('not a url')).toBeNull();
  });
});

describe('contentUrlFor YouTube variants', () => {
  it('normalizes mobile, shorts and live URLs to a watch URL', () => {
    expect(contentUrlFor('https://m.youtube.com/watch?v=aircAruvnKk')).toBe('https://www.youtube.com/watch?v=aircAruvnKk');
    expect(contentUrlFor('https://www.youtube.com/shorts/aircAruvnKk')).toBe('https://www.youtube.com/watch?v=aircAruvnKk');
    expect(contentUrlFor('https://youtube.com/live/aircAruvnKk?feature=share')).toBe('https://www.youtube.com/watch?v=aircAruvnKk');
    expect(contentUrlFor('https://www.youtube.com/@3blue1brown')).toBeNull();
  });
});
