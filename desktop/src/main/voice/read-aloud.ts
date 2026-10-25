import type { NudgeButtonType } from '@wolfie/shared';
import { ACTIONS } from '../stuck/actions.js';
import { splitSentences } from './text.js';

// Wolfie reads his chat replies aloud (settings voice.read_replies, separate from voice mode's
// microphone): answers to questions and help steps, not the automatic "Want a hint?" offer, which
// stays a quiet bubble. Long replies are read up to a sentence boundary (ElevenLabs bills per
// character); the chat shows the whole reply.

/** About a minute of speech. */
export const MAX_SPOKEN_CHARS = 900;

/** The automatic offer ("Want a hint?" with Yes / Not now): nobody asked for it, so it isn't read. */
export function isUnaskedOffer(nudge: { buttons?: NudgeButtonType[] }): boolean {
  return (nudge.buttons ?? []).some((b) => b.action === ACTIONS.ACCEPT_HINT);
}

/** Explanations carry their source label as a last paragraph; it is shown, not read. */
const LABEL_PARAGRAPH = /\n\n(From your session|General knowledge \(not from your sources\)|Hint \(homework mode: no final answers\))\s*$/;

/** The reply as it is read: without the label, whole sentences up to MAX_SPOKEN_CHARS. */
export function spokenReply(text: string, maxChars = MAX_SPOKEN_CHARS): string {
  const clean = text.replace(LABEL_PARAGRAPH, '').replace(/\s+/g, ' ').trim();
  if (clean.length <= maxChars) return clean;
  let out = '';
  for (const sentence of splitSentences(clean)) {
    const next = out ? `${out} ${sentence}` : sentence;
    if (next.length > maxChars) break;
    out = next;
  }
  // One sentence longer than the limit: cut at a word
  return out || `${clean.slice(0, maxChars).replace(/\s+\S*$/, '')}...`;
}
