import { GoogleGenAI } from '@google/genai';
import { LLMError, type LLMProvider, type LlmRequest } from './provider.js';
import { sanitizeForGemini } from './schema.js';

// Gemini via @google/genai: models.generateContent with responseMimeType application/json and a
// responseJsonSchema. Images go in as inlineData parts on the last user message. The SDK is
// injected as a minimal interface so tests never touch the network.

export interface GenAiLike {
  models: {
    generateContent(params: {
      model: string;
      contents: Array<{ role: 'user' | 'model'; parts: Array<Record<string, unknown>> }>;
      config?: Record<string, unknown>;
    }): Promise<{ text?: string | undefined }>;
  };
}

export interface GeminiProviderOptions {
  apiKey: string;
  model: string;
  /** Test seam; defaults to the real SDK client. */
  sdk?: GenAiLike;
}

export class GeminiProvider implements LLMProvider {
  readonly name = 'gemini';
  readonly countsTowardCap = true;
  private readonly model: string;
  private readonly sdk: GenAiLike;

  constructor(opts: GeminiProviderOptions) {
    if (!opts.apiKey && !opts.sdk) throw new Error('Gemini API key is required');
    if (!opts.model || /^gemini-pro$/.test(opts.model)) {
      throw new Error('Set GEMINI_MODEL to a current Gemini model (gemini-pro is retired)');
    }
    this.model = opts.model;
    this.sdk = opts.sdk ?? (new GoogleGenAI({ apiKey: opts.apiKey }) as unknown as GenAiLike);
  }

  async generateJson(req: LlmRequest): Promise<unknown> {
    const lastUser = req.messages.length - 1;
    const contents = req.messages.map((m, i) => {
      const parts: Array<Record<string, unknown>> = [{ text: m.content }];
      if (i === lastUser && req.images?.length) {
        for (const image of req.images) parts.push({ inlineData: { mimeType: image.mimeType, data: image.data } });
      }
      // Gemini watches public YouTube videos given by URL (video understanding, fileData)
      if (i === lastUser && req.videos?.length) {
        for (const uri of req.videos) parts.unshift({ fileData: { fileUri: uri } });
      }
      return { role: m.role === 'assistant' ? ('model' as const) : ('user' as const), parts };
    });

    const config: Record<string, unknown> = {
      systemInstruction: req.system,
      responseMimeType: 'application/json',
      abortSignal: req.signal
    };
    if (req.jsonSchema) config.responseJsonSchema = sanitizeForGemini(req.jsonSchema);
    if (req.temperature !== undefined) config.temperature = req.temperature;

    // SDK errors carry an HTTP `status`; the client maps it (429/5xx retry, 401/403 auth).
    const { text } = await this.sdk.models.generateContent({ model: this.model, contents, config });
    if (!text) throw new LLMError('Gemini returned no text', 'INVALID_JSON', this.name);
    try {
      return JSON.parse(stripCodeFence(text));
    } catch {
      throw new LLMError('Gemini reply was not valid JSON', 'INVALID_JSON', this.name);
    }
  }
}

function stripCodeFence(text: string): string {
  const fenced = /^\s*```(?:json)?\s*([\s\S]*?)\s*```\s*$/.exec(text);
  return fenced ? fenced[1] : text;
}
