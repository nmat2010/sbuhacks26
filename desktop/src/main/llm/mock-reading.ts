import { firstSentences } from '../voice/text.js';

// Deterministic paper answers for DEMO_MODE and tests. Like the real model, it only uses the
// excerpts it is given (via mockKey) and never claims a citation it was not handed.

interface Excerpt {
  n: number;
  section: string;
  text: string;
}

export function mockReading(key: Record<string, unknown> | undefined): { grounded: boolean; answer: string; citations: number[] } {
  const excerpts = (key?.excerpts as Excerpt[] | undefined) ?? [];
  const covered = key?.covered === true && excerpts.length > 0;
  const mode = key?.mode;
  const question = String(key?.question ?? '');

  if (!covered) {
    return {
      grounded: false,
      citations: [],
      answer:
        mode === 'check'
          ? 'In your own words, what is the main idea of the part of the paper you are reading right now?'
          : `A short general answer: ${question ? `"${question.replace(/[?.!]+$/, '')}"` : 'that topic'} is background knowledge rather than something this paper explains, so it is worth looking up in a textbook or a survey.`
    };
  }
  const best = excerpts[0];
  if (mode === 'check') {
    return {
      grounded: true,
      citations: [best.n],
      answer: `In your own words, what is the main point of the "${best.section}" part, and why does it matter for the paper's argument?`
    };
  }
  return {
    grounded: true,
    citations: [best.n],
    answer: `In simple terms: ${firstSentences(best.text.replace(/\s+/g, ' '), 2)}`
  };
}
