import type { z } from 'zod';
import { getSetting } from '../settings.js';
import { GeminiProvider } from './gemini-provider.js';
import { MockLLMProvider } from './mock-provider.js';
import { redactForLog } from './redact.js';
import { toJsonSchema } from './schema.js';
import { localDay, MemoryUsageStore, SqliteUsageStore, type UsageStore } from './usage.js';
import {
  LLMError,
  type ChatMessage,
  type LLMProvider,
  type LlmImage,
  type LlmRequest,
  type LlmTask
} from './provider.js';

// The one door to a model (SPEC 6): request timeout, one retry for transient failures, a per-day
// call cap, Zod validation with one retry on schema failure, and logs that carry no content.

export interface LlmCall<T> {
  task: LlmTask;
  system: string;
  messages: ChatMessage[];
  images?: LlmImage[];
  /** Validates (and may transform) the model's JSON. Also becomes the response JSON Schema. */
  schema: z.ZodType<T, z.ZodTypeDef, unknown>;
  mockKey?: Record<string, unknown>;
  temperature?: number;
}

export interface LLMClientOptions {
  provider: LLMProvider;
  /** Per-attempt timeout. */
  timeoutMs?: number;
  /** Calls per local day; return Infinity-like large number to disable. */
  dailyCap?: () => number;
  usage?: UsageStore;
  now?: () => number;
  /** Receives metadata-only lines. Defaults to console.log. */
  log?: (line: string) => void;
  /** Wait between a failed attempt and its retry. */
  retryDelayMs?: number;
}

export class LLMClient {
  readonly provider: LLMProvider;
  private readonly timeoutMs: number;
  private readonly dailyCap: () => number;
  private readonly usage: UsageStore;
  private readonly now: () => number;
  private readonly log: (line: string) => void;
  private readonly retryDelayMs: number;

  constructor(opts: LLMClientOptions) {
    this.provider = opts.provider;
    this.timeoutMs = opts.timeoutMs ?? 25_000;
    this.dailyCap = opts.dailyCap ?? (() => Number.MAX_SAFE_INTEGER);
    this.usage = opts.usage ?? new MemoryUsageStore();
    this.now = opts.now ?? Date.now;
    this.log = opts.log ?? ((line) => console.log(line));
    this.retryDelayMs = opts.retryDelayMs ?? 400;
  }

  /**
   * Calls the model and returns a validated result. Throws LLMError: DAILY_CAP, SCHEMA (the reply
   * was invalid twice), or the transport error that remained after the retry.
   */
  async generate<T>(call: LlmCall<T>): Promise<T> {
    const jsonSchema = toJsonSchema(call.schema);
    let messages = call.messages;
    let lastIssue = '';

    for (let schemaAttempt = 0; schemaAttempt < 2; schemaAttempt++) {
      const raw = await this.callWithRetry({
        task: call.task,
        system: call.system,
        messages,
        images: call.images,
        jsonSchema,
        mockKey: call.mockKey,
        temperature: call.temperature
      });
      if (raw.ok) {
        const parsed = call.schema.safeParse(raw.value);
        if (parsed.success) return parsed.data;
        lastIssue = parsed.error.issues
          .slice(0, 5)
          .map((i) => `${i.path.join('.') || '(root)'}: ${i.message}`)
          .join('; ');
      } else {
        lastIssue = raw.issue;
      }
      this.log(`[llm] task=${call.task} schema-failure attempt=${schemaAttempt + 1} issue="${redactForLog(lastIssue, 120)}"`);
      // The retry tells the model what was wrong, without repeating its own output.
      messages = [
        ...call.messages,
        {
          role: 'user',
          content: `Your previous reply was not valid. Problems: ${lastIssue}. Reply again with only JSON that matches the schema exactly.`
        }
      ];
    }
    throw new LLMError(`Model reply failed validation twice: ${redactForLog(lastIssue)}`, 'SCHEMA', this.provider.name);
  }

  /** One logical call: transient failures are retried once. Invalid JSON is reported, not thrown. */
  private async callWithRetry(
    req: Omit<LlmRequest, 'signal'>
  ): Promise<{ ok: true; value: unknown } | { ok: false; issue: string }> {
    let transportAttempt = 0;
    for (;;) {
      transportAttempt++;
      this.reserveCall();
      const started = this.now();
      try {
        const value = await this.withTimeout((signal) => this.provider.generateJson({ ...req, signal }));
        this.log(`[llm] task=${req.task} provider=${this.provider.name} attempt=${transportAttempt} ms=${this.now() - started} ok`);
        return { ok: true, value };
      } catch (error) {
        const err = toLlmError(error, this.provider.name);
        this.log(
          `[llm] task=${req.task} provider=${this.provider.name} attempt=${transportAttempt} ms=${this.now() - started} error=${err.code} ${redactForLog(err.message, 120)}`
        );
        if (err.code === 'INVALID_JSON') return { ok: false, issue: 'reply was not parseable JSON' };
        if (!err.retryable || transportAttempt >= 2) throw err;
        await new Promise((resolve) => setTimeout(resolve, this.retryDelayMs));
      }
    }
  }

  private reserveCall(): void {
    if (!this.provider.countsTowardCap) return;
    const day = localDay(this.now());
    const cap = this.dailyCap();
    if (this.usage.get(day) >= cap) {
      throw new LLMError(`Daily call limit (${cap}) reached`, 'DAILY_CAP', this.provider.name);
    }
    this.usage.increment(day);
  }

  private async withTimeout<R>(run: (signal: AbortSignal) => Promise<R>): Promise<R> {
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout> | undefined;
    const timeout = new Promise<never>((_, reject) => {
      timer = setTimeout(() => {
        controller.abort();
        reject(new LLMError(`Timed out after ${this.timeoutMs} ms`, 'TIMEOUT', this.provider.name, true));
      }, this.timeoutMs);
    });
    try {
      return await Promise.race([run(controller.signal), timeout]);
    } finally {
      clearTimeout(timer);
    }
  }
}

function toLlmError(error: unknown, provider: string): LLMError {
  if (error instanceof LLMError) return error;
  const status = (error as { status?: number } | null)?.status;
  const message = error instanceof Error ? error.message : String(error);
  if (status === 429 || (status !== undefined && status >= 500)) return new LLMError(message, 'RATE_LIMITED', provider, true);
  if (status === 401 || status === 403) return new LLMError(message, 'AUTH', provider);
  if (status === 400) return new LLMError(message, 'BAD_REQUEST', provider);
  if (error instanceof Error && error.name === 'AbortError') return new LLMError(message, 'TIMEOUT', provider, true);
  // No HTTP status: fetch/DNS/socket failures are worth one more try.
  return new LLMError(message, 'NETWORK', provider, true);
}

// ---- Wiring -------------------------------------------------------------------------------

export interface LlmEnv {
  DEMO_MODE?: string;
  GEMINI_API_KEY?: string;
  GEMINI_MODEL?: string;
}

/** Used when GEMINI_MODEL is unset. Pick another in .env; never the retired `gemini-pro`. */
export const DEFAULT_GEMINI_MODEL = 'gemini-3.6-flash';

/** DEMO_MODE=1 forces the mock; no key also falls back to the mock. */
export function selectProvider(env: LlmEnv): LLMProvider {
  if (env.DEMO_MODE === '1') return new MockLLMProvider();
  if (env.GEMINI_API_KEY) {
    return new GeminiProvider({ apiKey: env.GEMINI_API_KEY, model: env.GEMINI_MODEL || DEFAULT_GEMINI_MODEL });
  }
  return new MockLLMProvider();
}

let client: LLMClient | null = null;

/** Creates the app-wide client. `dailyCap` and the SQLite usage store are read lazily from the DB. */
export function initLLMClient(
  env: LlmEnv = process.env,
  overrides: Partial<LLMClientOptions> = {}
): LLMClient {
  if (client) return client;
  const provider = overrides.provider ?? selectProvider(env);
  console.log(`[llm] provider: ${provider.name}`);
  client = new LLMClient({
    usage: new SqliteUsageStore(),
    dailyCap: () => getSetting('api.call_limit_per_day'),
    ...overrides,
    provider
  });
  return client;
}

export function getLLMClient(): LLMClient {
  return client ?? initLLMClient();
}

export function getLLMProvider(): LLMProvider {
  return getLLMClient().provider;
}

/** Test helper. */
export function setLLMClientForTesting(next: LLMClient | null): void {
  client = next;
}

export { LLMError };
