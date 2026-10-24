import { randomInt, timingSafeEqual } from 'crypto';

// The 6-digit code the web app types to pair with the desktop (SPEC Phase 10). It lives in
// memory: valid for ttlMs or until used, then replaced. Wrong guesses are rate limited, since the
// LAN socket is reachable by anyone on the network.

export type CodeCheck = 'ok' | 'bad' | 'locked';

export interface PairingCodeOptions {
  now(): number;
  ttlMs?: number;
  /** Failed guesses allowed per window before pairing locks. */
  maxFailures?: number;
  failureWindowMs?: number;
  /** Test hook: returns a number in [0, 1000000). */
  randomCode?: () => number;
}

export class PairingCode {
  private code = '';
  private expiresAt = 0;
  private failures: number[] = [];

  constructor(private readonly opts: PairingCodeOptions) {
    this.regenerate();
  }

  private get ttl(): number {
    return this.opts.ttlMs ?? 10 * 60_000;
  }

  /** Current code, replaced first if it has expired. */
  current(): { code: string; expiresAt: number } {
    if (this.opts.now() >= this.expiresAt) this.regenerate();
    return { code: this.code, expiresAt: this.expiresAt };
  }

  regenerate(): { code: string; expiresAt: number } {
    const n = this.opts.randomCode ? this.opts.randomCode() : randomInt(0, 1_000_000);
    this.code = String(n).padStart(6, '0');
    this.expiresAt = this.opts.now() + this.ttl;
    return { code: this.code, expiresAt: this.expiresAt };
  }

  /** Checks a guess. A correct guess consumes the code (a new one is generated). */
  check(guess: string): CodeCheck {
    const now = this.opts.now();
    const windowMs = this.opts.failureWindowMs ?? 60_000;
    this.failures = this.failures.filter((t) => now - t < windowMs);
    if (this.failures.length >= (this.opts.maxFailures ?? 5)) return 'locked';

    const { code } = this.current();
    const a = Buffer.from(code);
    const b = Buffer.from(guess.padEnd(6).slice(0, 6));
    const ok = guess.length === 6 && timingSafeEqual(a, b);
    if (!ok) {
      this.failures.push(now);
      return 'bad';
    }
    this.regenerate();
    return 'ok';
  }
}
