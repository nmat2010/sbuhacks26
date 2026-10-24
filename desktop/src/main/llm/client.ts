import { LLMProvider } from './provider.js';
import { ClaudeProvider } from './claude-provider.js';
import { MockLLMProvider } from './mock-provider.js';

let provider: LLMProvider | null = null;

export function initLLMProvider(): LLMProvider {
  if (provider) return provider;

  const demoMode = process.env.DEMO_MODE === '1';
  const apiKey = process.env.ANTHROPIC_API_KEY;

  if (demoMode) {
    console.log('Initializing LLM provider: MOCK (demo mode)');
    provider = new MockLLMProvider();
  } else if (apiKey) {
    console.log('Initializing LLM provider: Claude');
    provider = new ClaudeProvider(apiKey);
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
