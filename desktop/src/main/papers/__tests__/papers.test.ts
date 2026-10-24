import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type Database from 'better-sqlite3';
import { openDatabase } from '../../db/index.js';
import { LLMClient } from '../../llm/client.js';
import { MockLLMProvider } from '../../llm/mock-provider.js';
import type { LLMProvider } from '../../llm/provider.js';
import { PlanStore } from '../../plan/store.js';
import { ArxivClient, arxivIdFromUrl, parseAtom } from '../arxiv.js';
import { DemoCatalogSearcher } from '../demo-catalog.js';
import { createSearchers } from '../index.js';
import { SemanticScholarClient } from '../semantic-scholar.js';
import { IdeasService, PapersService } from '../service.js';
import { PapersStore } from '../store.js';
import { normalizeTitle, titlesMatch, type HttpGet, type PaperRecord } from '../types.js';
import { MemoryVerifyCache, PaperVerifier, SqliteVerifyCache } from '../verify.js';

const ATOM = `<?xml version="1.0" encoding="UTF-8"?>
<feed xmlns="http://www.w3.org/2005/Atom">
  <title>ArXiv Query</title>
  <entry>
    <id>http://arxiv.org/abs/1706.03762v7</id>
    <published>2017-06-12T17:57:34Z</published>
    <title>Attention Is All
  You Need</title>
    <summary>The dominant sequence transduction models...</summary>
    <author><name>Ashish Vaswani</name></author>
    <author><name>Noam Shazeer</name></author>
  </entry>
  <entry>
    <id>http://arxiv.org/abs/2001.00001v1</id>
    <published>2020-01-01T00:00:00Z</published>
    <title>R&amp;D on Attention: A Survey</title>
    <author><name>Jane Q. Public</name></author>
  </entry>
</feed>`;
const EMPTY_FEED = '<?xml version="1.0"?><feed xmlns="http://www.w3.org/2005/Atom"><title>none</title></feed>';

const rec = (title: string, source: PaperRecord['source'] = 'arxiv'): PaperRecord => ({
  title,
  authors: ['A. Author'],
  year: 2020,
  url: `https://arxiv.org/abs/${normalizeTitle(title).replace(/ /g, '-')}`,
  arxivId: 'x',
  source
});

/** Fake HTTP: routes by substring of the URL, records every call. */
function fakeHttp(routes: Array<[string, () => { status: number; text: string } | Error]>) {
  const calls: Array<{ url: string; headers?: Record<string, string>; at: number }> = [];
  let clock = 0;
  const http: HttpGet = async (url, headers) => {
    calls.push({ url, headers, at: clock });
    const route = routes.find(([needle]) => url.includes(needle));
    if (!route) throw new Error('no route');
    const out = route[1]();
    if (out instanceof Error) throw out;
    return out;
  };
  return { http, calls, setClock: (t: number) => (clock = t) };
}

describe('title matching', () => {
  it('normalizes case, punctuation and accents', () => {
    expect(normalizeTitle('  Attention—Is All You Need!  ')).toBe('attention is all you need');
    expect(titlesMatch('attention is all you need', 'Attention Is All You Need')).toBe(true);
    expect(titlesMatch('Café Net: A Study', 'cafe net a study')).toBe(true);
  });
  it('accepts a dropped subtitle only for long titles', () => {
    expect(titlesMatch('Deep Residual Learning', 'Deep Residual Learning: A Survey of Everything')).toBe(true);
    expect(titlesMatch('Attention', 'Attention Is All You Need')).toBe(false);
    expect(titlesMatch('Graph Networks', 'Graphs')).toBe(false);
  });
});

describe('arXiv client', () => {
  it('parses the Atom feed (multi-line titles, entities, authors, ids)', () => {
    const [a, b] = parseAtom(ATOM);
    expect(a).toMatchObject({ title: 'Attention Is All You Need', authors: ['Ashish Vaswani', 'Noam Shazeer'], year: 2017, arxivId: '1706.03762', url: 'https://arxiv.org/abs/1706.03762' });
    expect(b.title).toBe('R&D on Attention: A Survey');
    expect(parseAtom(EMPTY_FEED)).toEqual([]);
    expect(arxivIdFromUrl('http://arxiv.org/abs/hep-th/9901001v1')).toBe('hep-th/9901001');
  });

  it('queries by title and spaces requests at least 3 s apart, even when callers overlap', async () => {
    const { http, calls } = fakeHttp([['export.arxiv.org', () => ({ status: 200, text: ATOM })]]);
    let now = 10_000;
    const sleeps: number[] = [];
    const client = new ArxivClient({
      http,
      now: () => now,
      sleep: async (ms) => {
        sleeps.push(ms);
        now += ms;
      }
    });
    const [r1] = await Promise.all([client.searchByTitle('Attention: Is All You Need!'), client.searchByTitle('Another title')]);
    expect(r1).toHaveLength(2);
    expect(calls).toHaveLength(2);
    expect(decodeURIComponent(calls[0].url)).toContain('search_query=ti:"attention is all you need"');
    expect(calls[0].url).toContain('max_results=5');
    expect(sleeps).toEqual([3000]); // the first goes out at once, the second waits
  });

  it('reports HTTP failures and network errors as unavailable', async () => {
    const down = new ArxivClient({ http: fakeHttp([['arxiv', () => ({ status: 503, text: '' })]]).http, sleep: async () => undefined });
    await expect(down.searchByTitle('x y')).rejects.toThrow(/HTTP 503/);
    const net = new ArxivClient({ http: fakeHttp([['arxiv', () => new Error('offline')]]).http, sleep: async () => undefined });
    await expect(net.searchByTitle('x y')).rejects.toThrow(/offline/);
  });
});

describe('Semantic Scholar client', () => {
  const body = JSON.stringify({
    data: [
      { title: 'Adam: A Method for Stochastic Optimization', year: 2014, authors: [{ name: 'Diederik Kingma' }], externalIds: { ArXiv: '1412.6980' }, url: 'https://www.semanticscholar.org/paper/abc' },
      { title: 'Some Journal Paper', year: 2010, authors: [], externalIds: { DOI: '10.1/xyz' } },
      { title: 'No links', year: 2001 }
    ]
  });

  it('maps results to links (arXiv, then DOI) and sends the optional key', async () => {
    const { http, calls } = fakeHttp([['semanticscholar', () => ({ status: 200, text: body })]]);
    const client = new SemanticScholarClient({ http, apiKey: 'S2KEY', sleep: async () => undefined });
    const results = await client.searchByTitle('adam');
    expect(results.map((r) => r.url)).toEqual(['https://arxiv.org/abs/1412.6980', 'https://doi.org/10.1/xyz']);
    expect(results[0]).toMatchObject({ authors: ['Diederik Kingma'], year: 2014, source: 'semantic_scholar' });
    expect(calls[0].headers).toEqual({ 'x-api-key': 'S2KEY' });
  });

  it('retries once after a 429, then reports unavailable', async () => {
    let n = 0;
    const flaky = fakeHttp([['semanticscholar', () => (++n === 1 ? { status: 429, text: '' } : { status: 200, text: body })]]);
    const ok = new SemanticScholarClient({ http: flaky.http, sleep: async () => undefined });
    expect(await ok.searchByTitle('adam')).toHaveLength(2);
    expect(flaky.calls).toHaveLength(2);

    const limited = fakeHttp([['semanticscholar', () => ({ status: 429, text: '' })]]);
    const bad = new SemanticScholarClient({ http: limited.http, sleep: async () => undefined });
    await expect(bad.searchByTitle('adam')).rejects.toThrow(/rate limiting/);
    expect(limited.calls).toHaveLength(2);
  });
});

describe('PaperVerifier', () => {
  const searcher = (name: PaperRecord['source'], impl: (t: string) => Promise<PaperRecord[]>) => ({ name, searchByTitle: impl });

  it('verifies via arXiv, falls back to Semantic Scholar, and drops what neither knows', async () => {
    const arxiv = searcher('arxiv', async (t) => (t.toLowerCase().startsWith('real') ? [rec('Real Paper One')] : []));
    const s2 = searcher('semantic_scholar', async (t) => (t.toLowerCase().startsWith('only s2') ? [rec('Only S2 Knows This', 'semantic_scholar')] : []));
    const v = new PaperVerifier([arxiv, s2]);
    expect(await v.verify({ title: 'real paper one' })).toMatchObject({ status: 'verified', paper: { source: 'arxiv' } });
    expect(await v.verify({ title: 'Only S2 Knows This' })).toMatchObject({ status: 'verified', paper: { source: 'semantic_scholar' } });
    expect(await v.verify({ title: 'Invented By A Model' })).toEqual({ status: 'not_found' });
  });

  it('a different paper with a similar title is not a match', async () => {
    const v = new PaperVerifier([searcher('arxiv', async () => [rec('Attention Mechanisms in Biology')])]);
    expect((await v.verify({ title: 'Attention Is All You Need' })).status).toBe('not_found');
  });

  it('tells "could not check" from "not found", and only caches answers', async () => {
    let up = false;
    let calls = 0;
    const flaky = searcher('arxiv', async () => {
      calls++;
      if (!up) throw new Error('offline');
      return [];
    });
    const v = new PaperVerifier([flaky]);
    expect((await v.verify({ title: 'Some Title Here' })).status).toBe('unavailable');
    expect((await v.verify({ title: 'Some Title Here' })).status).toBe('unavailable');
    expect(calls).toBe(2); // not cached
    up = true;
    expect((await v.verify({ title: 'Some Title Here' })).status).toBe('not_found');
    expect((await v.verify({ title: 'some title here' })).status).toBe('not_found');
    expect(calls).toBe(3); // the negative answer is cached
  });

  it('caches hits (memory and SQLite), and expires negatives after a day', async () => {
    let now = 1_000_000;
    let calls = 0;
    const s = searcher('arxiv', async (t) => {
      calls++;
      return t === 'Known Paper' ? [rec('Known Paper')] : [];
    });
    const v = new PaperVerifier([s], new MemoryVerifyCache(), () => now);
    await v.verify({ title: 'Known Paper' });
    await v.verify({ title: 'KNOWN PAPER' });
    expect(calls).toBe(1);
    await v.verify({ title: 'Missing Paper' });
    await v.verify({ title: 'Missing Paper' });
    expect(calls).toBe(2);
    now += 25 * 3600_000;
    await v.verify({ title: 'Missing Paper' });
    expect(calls).toBe(3);

    const db = openDatabase(':memory:');
    const sql = new SqliteVerifyCache(() => db);
    const v2 = new PaperVerifier([s], sql, () => now);
    await v2.verify({ title: 'Known Paper' });
    const v3 = new PaperVerifier([searcher('arxiv', async () => { throw new Error('should not be called'); })], sql, () => now);
    expect((await v3.verify({ title: 'Known Paper' })).status).toBe('verified');
    db.close();
  });

  it('verifyMany checks one at a time, skips repeats, stops at the limit and counts drops', async () => {
    let active = 0;
    let maxActive = 0;
    const order: string[] = [];
    const s = searcher('arxiv', async (t) => {
      active++;
      maxActive = Math.max(maxActive, active);
      order.push(t);
      await new Promise((r) => setTimeout(r, 2));
      active--;
      return t.startsWith('Fake') ? [] : [rec(t)];
    });
    const v = new PaperVerifier([s]);
    const titles = ['Paper A', 'Fake One', 'Paper B', 'paper a', 'Paper C', 'Fake Two', 'Paper D', 'Paper E', 'Paper F', 'Paper G'];
    const res = await v.verifyMany(titles.map((title) => ({ title })), 5);
    expect(maxActive).toBe(1);
    expect(res.verified.map((x) => x.paper.title)).toEqual(['Paper A', 'Paper B', 'Paper C', 'Paper D', 'Paper E']);
    expect(res.dropped).toBe(2);
    expect(order).not.toContain('paper a');
    expect(order).not.toContain('Paper F'); // stopped once five were verified
  });
});

describe('ideas and reading list (HTTP mocked)', () => {
  let db: Database.Database;
  beforeEach(() => {
    db = openDatabase(':memory:');
  });
  afterEach(() => {
    db.close();
  });

  const ideas = Array.from({ length: 3 }, (_, i) => ({ title: `Idea ${i}`, scope: 's', skills: ['x'], first_week_task: 't' }));
  const modelPapers = [
    { title: 'Attention Is All You Need', authors: ['A. Vaswani'], year: 2017, why: 'Foundational.' },
    { title: 'A Totally Invented Study of Imaginary Things', authors: ['N. Existent'], year: 2022, why: 'Sounds relevant.' },
    { title: 'Adam: A Method for Stochastic Optimization', authors: ['D. Kingma'], year: 2014, why: 'Everyone uses it.' }
  ];
  const llmWith = (reading_list: unknown): LLMProvider => ({ name: 'fake', countsTowardCap: false, generateJson: async () => ({ ideas, reading_list }) });

  function setup(provider: LLMProvider, http: HttpGet) {
    const plan = new PlanStore(() => db);
    const papers = new PapersStore(() => db);
    const verifier = new PaperVerifier([new ArxivClient({ http, sleep: async () => undefined }), new SemanticScholarClient({ http, sleep: async () => undefined })]);
    const logs: string[] = [];
    const client = new LLMClient({ provider, retryDelayMs: 1, log: () => {} });
    const service = new IdeasService({ plan, papers, verifier, llm: () => client, log: (t) => void logs.push(t) });
    db.prepare("INSERT OR IGNORE INTO goals (id, title, type, target_date, status) VALUES ('g1', 'Join a lab', 'research', NULL, 'active')").run();
    db.prepare("INSERT OR IGNORE INTO goals (id, title, type, target_date, status) VALUES ('g2', 'Ace the exam', 'course', NULL, 'active')").run();
    return { service, logs };
  }

  it('keeps only papers a search API returns, with API metadata and the verified link', async () => {
    const http = fakeHttp([
      ['export.arxiv.org', () => ({ status: 200, text: ATOM })], // knows "Attention Is All You Need" only
      ['semanticscholar.org', () => ({ status: 200, text: JSON.stringify({ data: [] }) })]
    ]).http;
    const { service } = setup(llmWith(modelPapers), http);
    const res = await service.suggest('g1');
    expect(res.success).toBe(true);
    const data = res.data!;
    expect(data.ideas).toHaveLength(3);
    expect(data.ideas[0]).toMatchObject({ title: 'Idea 0', firstWeekTask: 't' });
    expect(data.papers.map((p) => p.title)).toEqual(['Attention Is All You Need']);
    expect(data.papers[0]).toMatchObject({ url: 'https://arxiv.org/abs/1706.03762', source: 'arxiv', why: 'Foundational.', year: 2017 });
    expect(data.dropped).toBe(2);
    expect(data.verificationUnavailable).toBe(false);
  });

  it('shows at most five papers', async () => {
    const many = Array.from({ length: 8 }, (_, i) => ({ title: `Paper Number ${i}`, authors: [], year: 2020, why: 'w' }));
    const http: HttpGet = async (url) => {
      const q = decodeURIComponent(url);
      const m = /Paper Number (\d)|paper number (\d)/i.exec(q);
      const n = m?.[1] ?? m?.[2] ?? '0';
      const text = `<feed><entry><id>http://arxiv.org/abs/2001.0000${n}v1</id><published>2020-01-01T00:00:00Z</published><title>Paper Number ${n}</title><author><name>X</name></author></entry></feed>`;
      return { status: 200, text };
    };
    const { service } = setup(llmWith(many), http);
    expect((await service.suggest('g1')).data!.papers).toHaveLength(5);
  });

  it('reports "could not verify" instead of an empty list when the services are unreachable', async () => {
    const http: HttpGet = async () => {
      throw new Error('offline');
    };
    const { service } = setup(llmWith(modelPapers), http);
    const res = await service.suggest('g1');
    expect(res.data!.papers).toEqual([]);
    expect(res.data!.verificationUnavailable).toBe(true);
    expect(res.data!.ideas).toHaveLength(3);
  });

  it('only suggests for research and project goals, and handles unknown goals and bad model output', async () => {
    const http: HttpGet = async () => ({ status: 200, text: EMPTY_FEED });
    const { service } = setup(llmWith(modelPapers), http);
    expect((await service.suggest('g2')).error).toMatch(/research and project goals/);
    expect((await service.suggest('nope')).error).toMatch(/couldn't find that goal/);
    const bad = setup(({ name: 'bad', countsTowardCap: false, generateJson: async () => ({ ideas: [] }) }) as LLMProvider, http);
    expect((await bad.service.suggest('g1')).error).toMatch(/useful suggestions/);
  });

  it('DEMO_MODE: the mock model plus the offline catalog verifies real papers and drops the invented one, with no network', async () => {
    const plan = new PlanStore(() => db);
    const papers = new PapersStore(() => db);
    const searchers = createSearchers({ DEMO_MODE: '1' }, async () => {
      throw new Error('network must not be used');
    });
    expect(searchers[0]).toBeInstanceOf(DemoCatalogSearcher);
    const client = new LLMClient({ provider: new MockLLMProvider({ delayMs: 0 }), log: () => {} });
    const service = new IdeasService({ plan, papers, verifier: new PaperVerifier(searchers), llm: () => client, log: () => undefined });
    db.prepare("INSERT INTO goals (id, title, type, status) VALUES ('g1', 'Get into a research lab by spring', 'research', 'active')").run();
    const res = await service.suggest('g1');
    expect(res.success).toBe(true);
    expect(res.data!.ideas.length).toBeGreaterThanOrEqual(3);
    expect(res.data!.papers).toHaveLength(5);
    expect(res.data!.papers.every((p) => p.url.startsWith('https://arxiv.org/abs/'))).toBe(true);
    expect(res.data!.papers.map((p) => p.title)).not.toContain('Quantum Banana Networks for Self-Healing Homework');
    expect(res.data!.dropped).toBe(1);
  });
});

describe('adding papers', () => {
  let db: Database.Database;
  beforeEach(() => {
    db = openDatabase(':memory:');
    db.prepare("INSERT INTO goals (id, title, type, status) VALUES ('g1', 'Join a lab', 'research', 'active')").run();
  });
  afterEach(() => {
    db.close();
  });

  function make() {
    const plan = new PlanStore(() => db);
    const papers = new PapersStore(() => db);
    const events: string[] = [];
    return { service: new PapersService({ papers, plan, log: (t) => void events.push(t) }), events, plan };
  }
  const input = { title: 'Attention Is All You Need', url: 'https://arxiv.org/abs/1706.03762', goalId: 'g1', authors: ['A. Vaswani'], year: 2017, arxivId: '1706.03762' };

  it('creates the papers row (with authors and year) and an optional "Read:" plan item', () => {
    const { service, plan } = make();
    const res = service.add({ ...input, planItemDueDate: '2026-11-15' });
    expect(res.success).toBe(true);
    expect(res.data!.paper).toMatchObject({ title: input.title, urlOrPath: input.url, goalId: 'g1', status: 'pending', authors: ['A. Vaswani'], year: 2017, arxivId: '1706.03762', questionCount: 0, readable: false });
    expect(db.prepare('SELECT title, url_or_path, status FROM papers').get()).toEqual({ title: input.title, url_or_path: input.url, status: 'pending' });
    const item = plan.getItem(res.data!.planItemId!);
    expect(item).toMatchObject({ title: 'Read: Attention Is All You Need', dueDate: '2026-11-15', goalId: 'g1', source: 'paper', status: 'pending' });
  });

  it('adds without a plan item by default, and adding the same link twice returns the existing paper', () => {
    const { service, events } = make();
    const first = service.add(input);
    expect(first.data!.planItemId).toBeNull();
    const again = service.add({ ...input, title: 'Same link again' });
    expect(again.data!.paper.id).toBe(first.data!.paper.id);
    expect(db.prepare('SELECT COUNT(*) AS n FROM papers').get()).toEqual({ n: 1 });
    expect(events).toEqual(['paper.added']);
  });

  it('validates input and goals', () => {
    const { service } = make();
    expect(service.add({ title: '', url: 'x' }).success).toBe(false);
    expect(service.add({ ...input, goalId: 'missing' }).error).toMatch(/find that goal/);
    expect(service.add({ title: 't', url: 'u', planItemDueDate: '2026-11-15' }).error).toMatch(/Choose a goal/);
    expect(service.add({ title: 't', url: 'u2', goalId: 'g1', planItemDueDate: '15/11/2026' }).success).toBe(false);
    expect(db.prepare('SELECT COUNT(*) AS n FROM papers').get()).toEqual({ n: 0 });
  });

  it('lists, updates status, and deletes with its questions and metadata', () => {
    const { service } = make();
    const { paper } = service.add(input).data!;
    db.prepare("INSERT INTO paper_questions (paper_id, question, answer, input_mode, ts) VALUES (?, 'q', 'a', 'text', 1)").run(paper.id);
    expect(service.list()[0].questionCount).toBe(1);
    expect(service.setStatus(paper.id, 'reading').data?.status).toBe('reading');
    expect(service.setStatus('nope', 'reading').error).toMatch(/find that paper/);
    expect(service.delete(paper.id).success).toBe(true);
    for (const table of ['papers', 'paper_meta', 'paper_questions']) {
      expect(db.prepare(`SELECT COUNT(*) AS n FROM ${table}`).get()).toEqual({ n: 0 });
    }
    expect(service.delete(paper.id).success).toBe(false);
  });
});
