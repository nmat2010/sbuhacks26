import type { PdfLine } from './extract.js';

// Section-aware chunking: headings are detected from the text (numbered headings, Abstract,
// References, ...) and from font size; paragraphs are rebuilt from line gaps; chunks never cross a
// section boundary, so every chunk can be cited as "3.2 Procedure, p. 2".

export interface PaperChunk {
  position: number;
  /** Heading it sits under, e.g. "3.2 Procedure". */
  section: string;
  /** Page of the chunk's first line (1-based). */
  page: number;
  text: string;
}

export const FRONT_MATTER = 'Title and authors';
const TARGET_WORDS = 140;
const MAX_WORDS = 220;

function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)];
}

function wordCount(text: string): number {
  return text.split(/\s+/).filter(Boolean).length;
}

const NAMED_HEADING =
  /^(abstract|references|bibliography|acknowledg(?:e)?ments?|appendix(?:\s+[a-z0-9])?|keywords|conclusions?|introduction|related work|discussion|results|methods?|background)\b[\s.:]*(?:[a-z ]{0,30})?$/i;
const NUMBERED = /^(?:\d{1,2}(?:\.\d{1,2}){0,3}|[A-Z]|[IVX]{1,5})\.?\s+([A-Z][^]*)$/;

export function isHeading(line: PdfLine, bodySize: number): boolean {
  const text = line.text.trim();
  const words = wordCount(text);
  if (text.length > 100 || words > 12 || words === 0) return false;

  if (NAMED_HEADING.test(text) && words <= 5) return true;

  const numbered = NUMBERED.exec(text);
  if (numbered && !/[.,;:]$/.test(text)) {
    const larger = line.size > bodySize * 1.05;
    // Sentences that merely start with a number ("48 Students were ...") are longer and body-sized
    if (larger || words <= 8) return true;
  }
  if (/^[A-Z][A-Z0-9\s.,:&-]{3,}$/.test(text) && words <= 8) return true;
  return line.size >= bodySize * 1.2 && words <= 10 && !/[.,;]$/.test(text);
}

/** Joins wrapped lines, removing line-break hyphenation. */
function joinLines(lines: string[]): string {
  let out = '';
  for (const line of lines) {
    if (!out) out = line;
    else if (/[A-Za-z]-$/.test(out) && /^[a-z]/.test(line)) out = out.slice(0, -1) + line;
    else out += ` ${line}`;
  }
  return out.replace(/\s+/g, ' ').trim();
}

function splitSentences(text: string): string[] {
  return text.match(/[^.!?]+(?:[.!?]+(?=\s|$)|$)/g)?.map((s) => s.trim()).filter(Boolean) ?? [text];
}

interface Paragraph {
  section: string;
  page: number;
  text: string;
}

export function buildChunks(lines: PdfLine[]): { title: string | null; chunks: PaperChunk[]; sections: string[] } {
  if (lines.length === 0) return { title: null, chunks: [], sections: [] };

  const sizes = lines.map((l) => Math.round(l.size * 2) / 2);
  const counts = new Map<number, number>();
  for (const s of sizes) counts.set(s, (counts.get(s) ?? 0) + 1);
  const bodySize = [...counts.entries()].sort((a, b) => b[1] - a[1])[0][0];
  const bodyGap = median(lines.filter((l) => l.gap !== null && Math.abs(l.size - bodySize) < 1).map((l) => l.gap as number));

  // The title is the run of large lines before the first heading
  const firstHeading = lines.findIndex((l) => isHeading(l, bodySize) && l.size <= bodySize * 1.5);
  const titleLines: string[] = [];
  for (const l of lines.slice(0, firstHeading === -1 ? lines.length : firstHeading)) {
    if (l.page === 1 && l.size >= bodySize * 1.4) titleLines.push(l.text);
    else if (titleLines.length) break;
  }
  const title = titleLines.length ? joinLines(titleLines) : null;

  const paragraphs: Paragraph[] = [];
  let section = FRONT_MATTER;
  let buffer: PdfLine[] = [];
  const flush = () => {
    if (buffer.length) {
      paragraphs.push({ section, page: buffer[0].page, text: joinLines(buffer.map((l) => l.text)) });
      buffer = [];
    }
  };
  const sections: string[] = [];

  for (const line of lines) {
    const isTitleLine = title !== null && titleLines.includes(line.text) && line.size >= bodySize * 1.4 && line.page === 1;
    if (isTitleLine) continue;
    if (isHeading(line, bodySize)) {
      flush();
      section = line.text.trim();
      if (!sections.includes(section)) sections.push(section);
      continue;
    }
    const newParagraph = buffer.length > 0 && bodyGap > 0 && line.gap !== null && line.gap > bodyGap * 1.3 && line.page === buffer[buffer.length - 1].page;
    const newPage = buffer.length > 0 && line.page !== buffer[buffer.length - 1].page && /[.!?]$/.test(buffer[buffer.length - 1].text);
    if (newParagraph || newPage) flush();
    buffer.push(line);
  }
  flush();

  // Pack paragraphs of one section into chunks of about TARGET_WORDS words
  const chunks: PaperChunk[] = [];
  let current: { section: string; page: number; parts: string[]; words: number } | null = null;
  const emit = () => {
    if (current && current.parts.length) {
      chunks.push({ position: chunks.length, section: current.section, page: current.page, text: current.parts.join('\n\n') });
    }
    current = null;
  };
  for (const para of paragraphs) {
    const pieces = wordCount(para.text) > MAX_WORDS ? splitLong(para.text) : [para.text];
    for (const piece of pieces) {
      const w = wordCount(piece);
      if (current && (current.section !== para.section || current.words + w > MAX_WORDS)) emit();
      if (!current) current = { section: para.section, page: para.page, parts: [], words: 0 };
      current.parts.push(piece);
      current.words += w;
      if (current.words >= TARGET_WORDS) emit();
    }
  }
  emit();
  return { title, chunks, sections };
}

/** Splits an over-long paragraph on sentence boundaries into pieces of about TARGET_WORDS. */
function splitLong(text: string): string[] {
  const pieces: string[] = [];
  let cur: string[] = [];
  let words = 0;
  for (const sentence of splitSentences(text)) {
    const w = wordCount(sentence);
    if (words + w > TARGET_WORDS && cur.length) {
      pieces.push(cur.join(' '));
      cur = [];
      words = 0;
    }
    cur.push(sentence);
    words += w;
  }
  if (cur.length) pieces.push(cur.join(' '));
  return pieces;
}
