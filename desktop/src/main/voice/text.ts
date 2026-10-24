// Small text helpers shared by the voice modules.

/** Lowercase, drop punctuation (keeping letters, digits and spaces), collapse whitespace. */
export function normalizeText(text: string): string {
  return text
    .toLowerCase()
    .replace(/[’']/g, '') // I'm -> im, don't -> dont
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

const ABBREVIATIONS = /\b(?:e\.g|i\.e|etc|vs|dr|mr|mrs|ms|fig|eq|no|approx)\.$/i;

/** Splits into sentences without breaking on decimals ("2.5") or common abbreviations ("e.g."). */
export function splitSentences(text: string): string[] {
  const trimmed = text.trim();
  if (!trimmed) return [];
  const pieces = trimmed.split(/(?<=[.!?])\s+/);
  const sentences: string[] = [];
  for (const piece of pieces) {
    const prev = sentences[sentences.length - 1];
    if (prev && (ABBREVIATIONS.test(prev) || !/^[A-Z0-9"'(“]/.test(piece))) {
      sentences[sentences.length - 1] = `${prev} ${piece}`;
    } else {
      sentences.push(piece);
    }
  }
  return sentences;
}

/** Wolfie speaks the first two sentences of a hint; the bubble shows the whole thing (SPEC 4e). */
export function firstSentences(text: string, count = 2): string {
  return splitSentences(text).slice(0, count).join(' ');
}
