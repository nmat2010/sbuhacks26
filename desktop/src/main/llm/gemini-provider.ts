import { HintResponse, HintSourceType } from '@wolfie/shared';
import { LLMProvider, HintContext, ChatMessage, LLMError } from './provider.js';

// Stub. Agent B (B1) implements this with @google/genai and a current Gemini model;
// `gemini-pro` below is retired and must not be used.

export class GeminiProvider implements LLMProvider {
  name = 'gemini';
  protected readonly apiKey: string;

  constructor(apiKey: string) {
    if (!apiKey) {
      throw new Error('Gemini API key is required');
    }
    this.apiKey = apiKey;
  }

  async requestHints(_context: HintContext, _source: HintSourceType, _assessment: boolean): Promise<HintResponse> {
    // TODO: Implement Gemini API call for hint generation
    // This will be implemented by Tuan in Phase 4
    throw new LLMError(
      'Gemini provider not yet implemented. Use DEMO_MODE=1 for testing.',
      'NOT_IMPLEMENTED',
      'gemini'
    );
  }

  async chatCompletion(_messages: ChatMessage[], _schema?: unknown): Promise<unknown> {
    // TODO: Implement Gemini API call for chat completion
    // This will be implemented by Tuan
    throw new LLMError(
      'Gemini provider not yet implemented. Use DEMO_MODE=1 for testing.',
      'NOT_IMPLEMENTED',
      'gemini'
    );
  }
}
