import { parseAtom } from '../papers/arxiv.js';
import type { HttpGet, PaperRecord } from '../papers/types.js';

// Getting a paper's PDF and metadata from an arXiv link. Network access is injected.

export interface BinaryResponse {
  status: number;
  data: Uint8Array;
}
export type HttpGetBinary = (url: string) => Promise<BinaryResponse>;

/** Biggest PDF we will download. */
export const MAX_PDF_BYTES = 60 * 1024 * 1024;

const NEW_ID = /(\d{4}\.\d{4,5})(?:v\d+)?/;
const OLD_ID = /([a-z-]+(?:\.[A-Z]{2})?\/\d{7})(?:v\d+)?/;

/** "https://arxiv.org/pdf/1706.03762v7.pdf", "arXiv:1706.03762", "1706.03762" -> "1706.03762". */
export function parseArxivId(input: string): string | null {
  const text = input.trim();
  if (!text) return null;
  const fromUrl = /arxiv\.org\/(?:abs|pdf)\/([^?#\s]+?)(?:\.pdf)?(?:[?#].*)?$/i.exec(text);
  const candidate = fromUrl ? fromUrl[1] : text.replace(/^arxiv:\s*/i, '');
  const m = NEW_ID.exec(candidate) ?? OLD_ID.exec(candidate);
  if (!m) return null;
  // Bare ids must be the whole input; otherwise "see 2020.12345 for more" would match
  if (!fromUrl && candidate.replace(/v\d+$/, '') !== m[1]) return null;
  return m[1];
}

export class ArxivFetchError extends Error {}

export async function downloadArxivPdf(http: HttpGetBinary, arxivId: string): Promise<Uint8Array> {
  let response: BinaryResponse;
  try {
    response = await http(`https://arxiv.org/pdf/${arxivId}`);
  } catch (error) {
    throw new ArxivFetchError(`Could not download the paper (${(error as Error).message})`);
  }
  if (response.status !== 200) throw new ArxivFetchError(`arXiv answered HTTP ${response.status} for that paper`);
  if (response.data.length > MAX_PDF_BYTES) throw new ArxivFetchError('That PDF is too large to open here');
  const head = Buffer.from(response.data.subarray(0, 5)).toString('latin1');
  if (head !== '%PDF-') throw new ArxivFetchError('arXiv did not return a PDF for that link');
  return response.data;
}

/** Title, authors and year for an arXiv id (one API request); null if arXiv cannot be reached. */
export async function fetchArxivMetadata(http: HttpGet, arxivId: string): Promise<PaperRecord | null> {
  try {
    const res = await http(`https://export.arxiv.org/api/query?id_list=${encodeURIComponent(arxivId)}`, {
      'User-Agent': 'WolfieSensei/1.0 (student study companion)'
    });
    if (res.status !== 200) return null;
    return parseAtom(res.text)[0] ?? null;
  } catch {
    return null;
  }
}
