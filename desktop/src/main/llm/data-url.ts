import type { LlmImage } from './provider.js';

const MAX_IMAGE_BYTES = 12 * 1024 * 1024;

/** Decodes `data:image/png;base64,...` into the pieces Gemini's `inlineData` needs. */
export function parseImageDataUrl(dataUrl: string): LlmImage {
  const match = /^data:(image\/[a-zA-Z0-9.+-]+);base64,([A-Za-z0-9+/=\s]+)$/.exec(dataUrl);
  if (!match) throw new Error('Expected a base64 image data URL');
  const data = match[2].replace(/\s+/g, '');
  if (Math.floor((data.length * 3) / 4) > MAX_IMAGE_BYTES) throw new Error('Image is too large');
  return { mimeType: match[1], data };
}
