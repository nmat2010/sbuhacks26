import type { HintContext, HintResponse, HintSourceType } from '@wolfie/shared';

export type { HintContext };

export interface LLMProvider {
  name: string;
  requestHints(context: HintContext, source: HintSourceType, assessment: boolean): Promise<HintResponse>;
  chatCompletion(messages: ChatMessage[], schema?: unknown): Promise<unknown>;
}

export interface ChatMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
}

export class LLMError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly provider: string
  ) {
    super(message);
    this.name = 'LLMError';
  }
}
