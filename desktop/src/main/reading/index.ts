import { getDatabase } from '../db/index.js';
import { logEvent } from '../events.js';
import { getLLMClient } from '../llm/client.js';
import { fetchHttp, getPapersStore } from '../papers/index.js';
import type { HttpGetBinary } from './arxiv-fetch.js';
import { ReadingService } from './service.js';
import { ReadingStore } from './store.js';

let papersDir: string | null = null;
let service: ReadingService | null = null;

/** register.ts says where downloaded PDFs go (<userData>/papers). */
export function configureReading(opts: { papersDir?: string | null }): void {
  if (opts.papersDir !== undefined) papersDir = opts.papersDir;
}

/** Binary GET with a generous timeout (PDFs can be several MB). */
export const fetchBinary: HttpGetBinary = async (url) => {
  const res = await fetch(url, { signal: AbortSignal.timeout(60_000), redirect: 'follow' });
  return { status: res.status, data: new Uint8Array(await res.arrayBuffer()) };
};

export function getReadingService(): ReadingService {
  return (service ??= new ReadingService({
    store: new ReadingStore(getDatabase),
    papers: getPapersStore(),
    llm: getLLMClient,
    httpText: fetchHttp,
    httpBinary: fetchBinary,
    papersDir: () => papersDir,
    log: (type, payload) => {
      try {
        logEvent(type, payload);
      } catch (error) {
        console.error('[reading] could not log event:', error);
      }
    }
  }));
}

/** Test helper. */
export function resetReadingForTesting(): void {
  service = null;
}

export { ReadingService } from './service.js';
export { ReadingStore } from './store.js';
