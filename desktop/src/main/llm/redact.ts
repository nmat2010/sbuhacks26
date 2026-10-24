// SPEC 6/7: never log API keys; redact window titles, URLs and page text from debug logs.
// The client only ever logs metadata (task, timing, error code); these helpers scrub the error
// messages that come back from SDKs, which can echo request URLs, keys or prompt fragments.

const KEY_PATTERNS = [
  /AIza[0-9A-Za-z_-]{20,}/g, // Google API keys
  /sk_[0-9a-zA-Z]{16,}/g, // ElevenLabs-style keys
  /xi-api-key["']?\s*[:=]\s*\S+/gi
];
const ASSIGNED_SECRET = /(api[_-]?key|token|secret)(["']?\s*[:=]\s*["']?)[^\s"',&]+/gi;

/** Removes API keys and URLs, collapses whitespace, and caps the length. */
export function redactForLog(input: unknown, maxLength = 200): string {
  let text = input instanceof Error ? input.message : String(input);
  for (const pattern of KEY_PATTERNS) text = text.replace(pattern, '[redacted-key]');
  text = text.replace(ASSIGNED_SECRET, '$1$2[redacted]');
  text = text.replace(/https?:\/\/[^\s"')]+/g, '[url]');
  text = text.replace(/\s+/g, ' ').trim();
  return text.length > maxLength ? `${text.slice(0, maxLength)}...` : text;
}
