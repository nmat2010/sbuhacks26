import { createHmac, randomBytes, randomUUID, timingSafeEqual } from 'crypto';
import type { NetworkInterfaceInfo } from 'os';

// Web app authentication (shared/src/schemas/sync.ts):
//   server -> auth.challenge { nonce }
//   client -> auth.hello { deviceId, hmac }   hmac = hex(HMAC-SHA256(key = secret, data = nonce))
// Both `secret` and `nonce` are used as UTF-8 strings exactly as sent over the wire (the secret is
// a 64-char hex string, the nonce a 32-char hex string); the digest is lower-case hex.

export function newNonce(): string {
  return randomBytes(16).toString('hex');
}

export function newSecret(): string {
  return randomBytes(32).toString('hex');
}

export function newDeviceId(): string {
  return randomUUID();
}

export function computeHmac(secret: string, nonce: string): string {
  return createHmac('sha256', secret).update(nonce).digest('hex');
}

export function verifyHmac(secret: string, nonce: string, given: string): boolean {
  const expected = Buffer.from(computeHmac(secret, nonce));
  const actual = Buffer.from(given.toLowerCase());
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}

/** Non-internal IPv4 addresses, for the pairing screen / QR code. Wi-Fi/Ethernet first. */
export function lanAddresses(interfaces: Record<string, NetworkInterfaceInfo[] | undefined>): string[] {
  const out: { name: string; address: string }[] = [];
  for (const [name, infos] of Object.entries(interfaces)) {
    for (const info of infos ?? []) {
      if (info.family === 'IPv4' && !info.internal && !info.address.startsWith('169.254.')) {
        out.push({ name, address: info.address });
      }
    }
  }
  const rank = (n: string) => (/^(en0|en1|wlan|wl|eth|wi-?fi|ethernet)/i.test(n) ? 0 : 1);
  return out.sort((a, b) => rank(a.name) - rank(b.name)).map((e) => e.address);
}
