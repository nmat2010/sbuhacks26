// PDF text extraction with pdf.js (legacy build, which runs in Node and Electron's main process).
// Canvas / DOMMatrix warnings printed by pdf.js are harmless: we only read text, never render.

export interface PdfLine {
  page: number;
  text: string;
  /** Font size in points (largest item on the line). */
  size: number;
  /** Vertical distance to the previous line on the same page; null for the first line. */
  gap: number | null;
}

export interface ExtractedPdf {
  title: string | null;
  pageCount: number;
  lines: PdfLine[];
}

interface TextItem {
  str: string;
  transform: number[];
  width: number;
  height: number;
}

export class PdfExtractError extends Error {}

/** Max pages we will read, to keep a huge scan from freezing the app. */
const MAX_PAGES = 150;

export async function extractPdf(data: Uint8Array): Promise<ExtractedPdf> {
  let pdfjs: typeof import('pdfjs-dist/legacy/build/pdf.mjs');
  try {
    pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
  } catch (error) {
    throw new PdfExtractError(`The PDF reader could not be loaded: ${(error as Error).message}`);
  }

  // pdf.js transfers the buffer, so give it a copy
  const task = pdfjs.getDocument({ data: new Uint8Array(data), useSystemFonts: false, verbosity: 0 });
  let doc;
  try {
    doc = await task.promise;
  } catch (error) {
    await task.destroy().catch(() => undefined);
    throw new PdfExtractError(`That file doesn't look like a readable PDF (${(error as Error).message}).`);
  }

  try {
    const lines: PdfLine[] = [];
    const pages = Math.min(doc.numPages, MAX_PAGES);
    for (let pageNo = 1; pageNo <= pages; pageNo++) {
      const page = await doc.getPage(pageNo);
      const content = await page.getTextContent();
      lines.push(...groupIntoLines(content.items as unknown[], pageNo));
      page.cleanup();
    }

    let title: string | null = null;
    try {
      const meta = await doc.getMetadata();
      const info = meta.info as { Title?: unknown } | undefined;
      if (typeof info?.Title === 'string' && info.Title.trim().length > 3) title = info.Title.trim();
    } catch {
      /* metadata is optional */
    }
    return { title, pageCount: doc.numPages, lines };
  } finally {
    await task.destroy();
  }
}

/** Items on the same baseline become one line, ordered left to right. */
function groupIntoLines(rawItems: unknown[], page: number): PdfLine[] {
  const items = rawItems.filter((i): i is TextItem => !!i && typeof (i as TextItem).str === 'string' && Array.isArray((i as TextItem).transform));
  const rows: Array<{ y: number; items: TextItem[] }> = [];
  for (const item of items) {
    if (!item.str.trim()) continue;
    const y = item.transform[5];
    const row = rows.find((r) => Math.abs(r.y - y) < 2.5);
    if (row) row.items.push(item);
    else rows.push({ y, items: [item] });
  }
  rows.sort((a, b) => b.y - a.y); // PDF y grows upward

  const out: PdfLine[] = [];
  let previousY: number | null = null;
  for (const row of rows) {
    row.items.sort((a, b) => a.transform[4] - b.transform[4]);
    let text = '';
    let endX: number | null = null;
    for (const item of row.items) {
      const x = item.transform[4];
      const size = Math.abs(item.transform[0]) || item.height || 10;
      if (endX !== null && x - endX > size * 0.15 && !text.endsWith(' ') && !item.str.startsWith(' ')) text += ' ';
      text += item.str;
      endX = x + item.width;
    }
    const size = Math.max(...row.items.map((i) => Math.abs(i.transform[0]) || i.height || 10));
    out.push({ page, text: text.replace(/\s+/g, ' ').trim(), size, gap: previousY === null ? null : previousY - row.y });
    previousY = row.y;
  }
  return out.filter((l) => l.text.length > 0);
}
