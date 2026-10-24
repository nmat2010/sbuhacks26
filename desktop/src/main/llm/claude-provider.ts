import { HintResponse } from '@wolfie/shared';
import { LLMProvider, HintContext, ChatMessage, LLMError } from './provider.js';

export class ClaudeProvider implements LLMProvider {
  name = 'claude';
  private apiKey: string;
  private baseUrl = 'https://api.anthropic.com/v1/messages';

  constructor(apiKey: string) {
    if (!apiKey) {
      throw new Error('Claude API key is required');
    }
    this.apiKey = apiKey;
  }

  async requestHints(context: HintContext): Promise<HintResponse> {
    // TODO: Implement Claude API call for hint generation
    // This will be implemented by Tuan in Phase 4
    throw new LLMError(
      'Claude provider not yet implemented. Use DEMO_MODE=1 for testing.',
      'NOT_IMPLEMENTED',
      'claude'
    );
  }

  async chatCompletion(messages: ChatMessage[], schema?: any): Promise<any> {
    // TODO: Implement Claude API call for chat completion
    // This will be implemented by Tuan
    throw new LLMError(
      'Claude provider not yet implemented. Use DEMO_MODE=1 for testing.',
      'NOT_IMPLEMENTED',
      'claude'
    );
  }

  private async callClaude(
    messages: ChatMessage[],
    schema?: any,
    maxRetries = 1
  ): Promise<any> {
    // TODO: Implement actual Claude API call with retry logic
    throw new LLMError(
      'Claude provider not yet implemented',
      'NOT_IMPLEMENTED',
      'claude'
    );
  }
}
