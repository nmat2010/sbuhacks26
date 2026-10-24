import { createHash, randomBytes, timingSafeEqual } from 'crypto';

// Extension pairing token (SPEC Phase 2): generated once, shown in Wolfie's settings, typed once
// into the extension popup. Human-friendly (no 0/O/1/I), compared in constant time.

const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // 32 symbols

export function generateToken(bytes = randomBytes): string {
  const raw = bytes(12);
  let out = '';
  for (let i = 0; i < 12; i++) out += ALPHABET[raw[i] % ALPHABET.length];
  return `${out.slice(0, 4)}-${out.slice(4, 8)}-${out.slice(8, 12)}`;
}

/** Ignores case, dashes and whitespace so a pasted or retyped token still matches. */
export function normalizeToken(token: string): string {
  return token.replace(/[^A-Za-z0-9]/g, '').toUpperCase();
}

export function tokensMatch(expected: string | null, given: string): boolean {
  if (!expected) return false;
  const a = createHash('sha256').update(normalizeToken(expected)).digest();
  const b = createHash('sha256').update(normalizeToken(given)).digest();
  return timingSafeEqual(a, b);
}

export interface TokenStore {
  get(): string | null;
  set(token: string): void;
}

/** Returns the stored token, creating and storing one on first use. */
export function ensureToken(store: TokenStore): string {
  const existing = store.get();
  if (existing) return existing;
  const token = generateToken();
  store.set(token);
  return token;
}
