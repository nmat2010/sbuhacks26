import { HintResponse } from '@wolfie/shared';

export interface LLMProvider {
  name: string;
  requestHints(context: HintContext): Promise<HintResponse>;
  chatCompletion(messages: ChatMessage[], schema?: any): Promise<any>;
}

export interface HintContext {
  sessionId: string;
  source: 'screen' | 'page' | 'handwriting' | 'camera';
  trigger: 'auto' | 'manual' | 'voice';
  assessment: boolean;
  imagePath?: string;
  pageSummary?: any;
  conversationHistory?: ChatMessage[];
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
