import { LLMProvider } from './provider.js';
import { GeminiProvider } from './gemini-provider.js';
import { MockLLMProvider } from './mock-provider.js';

let provider: LLMProvider | null = null;

export function initLLMProvider(): LLMProvider {
  if (provider) return provider;

  const demoMode = process.env.DEMO_MODE === '1';
  const apiKey = process.env.GEMINI_API_KEY;

  if (demoMode) {
    console.log('Initializing LLM provider: MOCK (demo mode)');
    provider = new MockLLMProvider();
  } else if (apiKey) {
    console.log('Initializing LLM provider: Gemini');
    provider = new GeminiProvider(apiKey);
  } else {
    console.log('No API key found, falling back to MOCK provider');
    provider = new MockLLMProvider();
  }

  return provider;
}

export function getLLMProvider(): LLMProvider {
  if (!provider) {
    return initLLMProvider();
  }
  return provider;
}
