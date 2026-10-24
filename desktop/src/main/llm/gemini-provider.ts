import { HintResponse } from '@wolfie/shared';
import { LLMProvider, HintContext, ChatMessage, LLMError } from './provider.js';

export class GeminiProvider implements LLMProvider {
  name = 'gemini';
  private apiKey: string;
  private baseUrl = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-pro:generateContent';

  constructor(apiKey: string) {
    if (!apiKey) {
      throw new Error('Gemini API key is required');
    }
    this.apiKey = apiKey;
  }

  async requestHints(context: HintContext): Promise<HintResponse> {
    // TODO: Implement Gemini API call for hint generation
    // This will be implemented by Tuan in Phase 4
    throw new LLMError(
      'Gemini provider not yet implemented. Use DEMO_MODE=1 for testing.',
      'NOT_IMPLEMENTED',
      'gemini'
    );
  }

  async chatCompletion(messages: ChatMessage[], schema?: any): Promise<any> {
    // TODO: Implement Gemini API call for chat completion
    // This will be implemented by Tuan
    throw new LLMError(
      'Gemini provider not yet implemented. Use DEMO_MODE=1 for testing.',
      'NOT_IMPLEMENTED',
      'gemini'
    );
  }

  private async callGemini(
    messages: ChatMessage[],
    schema?: any,
    maxRetries = 1
  ): Promise<any> {
    // TODO: Implement actual Gemini API call with retry logic
    throw new LLMError(
      'Gemini provider not yet implemented',
      'NOT_IMPLEMENTED',
      'gemini'
    );
  }
}
