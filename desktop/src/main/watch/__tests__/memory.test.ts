import { describe, expect, it } from 'vitest';
import { SessionMemory } from '../memory.js';
import { obs } from './helpers.js';

const ctx = (ts: number, over: Partial<{ contentUrl: string | null; windowTitle: string | null; elapsedMs: number }> = {}) => ({
  ts,
  appName: 'Google Chrome',
  windowTitle: 'paper.pdf',
  contentUrl: 'https://example.edu/paper.pdf',
  elapsedMs: 8000,
  ...over
});

describe('SessionMemory', () => {
  it('groups observations by source and keeps points, locators and time', () => {
    const m = new SessionMemory();
    m.record(obs(), ctx(1000, { elapsedMs: 0 }));
    m.record(obs({ source: { kind: 'paper', title: 'Niranjan et al. 2026', locator: '§4' }, key_points: ['The mask is per head'] }), ctx(9000));
    const [paper] = m.listSources();
    expect(m.listSources()).toHaveLength(1);
    expect(paper.locators).toEqual(['§3.2', '§4']);
    expect(paper.points).toEqual(['Attention scores are gated by a learned sparsity mask', 'The mask is per head']);
    expect(paper.seconds).toBe(8);
  });

  it('keeps videos separate and lists them newest first', () => {
    const m = new SessionMemory();
    m.record(obs(), ctx(1000));
    m.record(
      obs({ activity: 'watching_video', source: { kind: 'video', title: 'Attention explained', locator: '4:10' } }),
      ctx(2000, { contentUrl: 'https://www.youtube.com/watch?v=abcdef123', windowTitle: 'Attention explained - YouTube' })
    );
    expect(m.videos().map((v) => v.url)).toEqual(['https://www.youtube.com/watch?v=abcdef123']);
    expect(m.latest()?.source?.kind).toBe('video');
  });

  it('attaches an imported paper by URL and exposes its id', () => {
    const m = new SessionMemory();
    m.record(obs(), ctx(1000));
    m.attachPaper('https://example.edu/paper.pdf', 'p1', 'Sparse Gated Attention');
    expect(m.paperIds()).toEqual(['p1']);
    expect(m.listSources()[0].title).toBe('Sparse Gated Attention');
  });

  it('renders prompt text within the budget, newest last', () => {
    const m = new SessionMemory();
    for (let i = 0; i < 40; i++) m.record(obs({ summary: `step ${i} ${'x'.repeat(80)}` }), ctx(1000 + i * 8000, { contentUrl: null }));
    const text = m.toPromptText(1500, 1000 + 40 * 8000);
    expect(text.length).toBeLessThanOrEqual(1500);
    expect(text).toContain('step 39');
  });

  it('a long session fits: back-to-back looks at one source are one line, older sources are kept', () => {
    const m = new SessionMemory();
    const MIN = 60_000;
    // 30 min on a paper, 10 min on a video, then 20 min back on the paper: 360 looks at 10 s
    let t = 0;
    const look = (minutes: number, over: Parameters<typeof obs>[0], url: string) => {
      for (const end = t + minutes * MIN; t < end; t += 10_000) m.record(obs({ ...over, summary: `${over?.subject} at ${Math.round(t / MIN)}` }), ctx(t, { contentUrl: url }));
    };
    look(30, { subject: 'paper' }, 'https://example.edu/paper.pdf');
    look(10, { subject: 'video', activity: 'watching_video', source: { kind: 'video', title: 'PCA', locator: null } }, 'https://www.youtube.com/watch?v=HMOI_lkzW08');
    look(20, { subject: 'paper' }, 'https://example.edu/paper.pdf');
    const text = m.toPromptText(9000, t);
    expect(text).toContain('[video] PCA');
    const timeline = text.split('Recent activity:')[1].trim().split('\n');
    expect(timeline).toEqual([
      '- 60 min ago until 30 min ago: paper at 30',
      '- 30 min ago until 20 min ago: video at 40',
      '- 20 min ago until just now: paper at 60'
    ]);
  });

  it('clear() forgets everything', () => {
    const m = new SessionMemory();
    m.record(obs(), ctx(1000));
    m.clear();
    expect(m.isEmpty()).toBe(true);
    expect(m.latest()).toBeNull();
    expect(m.toPromptText()).toBe('');
  });
});

describe('SessionMemory: paper imported before its first observation', () => {
  it('attaches the paper when the source is first recorded', () => {
    const m = new SessionMemory();
    m.attachPaper('https://example.edu/paper.pdf', 'p9', 'Already-read paper');
    m.record(obs(), ctx(1000));
    expect(m.paperIds()).toEqual(['p9']);
    expect(m.listSources()[0].title).toBe('Already-read paper');
  });

  it('keeps the header and the newest sources when the budget is tight', () => {
    const m = new SessionMemory();
    for (let i = 0; i < 8; i++) {
      m.record(
        obs({ source: { kind: 'paper', title: `Paper ${i}`, locator: null }, key_points: ['p'.repeat(200)] }),
        ctx(1000 + i * 1000, { contentUrl: `https://example.edu/${i}.pdf` })
      );
    }
    const text = m.toPromptText(900, 20_000);
    expect(text.startsWith('Sources this session')).toBe(true);
    expect(text).toContain('Paper 7');
    expect(text.length).toBeLessThanOrEqual(900);
  });
});
