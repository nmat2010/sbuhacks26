import type Database from 'better-sqlite3';
import type { StruggleSignal } from '@wolfie/shared';

// Where every struggle signal ends up (A6): the `web_signals` table (all signals, web and desktop,
// tagged with their source in meta_json), the generic `events` log, and stuckBus 'signal' for the
// escalation engine (Agent B). Signals outside an active session are dropped (nothing is
// monitored outside a session, and web_signals.session_id is NOT NULL).

export type SignalSource = 'extension' | 'desktop';

export interface SignalSinkDeps {
  db: () => Database.Database;
  getSession: () => { id: string } | null;
  isPaused: () => boolean;
  emit: (signal: StruggleSignal) => void;
  logEvent: (type: `${string}.${string}`, payload: Record<string, unknown>) => void;
  now: () => number;
}

/** Keeps small primitive metadata only: signals must never carry page text. */
export function sanitizeMetadata(meta: Record<string, unknown> | undefined): Record<string, string | number | boolean> {
  const out: Record<string, string | number | boolean> = {};
  if (!meta) return out;
  for (const [key, value] of Object.entries(meta).slice(0, 8)) {
    if (typeof value === 'number' || typeof value === 'boolean') out[key.slice(0, 32)] = value;
    else if (typeof value === 'string') out[key.slice(0, 32)] = value.slice(0, 64);
  }
  return out;
}

export class SignalSink {
  constructor(private readonly deps: SignalSinkDeps) {}

  /** Returns true if the signal was accepted. */
  accept(signal: StruggleSignal, source: SignalSource): boolean {
    const { deps } = this;
    const session = deps.getSession();
    if (!session || deps.isPaused()) return false;

    const clean: StruggleSignal = {
      ...signal,
      metadata: sanitizeMetadata(signal.metadata as Record<string, unknown> | undefined)
    };
    try {
      deps
        .db()
        .prepare('INSERT INTO web_signals (session_id, ts, type, strength, meta_json) VALUES (?, ?, ?, ?, ?)')
        .run(session.id, clean.timestamp, clean.type, clean.strength, JSON.stringify({ ...clean.metadata, source, problemId: clean.problemId ?? null }));
      deps.logEvent('stuck.signal', { type: clean.type, strength: clean.strength, source, problemId: clean.problemId ?? null });
    } catch (error) {
      console.error('[signals] failed to store signal:', error instanceof Error ? error.message : error);
    }
    deps.emit(clean);
    return true;
  }
}
