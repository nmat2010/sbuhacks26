import { parseIntent } from './intents.js';
import { normalizeText } from './text.js';

// Echo suppression (SPEC Phase 1): without headphones the mic hears Wolfie's own voice. We
// compare incoming transcripts to the text just spoken and drop the ones that match, so Wolfie
// neither barges in on itself nor answers itself.

export interface EchoGuardOptions {
  /** How long after speech ends transcripts can still be an echo (STT latency, room reverb). */
  tailMs?: number;
  /** Fraction of the transcript's words that must appear in the spoken text. */
  overlap?: number;
}

interface Utterance {
  tokens: string[];
  startedAt: number;
  endedAt: number | null;
}

export class EchoGuard {
  private readonly tailMs: number;
  private readonly overlap: number;
  private recent: Utterance[] = [];

  constructor(opts: EchoGuardOptions = {}) {
    this.tailMs = opts.tailMs ?? 4_000;
    this.overlap = opts.overlap ?? 0.75;
  }

  /** Call when TTS starts playing `text`. */
  speakingStarted(text: string, at: number): void {
    this.recent.push({ tokens: normalizeText(text).split(' ').filter(Boolean), startedAt: at, endedAt: null });
    this.prune(at);
  }

  /** Call when playback finishes or is interrupted. */
  speakingEnded(at: number): void {
    const last = this.recent[this.recent.length - 1];
    if (last && last.endedAt === null) last.endedAt = at;
  }

  isSpeaking(): boolean {
    const last = this.recent[this.recent.length - 1];
    return !!last && last.endedAt === null;
  }

  /**
   * True if `transcript` looks like Wolfie's own speech picked up by the mic. Short transcripts
   * ("stop") are only echoes if they appear verbatim in the spoken text and are not a command,
   * so a student can always talk over Wolfie with a command.
   */
  isEcho(transcript: string, now: number): boolean {
    this.prune(now);
    const words = normalizeText(transcript).split(' ').filter(Boolean);
    if (words.length === 0) return false;
    const live = this.recent.filter((u) => u.endedAt === null || now - u.endedAt <= this.tailMs);
    if (live.length === 0) return false;

    if (words.length < 3 && parseIntent(transcript) !== null) return false;

    for (const u of live) {
      if (words.length < 3) {
        if (containsRun(u.tokens, words)) return true;
        continue;
      }
      const set = new Set(u.tokens);
      const hits = words.filter((w) => set.has(w)).length;
      if (hits / words.length >= this.overlap) return true;
    }
    return false;
  }

  private prune(now: number): void {
    this.recent = this.recent.filter((u) => u.endedAt === null || now - u.endedAt <= this.tailMs * 3);
  }
}

function containsRun(haystack: string[], needle: string[]): boolean {
  outer: for (let i = 0; i + needle.length <= haystack.length; i++) {
    for (let j = 0; j < needle.length; j++) if (haystack[i + j] !== needle[j]) continue outer;
    return true;
  }
  return false;
}
