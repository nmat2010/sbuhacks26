import { readFileSync } from 'fs';
import { mkdtempSync, existsSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type Database from 'better-sqlite3';
import { openDatabase } from '../../db/index.js';
import { LLMClient } from '../../llm/client.js';
import { MockLLMProvider } from '../../llm/mock-provider.js';
import type { LLMProvider, LlmRequest } from '../../llm/provider.js';
import { PapersStore } from '../../papers/store.js';
import { Bm25Index, stem, tokenize } from '../bm25.js';
import { buildChunks, isHeading } from '../chunk.js';
import { extractPdf } from '../extract.js';
import { parseArxivId } from '../arxiv-fetch.js';
import { LABEL_GENERAL, LABEL_NOT_FOUND, LABEL_PAPER, ReadingService } from '../service.js';
import { ReadingStore } from '../store.js';

const here = dirname(fileURLToPath(import.meta.url));
const FIXTURE = join(here, 'fixtures', 'sample-paper.pdf');

let db: Database.Database;
let tmp: string;

beforeEach(() => {
  db = openDatabase(':memory:');
  tmp = mkdtempSync(join(tmpdir(), 'wolfie-reading-'));
});
afterEach(() => {
  db.close();
  rmSync(tmp, { recursive: true, force: true });
});

describe('PDF extraction and chunking (committed fixture, no network)', () => {
  it('reads the PDF text line by line, with page numbers and font sizes', async () => {
    const pdf = await extractPdf(readFileSync(FIXTURE));
    expect(pdf.pageCount).toBe(2);
    expect(pdf.title).toMatch(/Spaced Retrieval Practice/);
    const texts = pdf.lines.map((l) => l.text);
    expect(texts).toContain('Abstract');
    expect(texts).toContain('3.2 Procedure');
    const heading = pdf.lines.find((l) => l.text === '3 Method')!;
    const body = pdf.lines.find((l) => l.text.startsWith('Forty-eight students'))!;
    expect(heading.size).toBeGreaterThan(body.size);
    expect(Math.max(...pdf.lines.map((l) => l.page))).toBe(2);
  });

  it('splits the paper into sections and keeps chunks inside their section', async () => {
    const pdf = await extractPdf(readFileSync(FIXTURE));
    const { title, chunks, sections } = buildChunks(pdf.lines);
    expect(title).toBe('Spaced Retrieval Practice in Introductory Programming: A Small Classroom Study');
    expect(sections).toEqual([
      'Abstract',
      '1 Introduction',
      '2 Related Work',
      '3 Method',
      '3.1 Participants',
      '3.2 Procedure',
      '3.3 Measures',
      '4 Results',
      '5 Discussion',
      '6 Conclusion',
      'References'
    ]);
    expect(chunks[0].section).toBe('Title and authors');
    expect(chunks.map((c) => c.position)).toEqual(chunks.map((_, i) => i));
    const procedure = chunks.filter((c) => c.section === '3.2 Procedure');
    expect(procedure.length).toBeGreaterThan(0);
    expect(procedure.map((c) => c.text).join(' ')).toContain('every three days');
    // no chunk mixes sections: the Results numbers are only under Results
    for (const c of chunks) {
      if (c.text.includes('19 points')) expect(c.section).toBe('4 Results');
    }
    expect(chunks.find((c) => c.section === '4 Results')!.page).toBe(2);
    for (const c of chunks) expect(c.text.split(/\s+/).length).toBeLessThanOrEqual(260);
  });

  it('detects headings sensibly', () => {
    const line = (text: string, size = 10) => ({ page: 1, text, size, gap: 13 });
    expect(isHeading(line('Abstract', 13), 10)).toBe(true);
    expect(isHeading(line('2.1 Participants', 11), 10)).toBe(true);
    expect(isHeading(line('RELATED WORK'), 10)).toBe(true);
    expect(isHeading(line('48 students took part in the second section of the course.'), 10)).toBe(false);
    expect(isHeading(line('3 days later they were tested again, which is common.'), 10)).toBe(false);
    expect(isHeading(line('the spaced group gained more'), 10)).toBe(false);
  });

  it('rejects things that are not readable PDFs, with a friendly error', async () => {
    const store = new ReadingStore(() => db);
    const svc = new ReadingService({
      store,
      papers: new PapersStore(() => db),
      llm: () => ({ generate: async () => { throw new Error('no'); } }),
      httpText: async () => ({ status: 404, text: '' }),
      httpBinary: async () => ({ status: 404, data: new Uint8Array() }),
      papersDir: () => tmp,
      log: () => undefined
    });
    const bogus = join(tmp, 'bogus.pdf');
    (await import('fs')).writeFileSync(bogus, 'this is not a pdf');
    const res = await svc.importPdfFile(bogus);
    expect(res.success).toBe(false);
    expect(res.error).toMatch(/readable PDF/);
    expect((await svc.importPdfFile(join(tmp, 'missing.pdf'))).error).toMatch(/couldn't open/);
    expect(db.prepare('SELECT COUNT(*) AS n FROM papers').get()).toEqual({ n: 0 });
  });
});

describe('BM25', () => {
  it('stems and drops stop words', () => {
    expect(stem('quizzes')).toBe(stem('quiz'));
    expect(stem('spacing')).toBe(stem('spaced'));
    expect(stem('spaced')).toBe(stem('space'));
    expect(tokenize('What is the spacing of the quizzes?')).toEqual([stem('spacing'), stem('quizzes')]);
  });

  it('ranks the chunk about the topic first and measures coverage by term rarity', () => {
    const index = new Bm25Index([
      { id: 1, section: 'Method', text: 'Quizzes were given every three days to the spaced group.' },
      { id: 2, section: 'Results', text: 'The massed group gained six points on the delayed test.' },
      { id: 3, section: 'Intro', text: 'Retrieval practice improves long-term memory.' }
    ]);
    const hits = index.search('when were quizzes given to the spaced group');
    expect(hits[0].id).toBe(1);
    expect(hits[0].coverage).toBeGreaterThan(0.9);
    const offTopic = index.search('how does photosynthesis work');
    expect(offTopic.every((h) => h.coverage < 0.5)).toBe(true);
    expect(index.search('')).toEqual([]);
  });
});

describe('arXiv ids', () => {
  it.each([
    ['https://arxiv.org/abs/1706.03762v7', '1706.03762'],
    ['http://arxiv.org/pdf/1706.03762.pdf', '1706.03762'],
    ['arXiv:2301.12345v2', '2301.12345'],
    ['2301.12345', '2301.12345'],
    ['https://arxiv.org/abs/hep-th/9901001', 'hep-th/9901001']
  ])('%s -> %s', (input, id) => expect(parseArxivId(input)).toBe(id));

  it('rejects other things', () => {
    for (const bad of ['', 'https://example.com/paper.pdf', 'see 2020.12345 for more', 'hello']) expect(parseArxivId(bad)).toBeNull();
  });
});

describe('asking about a paper (fixture + mock model)', () => {
  async function ready(provider: LLMProvider = new MockLLMProvider({ delayMs: 0 }), extra: Partial<ConstructorParameters<typeof ReadingService>[0]> = {}) {
    const papers = new PapersStore(() => db);
    const store = new ReadingStore(() => db);
    const client = new LLMClient({ provider, retryDelayMs: 1, log: () => {} });
    const logs: string[] = [];
    const service = new ReadingService({
      store,
      papers,
      llm: () => client,
      httpText: async () => ({ status: 404, text: '' }),
      httpBinary: async () => ({ status: 404, data: new Uint8Array() }),
      papersDir: () => tmp,
      log: (t) => void logs.push(t),
      ...extra
    });
    const imported = await service.importPdfFile(FIXTURE);
    expect(imported.success).toBe(true);
    return { service, papers, store, paperId: imported.data!.paper.id, logs };
  }

  it('imports an uploaded PDF as a readable paper with its real title', async () => {
    const { papers, paperId, service } = await ready();
    const paper = papers.get(paperId);
    expect(paper).toMatchObject({ title: 'Spaced Retrieval Practice in Introductory Programming: A Small Classroom Study', urlOrPath: FIXTURE, readable: true, status: 'pending' });
    const content = service.content(paperId).data!;
    expect(content.sections.map((s) => s.title)).toContain('4 Results');
    expect(content.sections.find((s) => s.title === '4 Results')!.text).toContain('14 points');
    // importing the same file again updates the same paper
    const again = await service.importPdfFile(FIXTURE);
    expect(again.data!.paper.id).toBe(paperId);
    expect(db.prepare('SELECT COUNT(*) AS n FROM papers').get()).toEqual({ n: 1 });
  });

  it('a paragraph question cites the right section (selection + "what does this mean?")', async () => {
    const { service, paperId } = await ready();
    const res = await service.ask({
      paperId,
      mode: 'explain',
      inputMode: 'text',
      question: 'what does this mean?',
      selection: 'The spaced group took one quiz every three days, so the quizzes covered twelve days.'
    });
    expect(res.success).toBe(true);
    const a = res.data!;
    expect(a.grounded).toBe(true);
    expect(a.label).toBe(LABEL_PAPER);
    expect(a.citations[0].section).toBe('3.2 Procedure');
    expect(a.citations[0].page).toBe(1);
    expect(a.answer).toMatch(/Source: 3\.2 Procedure/);
    expect(a.answer).toMatch(/three days|quiz/i);
  });

  it('a typed question finds its section by keywords', async () => {
    const { service, paperId } = await ready();
    const results = await service.ask({ paperId, mode: 'explain', inputMode: 'text', question: 'How much did the spaced group gain on the delayed test?' });
    expect(results.data!.grounded).toBe(true);
    expect(results.data!.citations[0].section).toBe('4 Results');
    const where = await service.ask({ paperId, mode: 'explain', inputMode: 'voice', question: 'who took part in the study and how were they assigned to groups' });
    expect(where.data!.citations.map((c) => c.section)).toContain('3.1 Participants');
  });

  it('an off-topic question is labeled as general knowledge, with no citations', async () => {
    const { service, paperId } = await ready();
    const res = await service.ask({ paperId, mode: 'explain', inputMode: 'text', question: 'How does photosynthesis work?' });
    expect(res.success).toBe(true);
    expect(res.data).toMatchObject({ grounded: false, label: LABEL_GENERAL, citations: [] });
    expect(res.data!.answer).toMatch(/isn't covered in the paper/);
    expect(res.data!.answer).not.toMatch(/Source:/);
  });

  it('a model that claims to be grounded without valid citations is downgraded to general knowledge', async () => {
    const provider: LLMProvider = {
      name: 'liar',
      countsTowardCap: false,
      generateJson: async () => ({ grounded: true, answer: 'The paper proves everything.', citations: [7, 0] })
    };
    const { service, paperId } = await ready(provider);
    const res = await service.ask({ paperId, mode: 'explain', inputMode: 'text', question: 'How much did the spaced group gain on the delayed test?' });
    expect(res.data!.grounded).toBe(false);
    expect(res.data!.label).toBe(LABEL_GENERAL);
  });

  it('only sends the retrieved excerpts to the model, numbered, and none for an off-topic question', async () => {
    const requests: LlmRequest[] = [];
    const mock = new MockLLMProvider({ delayMs: 0 });
    const spy: LLMProvider = { name: 'spy', countsTowardCap: false, generateJson: (r) => (requests.push(r), mock.generateJson(r)) };
    const { service, paperId } = await ready(spy);
    await service.ask({ paperId, mode: 'explain', inputMode: 'text', question: 'How much did the spaced group gain on the delayed test?' });
    await service.ask({ paperId, mode: 'explain', inputMode: 'text', question: 'How does photosynthesis work?' });
    const first = JSON.parse(requests[0].messages[0].content);
    expect(first.covered).toBe(true);
    expect(first.excerpts.length).toBeGreaterThan(0);
    expect(first.excerpts.length).toBeLessThanOrEqual(4);
    expect(first.excerpts[0]).toMatchObject({ n: 1, section: '4 Results' });
    const second = JSON.parse(requests[1].messages[0].content);
    expect(second).toMatchObject({ covered: false, excerpts: [] });
    expect(requests[0].system).toMatch(/only the numbered excerpts/);
  });

  it('"check my understanding" asks a question about the passage', async () => {
    const { service, paperId } = await ready();
    const res = await service.ask({
      paperId,
      mode: 'check',
      inputMode: 'text',
      question: '',
      selection: 'On the nested-loop questions the spaced group\'s advantage grew to 19 points over the massed group.'
    });
    expect(res.data!.mode).toBe('check');
    expect(res.data!.answer).toMatch(/\?$/m);
    expect(res.data!.citations[0].section).toBe('4 Results');
    // with nothing to go on it starts from the abstract
    const bare = await service.ask({ paperId, mode: 'check', inputMode: 'text', question: '' });
    expect(bare.data!.citations[0].section).toBe('Abstract');
  });

  it('"show me where" finds the passages without calling the model, and says so when it cannot', async () => {
    let modelCalls = 0;
    const counting: LLMProvider = { name: 'c', countsTowardCap: false, generateJson: async () => { modelCalls++; return {}; } };
    const { service, paperId } = await ready(counting);
    const found = await service.ask({ paperId, mode: 'where', inputMode: 'text', question: 'delayed test twelve days after the last quiz' });
    expect(found.data).toMatchObject({ grounded: true, label: LABEL_PAPER });
    expect(found.data!.answer).toMatch(/This is discussed in .*3\.2 Procedure/);
    expect(found.data!.citations.length).toBeGreaterThan(0);
    const missing = await service.ask({ paperId, mode: 'where', inputMode: 'text', question: 'photosynthesis chlorophyll' });
    expect(missing.data).toMatchObject({ grounded: false, label: LABEL_NOT_FOUND, citations: [] });
    expect(modelCalls).toBe(0);
  });

  it('saves every question to paper_questions with the input mode, and lists them', async () => {
    const { service, paperId, store, papers } = await ready();
    await service.ask({ paperId, mode: 'explain', inputMode: 'text', question: 'How much did the spaced group gain on the delayed test?' });
    await service.ask({ paperId, mode: 'explain', inputMode: 'voice', question: 'How does photosynthesis work?' });
    await service.ask({ paperId, mode: 'where', inputMode: 'voice', question: 'nested loops' });
    const rows = db.prepare('SELECT question, input_mode, paper_id FROM paper_questions ORDER BY id').all();
    expect(rows).toEqual([
      { question: 'How much did the spaced group gain on the delayed test?', input_mode: 'text', paper_id: paperId },
      { question: 'How does photosynthesis work?', input_mode: 'voice', paper_id: paperId },
      { question: 'nested loops', input_mode: 'voice', paper_id: paperId }
    ]);
    const listed = store.listQuestions(paperId);
    expect(listed.map((q) => [q.mode, q.grounded])).toEqual([['explain', true], ['explain', false], ['where', true]]);
    expect(listed[0].citations[0].section).toBe('4 Results');
    expect(papers.get(paperId).questionCount).toBe(3);
  });

  it('validates input and handles unknown or unread papers', async () => {
    const { service, paperId, papers } = await ready();
    expect((await service.ask({ paperId, mode: 'explain', inputMode: 'text', question: '  ' })).error).toMatch(/Ask a question/);
    expect((await service.ask({ paperId: 'nope', mode: 'explain', inputMode: 'text', question: 'x' })).error).toMatch(/couldn't find/);
    const unread = papers.add({ title: 'Unread', urlOrPath: 'https://example.com/x.html' });
    expect((await service.ask({ paperId: unread.id, mode: 'explain', inputMode: 'text', question: 'x' })).error).toMatch(/haven't read/);
    expect((await service.makeReadable(unread.id)).error).toMatch(/upload or that come from arXiv/);
  });

  it('gives friendly errors when the model is unavailable', async () => {
    const down: LLMProvider = { name: 'down', countsTowardCap: false, generateJson: async () => { throw Object.assign(new Error('x'), { status: 403 }); } };
    const { service, paperId } = await ready(down);
    const res = await service.ask({ paperId, mode: 'explain', inputMode: 'text', question: 'How much did the spaced group gain on the delayed test?' });
    expect(res.success).toBe(false);
    expect(res.error).toMatch(/couldn't reach the question service/);
    expect(db.prepare('SELECT COUNT(*) AS n FROM paper_questions').get()).toEqual({ n: 0 });
  });
});

describe('importing from arXiv (HTTP faked)', () => {
  const ATOM = `<feed><entry><id>http://arxiv.org/abs/2301.00001v1</id><published>2023-01-01T00:00:00Z</published><title>Spaced Retrieval Practice in Introductory Programming</title><author><name>Maya Okafor</name></author><author><name>Daniel Reyes</name></author></entry></feed>`;

  function make(binary: (url: string) => Promise<{ status: number; data: Uint8Array }>) {
    const papers = new PapersStore(() => db);
    return {
      papers,
      service: new ReadingService({
        store: new ReadingStore(() => db),
        papers,
        llm: () => new LLMClient({ provider: new MockLLMProvider({ delayMs: 0 }), log: () => {} }),
        httpText: async () => ({ status: 200, text: ATOM }),
        httpBinary: binary,
        papersDir: () => join(tmp, 'papers'),
        log: () => undefined
      })
    };
  }

  it('downloads the PDF, saves it, reads it, and fills in title, authors and year from arXiv', async () => {
    const urls: string[] = [];
    const { service, papers } = make(async (url) => {
      urls.push(url);
      return { status: 200, data: new Uint8Array(readFileSync(FIXTURE)) };
    });
    const res = await service.importArxiv('https://arxiv.org/abs/2301.00001v1');
    expect(res.success).toBe(true);
    expect(urls).toEqual(['https://arxiv.org/pdf/2301.00001']);
    expect(res.data!.paper).toMatchObject({
      title: 'Spaced Retrieval Practice in Introductory Programming',
      urlOrPath: 'https://arxiv.org/abs/2301.00001',
      authors: ['Maya Okafor', 'Daniel Reyes'],
      year: 2023,
      arxivId: '2301.00001',
      readable: true
    });
    const saved = papers.getLocalPath(res.data!.paper.id)!;
    expect(existsSync(saved)).toBe(true);
    expect(service.content(res.data!.paper.id).data!.localPath).toBe(saved);
  });

  it('makes a recommended (link-only) paper readable in place', async () => {
    const { service, papers } = make(async () => ({ status: 200, data: new Uint8Array(readFileSync(FIXTURE)) }));
    const added = papers.add({ title: 'Recommended', urlOrPath: 'https://arxiv.org/abs/2301.00001', arxivId: '2301.00001' });
    expect(added.readable).toBe(false);
    const res = await service.makeReadable(added.id);
    expect(res.data!.paper).toMatchObject({ id: added.id, readable: true });
    expect(db.prepare('SELECT COUNT(*) AS n FROM papers').get()).toEqual({ n: 1 });
  });

  it('fails kindly: bad link, HTTP error, not a PDF', async () => {
    const { service } = make(async () => ({ status: 404, data: new Uint8Array() }));
    expect((await service.importArxiv('not a link')).error).toMatch(/arXiv link or id/);
    expect((await service.importArxiv('2301.00001')).error).toMatch(/HTTP 404.*upload the PDF/);
    const html = make(async () => ({ status: 200, data: new TextEncoder().encode('<html>captcha</html>') }));
    expect((await html.service.importArxiv('2301.00001')).error).toMatch(/did not return a PDF/);
    const net = make(async () => { throw new Error('offline'); });
    expect((await net.service.importArxiv('2301.00001')).error).toMatch(/Could not download/);
  });
});
