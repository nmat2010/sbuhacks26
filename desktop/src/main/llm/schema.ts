import type { z } from 'zod';
import { zodToJsonSchema } from 'zod-to-json-schema';

// Gemini's responseJsonSchema accepts only a subset of JSON Schema.
const ALLOWED_KEYS = new Set([
  '$id',
  '$defs',
  '$ref',
  '$anchor',
  'type',
  'format',
  'title',
  'description',
  'enum',
  'items',
  'prefixItems',
  'minItems',
  'maxItems',
  'minimum',
  'maximum',
  'anyOf',
  'oneOf',
  'properties',
  'additionalProperties',
  'required',
  'propertyOrdering'
]);

/** Drops keywords Gemini does not support (maxLength, default, $schema, ...). */
export function sanitizeForGemini(schema: unknown): unknown {
  if (Array.isArray(schema)) return schema.map(sanitizeForGemini);
  if (schema === null || typeof schema !== 'object') return schema;
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(schema as Record<string, unknown>)) {
    if (!ALLOWED_KEYS.has(key)) continue;
    if ((key === 'properties' || key === '$defs') && value && typeof value === 'object') {
      // Keys here are property names, not keywords, so only the values are schemas.
      out[key] = Object.fromEntries(Object.entries(value).map(([k, v]) => [k, sanitizeForGemini(v)]));
    } else if (key === 'enum' || key === 'required') {
      out[key] = value;
    } else {
      out[key] = sanitizeForGemini(value);
    }
  }
  return out;
}

/** JSON Schema for a Zod type, with refs inlined so providers can send it as is. */
export function toJsonSchema(schema: z.ZodTypeAny): Record<string, unknown> {
  const json = zodToJsonSchema(schema, { $refStrategy: 'none', target: 'jsonSchema7' }) as Record<string, unknown>;
  delete json.$schema;
  return json;
}
