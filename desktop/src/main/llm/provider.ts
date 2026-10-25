import type { HintContext } from '@wolfie/shared';

export type { HintContext };

/** What a call is for. The mock provider keys its deterministic output on this. */
export type LlmTask =
  | 'hints'
  | 'followup'
  | 'plan'
  | 'ideas'
  | 'paper_answer'
  | 'watch_observe'
  | 'watch_answer'
  | 'generic';

export interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

/** An image as base64 (no data: prefix), ready for Gemini `inlineData`. */
export interface LlmImage {
  mimeType: string;
  data: string;
}

export interface LlmRequest {
  task: LlmTask;
  system: string;
  /** Conversation so far; the last message is the one being answered. Images attach to it. */
  messages: ChatMessage[];
  images?: LlmImage[];
  /** Public YouTube watch URLs the model should watch (Gemini `fileData`). Attach to the last message. */
  videos?: string[];
  /** JSON Schema for the reply (from zod-to-json-schema). Providers may ignore it. */
  jsonSchema?: Record<string, unknown>;
  /** Deterministic inputs for the mock provider (problem id, level, ...). Never sent to a real model. */
  mockKey?: Record<string, unknown>;
  temperature?: number;
  signal?: AbortSignal;
}

/**
 * A model backend. It returns the parsed JSON of one reply; validation, retries, timeouts and the
 * daily cap are the LLMClient's job (client.ts).
 */
export interface LLMProvider {
  name: string;
  /** False for the mock, so demo runs never use up the daily cap. */
  countsTowardCap: boolean;
  generateJson(req: LlmRequest): Promise<unknown>;
}

export type LlmErrorCode =
  | 'TIMEOUT'
  | 'NETWORK'
  | 'RATE_LIMITED'
  /** The provider's daily quota is used up (e.g. Gemini free tier): retrying today won't help. */
  | 'QUOTA'
  | 'AUTH'
  | 'BAD_REQUEST'
  | 'INVALID_JSON'
  | 'SCHEMA'
  | 'DAILY_CAP'
  | 'NOT_CONFIGURED'
  | 'UNKNOWN';

export class LLMError extends Error {
  constructor(
    message: string,
    public readonly code: LlmErrorCode,
    public readonly provider: string,
    /** Whether trying the same request again could help (transient failures only). */
    public readonly retryable: boolean = false
  ) {
    super(message);
    this.name = 'LLMError';
  }
}
