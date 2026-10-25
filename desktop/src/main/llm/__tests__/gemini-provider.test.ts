import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { GeminiProvider, type GenAiLike } from '../gemini-provider.js';
import { parseImageDataUrl } from '../data-url.js';
import { sanitizeForGemini, toJsonSchema } from '../schema.js';
import { redactForLog } from '../redact.js';
import { renderPrompt, PROMPTS } from '../prompts/index.js';
import { LLMError } from '../provider.js';

function fakeSdk(text: string | undefined, seen: unknown[] = []): GenAiLike {
  return {
    models: {
      async generateContent(params) {
        seen.push(params);
        return { text };
      }
    }
  };
}

describe('GeminiProvider (fake SDK)', () => {
  it('sends JSON mode, a sanitized schema, the system prompt, and images as inlineData', async () => {
    const seen: Array<Record<string, any>> = [];
    const provider = new GeminiProvider({ apiKey: 'k', model: 'gemini-3.6-flash', sdk: fakeSdk('{"answer":"hi"}', seen) });
    const schema = z.object({ answer: z.string().max(10).default('x') });
    const controller = new AbortController();
    const out = await provider.generateJson({
      task: 'generic',
      system: 'be nice',
      messages: [
        { role: 'user', content: 'first' },
        { role: 'assistant', content: 'reply' },
        { role: 'user', content: 'look at this' }
      ],
      images: [{ mimeType: 'image/png', data: 'QUJD' }],
      jsonSchema: toJsonSchema(schema),
      temperature: 0.2,
      signal: controller.signal
    });
    expect(out).toEqual({ answer: 'hi' });
    const p = seen[0];
    expect(p.model).toBe('gemini-3.6-flash');
    expect(p.config.responseMimeType).toBe('application/json');
    expect(p.config.systemInstruction).toBe('be nice');
    expect(p.config.abortSignal).toBe(controller.signal);
    expect(p.config.temperature).toBe(0.2);
    expect(JSON.stringify(p.config.responseJsonSchema)).not.toMatch(/maxLength|default|\$schema/);
    expect(p.contents.map((c: any) => c.role)).toEqual(['user', 'model', 'user']);
    expect(p.contents[0].parts).toHaveLength(1);
    expect(p.contents[2].parts[1]).toEqual({ inlineData: { mimeType: 'image/png', data: 'QUJD' } });
  });

  it('accepts a fenced JSON reply and rejects empty or non-JSON replies as INVALID_JSON', async () => {
    const req = { task: 'generic' as const, system: '', messages: [{ role: 'user' as const, content: 'x' }] };
    const fenced = new GeminiProvider({ apiKey: 'k', model: 'm', sdk: fakeSdk('```json\n{"a":1}\n```') });
    expect(await fenced.generateJson(req)).toEqual({ a: 1 });
    for (const text of [undefined, 'not json']) {
      const p = new GeminiProvider({ apiKey: 'k', model: 'm', sdk: fakeSdk(text) });
      await expect(p.generateJson(req)).rejects.toMatchObject({ code: 'INVALID_JSON' });
    }
  });

  it('lets SDK errors through for the client to classify', async () => {
    const sdk: GenAiLike = {
      models: {
        async generateContent() {
          throw Object.assign(new Error('rate limited'), { status: 429 });
        }
      }
    };
    const p = new GeminiProvider({ apiKey: 'k', model: 'm', sdk });
    await expect(p.generateJson({ task: 'generic', system: '', messages: [{ role: 'user', content: 'x' }] })).rejects.not.toBeInstanceOf(LLMError);
  });

  it('refuses to start without a model or with the retired one', () => {
    expect(() => new GeminiProvider({ apiKey: 'k', model: '' })).toThrow();
    expect(() => new GeminiProvider({ apiKey: 'k', model: 'gemini-pro' })).toThrow();
  });
});

describe('helpers', () => {
  it('decodes image data URLs and rejects anything else', () => {
    expect(parseImageDataUrl('data:image/png;base64,QUJD')).toEqual({ mimeType: 'image/png', data: 'QUJD' });
    expect(() => parseImageDataUrl('data:text/plain;base64,QUJD')).toThrow();
    expect(() => parseImageDataUrl('not a url')).toThrow();
  });

  it('sanitizes JSON Schema for Gemini without dropping property names', () => {
    const out = sanitizeForGemini({
      $schema: 'x',
      type: 'object',
      properties: { default: { type: 'string', maxLength: 5 }, n: { type: 'integer', minimum: 1, default: 3 } },
      required: ['n'],
      additionalProperties: false
    }) as any;
    expect(out).toEqual({
      type: 'object',
      properties: { default: { type: 'string' }, n: { type: 'integer', minimum: 1 } },
      required: ['n'],
      additionalProperties: false
    });
  });

  it('redacts keys and URLs', () => {
    const text = redactForLog('GET https://x.test/a?b=1 apiKey=abc123 AIzaSyA1234567890abcdefghijklmn');
    expect(text).not.toMatch(/x\.test|abc123|AIza/);
  });

  it('renders versioned prompt files', () => {
    expect(Object.keys(PROMPTS)).toContain('tutor.v1');
    const text = renderPrompt('tutor.v1', { assessment_rules: 'ASSESSMENT-RULES-HERE' });
    expect(text).toContain('ASSESSMENT-RULES-HERE');
    expect(text).not.toContain('{{');
    expect(text).toMatch(/nudge/);
  });
});

describe('GeminiProvider videos (Watch mode)', () => {
  it('attaches YouTube URLs as fileData parts on the last message', async () => {
    const seen: Array<Record<string, any>> = [];
    const provider = new GeminiProvider({ apiKey: 'k', model: 'm', sdk: fakeSdk('{"a":1}', seen) });
    await provider.generateJson({
      task: 'watch_answer',
      system: 's',
      messages: [
        { role: 'user', content: 'first' },
        { role: 'assistant', content: 'reply' },
        { role: 'user', content: 'what did he say?' }
      ],
      videos: ['https://www.youtube.com/watch?v=abcdef123']
    });
    const contents = seen[0].contents as Array<{ parts: Array<Record<string, unknown>> }>;
    expect(contents[0].parts).toEqual([{ text: 'first' }]);
    expect(contents[2].parts).toEqual([{ fileData: { fileUri: 'https://www.youtube.com/watch?v=abcdef123' } }, { text: 'what did he say?' }]);
  });
});
