// Keyword retrieval with BM25 (no vector database). Tokens are lowercase words with a light
// suffix stemmer and a stop-word list; the section heading is indexed with each chunk so a
// question that names a section ("what did the method section say?") finds it.

const STOP_WORDS = new Set(
  `a about above after again against all also am an and any are as at be because been before being below between both but by can could did do does doing down during each few for from further had has have having he her here hers him his how i if in into is it its itself just me more most my myself no nor not now of off on once only or other our out over own same she should so some such than that the their them then there these they this those through to too under until up very was we were what when where which while who whom why will with would you your yours paper papers authors author study section says say mean means meant`
    .split(/\s+/)
);

/** Tiny stemmer: enough to match "quizzes" with "quiz" and "spacing" with "spaced". */
export function stem(word: string): string {
  let w = word;
  if (w.length > 4 && w.endsWith('ies')) return `${w.slice(0, -3)}y`;
  if (w.length > 5 && w.endsWith('zzes')) return w.slice(0, -3); // quizzes -> quiz
  if (w.length > 5 && w.endsWith('ing')) w = w.slice(0, -3);
  else if (w.length > 4 && w.endsWith('ed')) w = w.slice(0, -2);
  else if (w.length > 4 && w.endsWith('es')) w = w.slice(0, -2);
  else if (w.length > 3 && w.endsWith('s') && !w.endsWith('ss')) w = w.slice(0, -1);
  // "spac(ing)" and "spac(ed)" both end up as "spac"; drop a trailing e for "space"/"spaced"
  if (w.length > 3 && w.endsWith('e')) w = w.slice(0, -1);
  return w;
}

export function tokenize(text: string): string[] {
  return (text.toLowerCase().match(/[a-z0-9]+/g) ?? []).filter((t) => t.length > 1 && !STOP_WORDS.has(t)).map(stem);
}

export interface IndexedDoc {
  id: number;
  section: string;
  text: string;
}

export interface SearchHit {
  id: number;
  score: number;
  /**
   * How much of the question the chunk covers, weighted by how rare each term is (0..1). A term
   * the paper never uses counts as very rare, so "how does photosynthesis work" scores low even
   * though "work" appears in the paper.
   */
  coverage: number;
}

export class Bm25Index {
  private readonly docs: Array<{ id: number; tf: Map<string, number>; length: number }> = [];
  private readonly df = new Map<string, number>();
  private avgLength = 0;

  constructor(
    docs: IndexedDoc[],
    private readonly k1 = 1.5,
    private readonly b = 0.75
  ) {
    let total = 0;
    for (const d of docs) {
      // The section title counts twice so headings steer retrieval
      const tokens = [...tokenize(d.section), ...tokenize(d.section), ...tokenize(d.text)];
      const tf = new Map<string, number>();
      for (const t of tokens) tf.set(t, (tf.get(t) ?? 0) + 1);
      for (const t of tf.keys()) this.df.set(t, (this.df.get(t) ?? 0) + 1);
      this.docs.push({ id: d.id, tf, length: tokens.length });
      total += tokens.length;
    }
    this.avgLength = this.docs.length ? total / this.docs.length : 0;
  }

  search(query: string, limit = 5): SearchHit[] {
    const terms = [...new Set(tokenize(query))];
    if (terms.length === 0 || this.docs.length === 0) return [];
    const n = this.docs.length;
    const idf = (term: string) => {
      const df = this.df.get(term) ?? 0;
      return Math.log(1 + (n - df + 0.5) / (df + 0.5));
    };
    const totalWeight = terms.reduce((sum, t) => sum + idf(t), 0);
    const hits: SearchHit[] = [];
    for (const doc of this.docs) {
      let score = 0;
      let matchedWeight = 0;
      for (const term of terms) {
        const f = doc.tf.get(term);
        if (!f) continue;
        const w = idf(term);
        matchedWeight += w;
        score += (w * f * (this.k1 + 1)) / (f + this.k1 * (1 - this.b + (this.b * doc.length) / (this.avgLength || 1)));
      }
      if (matchedWeight > 0) hits.push({ id: doc.id, score, coverage: matchedWeight / totalWeight });
    }
    return hits.sort((a, b) => b.score - a.score).slice(0, limit);
  }
}
