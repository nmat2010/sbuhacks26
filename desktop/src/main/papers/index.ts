import { getDatabase } from '../db/index.js';
import { logEvent } from '../events.js';
import { getLLMClient } from '../llm/client.js';
import { planEvents } from '../plan/index.js';
import { PlanStore } from '../plan/store.js';
import { ArxivClient } from './arxiv.js';
import { DemoCatalogSearcher } from './demo-catalog.js';
import { SemanticScholarClient } from './semantic-scholar.js';
import { IdeasService, PapersService } from './service.js';
import { PapersStore } from './store.js';
import type { HttpGet, PaperSearcher } from './types.js';
import { PaperVerifier, SqliteVerifyCache } from './verify.js';

// App-wide papers wiring. DEMO_MODE (or the mock LLM) uses the offline demo catalog instead of
// the network, so the demo never needs the internet.

const log = (type: Parameters<typeof logEvent>[0], payload: Record<string, unknown>) => {
  try {
    logEvent(type, payload);
  } catch (error) {
    console.error('[papers] could not log event:', error);
  }
};

/** Plain fetch with a timeout; never throws on non-2xx (the clients look at the status). */
export const fetchHttp: HttpGet = async (url, headers) => {
  const res = await fetch(url, { headers, signal: AbortSignal.timeout(10_000) });
  return { status: res.status, text: await res.text() };
};

export function createSearchers(env: { DEMO_MODE?: string; SEMANTIC_SCHOLAR_API_KEY?: string }, http: HttpGet = fetchHttp): PaperSearcher[] {
  if (env.DEMO_MODE === '1') return [new DemoCatalogSearcher()];
  return [new ArxivClient({ http }), new SemanticScholarClient({ http, apiKey: env.SEMANTIC_SCHOLAR_API_KEY })];
}

let papers: PapersStore | null = null;
let papersService: PapersService | null = null;
let ideasService: IdeasService | null = null;

export function getPapersStore(): PapersStore {
  return (papers ??= new PapersStore(getDatabase));
}

export function getPapersService(): PapersService {
  return (papersService ??= new PapersService({ papers: getPapersStore(), plan: new PlanStore(getDatabase), log, onPlanChanged: () => planEvents.emit('changed') }));
}

export function getIdeasService(): IdeasService {
  return (ideasService ??= new IdeasService({
    plan: new PlanStore(getDatabase),
    papers: getPapersStore(),
    verifier: new PaperVerifier(createSearchers(process.env), new SqliteVerifyCache(), Date.now, (l) => console.log(l)),
    llm: getLLMClient,
    log
  }));
}

/** Test helper. */
export function resetPapersForTesting(): void {
  papers = null;
  papersService = null;
  ideasService = null;
}
