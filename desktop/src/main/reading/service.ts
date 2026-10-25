import { mkdir, readFile, writeFile } from 'fs/promises';
import { basename, extname, join } from 'path';
import { z } from 'zod';
import type {
  AskPaperInput,
  BResult,
  PaperAnswer,
  PaperCitation,
  PaperSection,
  PaperView,
  ReadingMode
} from '../../common/ipc-intelligence.js';
import type { EventType } from '../events.js';
import type { LlmCall } from '../llm/client.js';
import { renderPrompt } from '../llm/prompts/index.js';
import { LLMError } from '../llm/provider.js';
import type { HttpGet } from '../papers/types.js';
import { PaperNotFoundError, type PapersStore } from '../papers/store.js';
import { Bm25Index } from './bm25.js';
import { buildChunks } from './chunk.js';
import {
  ArxivFetchError,
  downloadArxivPdf,
  fetchArxivMetadata,
  MAX_PDF_BYTES,
  parseArxivId,
  type HttpGetBinary
} from './arxiv-fetch.js';
import { extractPdf, PdfExtractError } from './extract.js';
import type { ReadingStore, StoredChunk } from './store.js';

// Paper reading (SPEC Phase 7): import a PDF or an arXiv paper, split it into section-aware
// chunks, and answer questions grounded in those chunks with section citations. Anything the
// paper does not cover is answered separately and labeled as general knowledge.

export const LABEL_PAPER = 'From the paper';
export const LABEL_GENERAL = 'General knowledge (not from this paper)';
export const LABEL_NOT_FOUND = 'Not found in this paper';
const GENERAL_PREFIX = "This isn't covered in the paper, so here is some general background: ";

/** An answer is grounded in the paper only if the best passage covers at least this much of the question. */
export const MIN_COVERAGE = 0.5;
const EXCERPTS = 4;

const ModelAnswer = z.object({
  grounded: z.boolean(),
  answer: z.string().min(1).max(2000),
  citations: z.array(z.coerce.number().int()).max(10).default([])
});

export interface ReadingServiceDeps {
  store: ReadingStore;
  papers: PapersStore;
  llm: () => { generate<T>(call: LlmCall<T>): Promise<T> };
  httpText: HttpGet;
  httpBinary: HttpGetBinary;
  /** Where downloaded PDFs are kept; null when unavailable (downloads still work, but are not saved). */
  papersDir: () => string | null;
  log: (type: EventType, payload: Record<string, unknown>) => void;
}

export class ReadingService {
  private readonly indexes = new Map<string, { chunks: number; index: Bm25Index }>();

  constructor(private readonly deps: ReadingServiceDeps) {}

  // ---- Importing -----------------------------------------------------------------------

  /** An uploaded PDF (the file picker lives in register.ts). */
  async importPdfFile(filePath: string, goalId?: string): Promise<BResult<{ paper: PaperView }>> {
    let bytes: Uint8Array;
    try {
      bytes = await readFile(filePath);
    } catch {
      return { success: false, error: "I couldn't open that file." };
    }
    return this.importBytes(bytes, { urlOrPath: filePath, fallbackTitle: basename(filePath, extname(filePath)), goalId, localPath: filePath });
  }

  async importArxiv(input: string, goalId?: string): Promise<BResult<{ paper: PaperView }>> {
    const id = parseArxivId(input);
    if (!id) return { success: false, error: "That doesn't look like an arXiv link or id. Try something like arxiv.org/abs/1706.03762." };
    const existing = this.deps.papers.findDuplicate(`https://arxiv.org/abs/${id}`, id);
    return this.fetchAndRead(id, existing?.id, goalId);
  }

  /**
   * A PDF the student opened in the browser (Watch mode). arXiv links go through `importArxiv`;
   * other links are downloaded directly, which fails for papers behind a login.
   */
  async importPdfUrl(url: string): Promise<BResult<{ paper: PaperView }>> {
    // Already read (e.g. opened again in a later session): don't download it again
    const ready = this.findReadableByUrl(url);
    if (ready) return { success: true, data: { paper: ready } };
    const arxivId = parseArxivId(url);
    if (arxivId && /arxiv\.org/i.test(url)) return this.importArxiv(url);
    const existing = this.deps.papers.findDuplicate(url);
    let bytes: Uint8Array;
    try {
      const res = await this.deps.httpBinary(url);
      if (res.status !== 200) return { success: false, error: `The PDF link answered HTTP ${res.status}.` };
      if (res.data.length > MAX_PDF_BYTES) return { success: false, error: 'That PDF is too large to open here.' };
      if (Buffer.from(res.data.subarray(0, 5)).toString('latin1') !== '%PDF-') {
        return { success: false, error: "That link didn't return a PDF (it may need a login)." };
      }
      bytes = res.data;
    } catch {
      return { success: false, error: "I couldn't download that PDF." };
    }
    const name = decodeURIComponent(url.split('/').pop() ?? 'paper').replace(/\.pdf$/i, '');
    return this.importBytes(bytes, { urlOrPath: url, fallbackTitle: name, existingId: existing?.id });
  }

  /** The library paper for a URL the student has open, if Wolfie has read it. */
  findReadableByUrl(url: string): PaperView | null {
    const arxivId = /arxiv\.org/i.test(url) ? parseArxivId(url) : null;
    const paper = this.deps.papers.findDuplicate(arxivId ? `https://arxiv.org/abs/${arxivId}` : url, arxivId);
    return paper?.readable ? paper : null;
  }

  /**
   * The passages of a paper that best match `query` (keyword search, no model call), for Watch
   * mode answers that draw on several sources. Empty if the paper has no text.
   */
  excerpts(paperId: string, query: string, limit = EXCERPTS): Array<{ section: string; page: number | null; text: string }> {
    const chunks = this.deps.store.getChunks(paperId);
    if (chunks.length === 0 || !query.trim()) return [];
    const byId = new Map(chunks.map((c) => [c.id, c]));
    return this.index(paperId, chunks)
      .search(query, limit)
      .map((h) => byId.get(h.id))
      .filter((c): c is StoredChunk => !!c)
      .map((c) => ({ section: c.section, page: c.page, text: c.text }));
  }

  /** Library papers added from recommendations have a link but no text yet. */
  async makeReadable(paperId: string): Promise<BResult<{ paper: PaperView }>> {
    try {
      const paper = this.deps.papers.get(paperId);
      if (paper.readable) return { success: true, data: { paper } };
      const arxivId = paper.arxivId ?? parseArxivId(paper.urlOrPath);
      if (arxivId) return await this.fetchAndRead(arxivId, paper.id, paper.goalId ?? undefined);
      const local = this.deps.papers.getLocalPath(paperId) ?? paper.urlOrPath;
      if (/\.pdf$/i.test(local) && !/^https?:/i.test(local)) {
        const bytes = await readFile(local).catch(() => null);
        if (bytes) return await this.importBytes(bytes, { urlOrPath: paper.urlOrPath, fallbackTitle: paper.title, existingId: paper.id, localPath: local });
      }
      return { success: false, error: 'I can only read PDFs that you upload or that come from arXiv.' };
    } catch (error) {
      if (error instanceof PaperNotFoundError) return { success: false, error: "I couldn't find that paper." };
      throw error;
    }
  }

  private async fetchAndRead(arxivId: string, existingId: string | undefined, goalId: string | undefined): Promise<BResult<{ paper: PaperView }>> {
    let bytes: Uint8Array;
    try {
      bytes = await downloadArxivPdf(this.deps.httpBinary, arxivId);
    } catch (error) {
      const message = error instanceof ArxivFetchError ? error.message : 'Could not download the paper';
      return { success: false, error: `${message}. Check your connection, or upload the PDF yourself.` };
    }
    const meta = await fetchArxivMetadata(this.deps.httpText, arxivId);
    let localPath: string | null = null;
    const dir = this.deps.papersDir();
    if (dir) {
      try {
        await mkdir(dir, { recursive: true });
        localPath = join(dir, `${arxivId.replace(/[^a-z0-9.-]/gi, '_')}.pdf`);
        await writeFile(localPath, bytes);
      } catch {
        localPath = null;
      }
    }
    return this.importBytes(bytes, {
      urlOrPath: `https://arxiv.org/abs/${arxivId}`,
      fallbackTitle: `arXiv ${arxivId}`,
      goalId,
      existingId,
      localPath,
      meta: { title: meta?.title, authors: meta?.authors, year: meta?.year ?? null, arxivId }
    });
  }

  private async importBytes(
    bytes: Uint8Array,
    opts: {
      urlOrPath: string;
      fallbackTitle: string;
      goalId?: string;
      existingId?: string;
      localPath?: string | null;
      meta?: { title?: string; authors?: string[]; year?: number | null; arxivId?: string };
    }
  ): Promise<BResult<{ paper: PaperView }>> {
    let extracted;
    try {
      extracted = await extractPdf(bytes);
    } catch (error) {
      if (error instanceof PdfExtractError) return { success: false, error: error.message };
      throw error;
    }
    const { title: guessedTitle, chunks } = buildChunks(extracted.lines);
    if (chunks.length === 0) {
      return {
        success: false,
        error: "I couldn't find any text to read in that PDF. It may be a scan; try a version with selectable text."
      };
    }

    const { papers, store } = this.deps;
    const title = opts.meta?.title || guessedTitle || extracted.title || opts.fallbackTitle;
    let paper = opts.existingId ? papers.get(opts.existingId) : papers.findDuplicate(opts.urlOrPath, opts.meta?.arxivId);
    if (!paper) {
      paper = papers.add({
        title,
        urlOrPath: opts.urlOrPath,
        goalId: opts.goalId ?? null,
        authors: opts.meta?.authors,
        year: opts.meta?.year ?? null,
        arxivId: opts.meta?.arxivId ?? null,
        source: 'import'
      });
    } else if (opts.meta) {
      papers.updateDetails(paper.id, { authors: opts.meta.authors, year: opts.meta.year ?? undefined, arxivId: opts.meta.arxivId });
    }
    store.saveChunks(paper.id, chunks);
    this.indexes.delete(paper.id);
    if (opts.localPath) papers.setLocalPath(paper.id, opts.localPath);
    this.deps.log('paper.imported', { chunks: chunks.length, pages: extracted.pageCount, arxiv: Boolean(opts.meta?.arxivId) });
    return { success: true, data: { paper: papers.get(paper.id) } };
  }

  // ---- Reading -------------------------------------------------------------------------

  content(paperId: string): BResult<{ paper: PaperView; sections: PaperSection[]; localPath: string | null }> {
    try {
      const paper = this.deps.papers.get(paperId);
      const chunks = this.deps.store.getChunks(paperId);
      const sections: PaperSection[] = [];
      for (const c of chunks) {
        const last = sections[sections.length - 1];
        if (last && last.title === c.section) last.text += `\n\n${c.text}`;
        else sections.push({ title: c.section, page: c.page, text: c.text });
      }
      return { success: true, data: { paper, sections, localPath: this.deps.papers.getLocalPath(paperId) } };
    } catch (error) {
      if (error instanceof PaperNotFoundError) return { success: false, error: "I couldn't find that paper." };
      throw error;
    }
  }

  async ask(input: AskPaperInput): Promise<BResult<PaperAnswer>> {
    const { papers, store } = this.deps;
    let paper: PaperView;
    try {
      paper = papers.get(input.paperId);
    } catch {
      return { success: false, error: "I couldn't find that paper." };
    }
    const chunks = store.getChunks(paper.id);
    if (chunks.length === 0) {
      return { success: false, error: "I haven't read this paper yet. Open it first so I can read it." };
    }
    const question = input.question.trim();
    const selection = input.selection?.trim() ?? '';
    if (!question && !selection && input.mode !== 'check') {
      return { success: false, error: 'Ask a question, or highlight some text first.' };
    }

    // Passages that contain the highlighted text come first, then the best keyword matches
    const retrieval = this.retrieve(paper.id, chunks, question, selection);
    const excerpts = retrieval.chunks;
    const covered = retrieval.covered;

    let answer: PaperAnswer;
    if (input.mode === 'where') {
      answer = this.whereAnswer(paper.id, question || selection, excerpts, covered);
    } else {
      try {
        answer = await this.modelAnswer(paper.id, input.mode, question, selection, excerpts, covered);
      } catch (error) {
        return { success: false, error: friendly(error) };
      }
    }

    store.saveQuestion({
      paperId: paper.id,
      question: question || (selection ? `[${input.mode === 'check' ? 'Check my understanding' : 'Selected text'}] ${selection.slice(0, 200)}` : '[Check my understanding]'),
      answer: answer.answer,
      inputMode: input.inputMode,
      mode: input.mode,
      grounded: answer.grounded,
      citations: answer.citations
    });
    this.deps.log('paper.asked', { mode: input.mode, grounded: answer.grounded, inputMode: input.inputMode, citations: answer.citations.length });
    return { success: true, data: answer };
  }

  // ---- Internals -----------------------------------------------------------------------

  private index(paperId: string, chunks: StoredChunk[]): Bm25Index {
    const cached = this.indexes.get(paperId);
    if (cached && cached.chunks === chunks.length) return cached.index;
    const index = new Bm25Index(chunks.map((c) => ({ id: c.id, section: c.section, text: c.text })));
    this.indexes.set(paperId, { chunks: chunks.length, index });
    return index;
  }

  private retrieve(paperId: string, chunks: StoredChunk[], question: string, selection: string): { chunks: StoredChunk[]; covered: boolean } {
    const byId = new Map(chunks.map((c) => [c.id, c]));
    const picked: StoredChunk[] = [];
    const add = (c: StoredChunk | undefined) => {
      if (c && !picked.includes(c) && picked.length < EXCERPTS) picked.push(c);
    };

    // 1. Where the highlighted text actually is in the paper
    if (selection) {
      const needle = squash(selection);
      if (needle.length >= 12) {
        for (const c of chunks) if (squash(c.text).includes(needle)) add(c);
      }
    }
    const anchored = picked.length > 0;

    // 2. Keyword matches for the question (and the selection, if it was not found verbatim)
    const query = [question, anchored ? '' : selection].filter(Boolean).join(' ');
    const hits = query ? this.index(paperId, chunks).search(query, EXCERPTS) : [];
    const supported = hits.filter((h) => h.coverage >= MIN_COVERAGE);
    for (const h of supported) add(byId.get(h.id));

    // 3. "Check my understanding" with nothing to go on: start from the abstract
    if (picked.length === 0 && !question && !selection) {
      add(chunks.find((c) => /abstract/i.test(c.section)) ?? chunks[0]);
      return { chunks: picked, covered: picked.length > 0 };
    }
    return { chunks: picked, covered: anchored || supported.length > 0 };
  }

  private cite(chunks: StoredChunk[]): PaperCitation[] {
    return chunks.map((c) => ({ section: c.section, page: c.page, snippet: snippet(c.text), chunkId: c.id }));
  }

  /** "Show me where this is in the paper": pure retrieval, no model call. */
  private whereAnswer(paperId: string, topic: string, excerpts: StoredChunk[], covered: boolean): PaperAnswer {
    if (!covered || excerpts.length === 0) {
      return {
        paperId,
        question: topic,
        mode: 'where',
        answer: "I couldn't find that in this paper.",
        grounded: false,
        label: LABEL_NOT_FOUND,
        citations: []
      };
    }
    const shown = excerpts.slice(0, 3);
    const places = shown.map((c) => `${c.section}${c.page ? ` (page ${c.page})` : ''}`);
    return {
      paperId,
      question: topic,
      mode: 'where',
      answer: `This is discussed in ${joinList(places)}.`,
      grounded: true,
      label: LABEL_PAPER,
      citations: this.cite(shown)
    };
  }

  private async modelAnswer(
    paperId: string,
    mode: Exclude<ReadingMode, 'where'>,
    question: string,
    selection: string,
    excerpts: StoredChunk[],
    covered: boolean
  ): Promise<PaperAnswer> {
    const numbered = covered ? excerpts : [];
    const out = await this.deps.llm().generate({
      task: 'paper_answer',
      system: renderPrompt('reading.v1'),
      messages: [
        {
          role: 'user',
          content: JSON.stringify({
            mode,
            question,
            selection: selection || undefined,
            covered,
            excerpts: numbered.map((c, i) => ({ n: i + 1, section: c.section, page: c.page, text: c.text }))
          })
        }
      ],
      schema: ModelAnswer,
      mockKey: {
        mode,
        question,
        covered,
        excerpts: numbered.map((c, i) => ({ n: i + 1, section: c.section, text: c.text }))
      }
    });

    // Citations must point at excerpts we actually sent; otherwise it is not grounded
    const cited = [...new Set(out.citations)].filter((n) => n >= 1 && n <= numbered.length).map((n) => numbered[n - 1]);
    const grounded = covered && out.grounded && cited.length > 0;
    const text = out.answer.trim();

    if (!grounded) {
      const alreadySaysSo = /\b(not covered|isn't covered|doesn't (cover|discuss|mention)|general (knowledge|background))\b/i.test(text);
      return {
        paperId,
        question,
        mode,
        answer: mode === 'check' && covered ? text : alreadySaysSo ? text : `${GENERAL_PREFIX}${text}`,
        grounded: false,
        label: mode === 'check' && covered ? LABEL_PAPER : LABEL_GENERAL,
        citations: []
      };
    }
    const where = cited.map((c) => `${c.section}${c.page ? `, p. ${c.page}` : ''}`);
    return {
      paperId,
      question,
      mode,
      answer: `${text}\n\nSource: ${where.join('; ')}`,
      grounded: true,
      label: LABEL_PAPER,
      citations: this.cite(cited)
    };
  }
}

function squash(text: string): string {
  return text.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

function snippet(text: string): string {
  const flat = text.replace(/\s+/g, ' ').trim();
  return flat.length > 180 ? `${flat.slice(0, 177)}...` : flat;
}

function joinList(items: string[]): string {
  if (items.length <= 1) return items[0] ?? '';
  return `${items.slice(0, -1).join(', ')} and ${items[items.length - 1]}`;
}

function friendly(error: unknown): string {
  if (error instanceof LLMError) {
    if (error.code === 'DAILY_CAP') return "I've reached today's limit for questions. Try again tomorrow.";
    if (error.code === 'QUOTA') return "Gemini's daily quota for this API key is used up. It resets at midnight Pacific time, or turn on billing in Google AI Studio.";
    if (error.code === 'SCHEMA' || error.code === 'INVALID_JSON') return "I couldn't put together a good answer this time. Please try asking again.";
  }
  return "I couldn't reach the question service. Check your connection and try again.";
}
