import { describe, expect, it } from 'vitest';
import { isUnaskedOffer, MAX_SPOKEN_CHARS, spokenReply } from '../read-aloud.js';

describe('spokenReply', () => {
  it('reads a short reply as is, without the source label paragraph', () => {
    expect(spokenReply('Overfitting means the model memorized the data.')).toBe('Overfitting means the model memorized the data.');
    expect(spokenReply('PCA finds the main directions.\n\nGeneral knowledge (not from your sources)')).toBe('PCA finds the main directions.');
    expect(spokenReply('Look again at step 2.\n\nFrom your session')).toBe('Look again at step 2.');
  });

  it('a long reply is read up to a sentence boundary within the limit', () => {
    const sentence = 'This sentence is exactly fifty characters long ok. ';
    const text = sentence.repeat(30);
    const out = spokenReply(text);
    expect(out.length).toBeLessThanOrEqual(MAX_SPOKEN_CHARS);
    expect(out.endsWith('ok.')).toBe(true);
  });

  it('one huge sentence is cut at a word', () => {
    const out = spokenReply('word '.repeat(400).trim(), 100);
    expect(out.length).toBeLessThanOrEqual(103);
    expect(out.endsWith('word...')).toBe(true);
  });
});

describe('isUnaskedOffer', () => {
  it('is the "Want a hint?" offer, not a hint step', () => {
    expect(isUnaskedOffer({ buttons: [{ label: 'Yes, give me a hint', action: 'accept_hint' }] })).toBe(true);
    expect(isUnaskedOffer({ buttons: [{ label: 'Another hint', action: 'another_hint' }] })).toBe(false);
    expect(isUnaskedOffer({})).toBe(false);
  });
});
