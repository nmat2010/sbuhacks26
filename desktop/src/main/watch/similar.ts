// The watcher names the same thing differently between looks ("Implement coinChange to find the
// minimum number of coins..." / "...to return the minimum number of coins...", "120. Triangle -
// LeetCode" / "Triangle - LeetCode" / "120. Triangle"). These tell when two names mean one thing,
// for problems (session reports) and for sources (session memory, "What you studied").

export function nameKey(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

const STOPWORDS = new Set(
  'a an the to of for in on at by with from and or is are be was were it its this that these those you your we our i me my what how which find return given make up get'.split(' ')
);

/** Meaningful words of a name ("coins"/"coin", "needed"/"need" are the same; "ii" and "13" count). */
function words(name: string): Set<string> {
  const stem = (w: string) =>
    w.length > 5 && w.endsWith('ing') ? w.slice(0, -3) : w.length > 4 && w.endsWith('ed') ? w.slice(0, -2) : w.length > 3 && w.endsWith('s') ? w.slice(0, -1) : w;
  return new Set(
    nameKey(name)
      .split(' ')
      .filter((w) => w && !STOPWORDS.has(w))
      .map(stem)
  );
}

function isIdentifier(word: string): boolean {
  return /\d/.test(word) || /^(ii|iii|iv|v|vi|vii|viii|ix|x)$/.test(word) || word.length === 1;
}

/**
 * Two names of one thing: most meaningful words shared, or a short name contained in the other.
 * Numbers, roman numerals and single letters tell things apart ("= 13" vs "= 12", "Q2" vs "Q3",
 * "120. Triangle" vs "322. Coin Change"): when both names have them, they must match.
 * `minContained`: the fewest words a contained name needs (titles may be one word).
 */
export function sameName(a: string, b: string, minContained = 2): boolean {
  if (nameKey(a) === nameKey(b)) return true;
  const wa = words(a);
  const wb = words(b);
  const ids = (w: Set<string>) => [...w].filter(isIdentifier).sort().join(' ');
  if (ids(wa) && ids(wb) && ids(wa) !== ids(wb)) return false;
  const shared = [...wa].filter((w) => wb.has(w)).length;
  const smaller = Math.min(wa.size, wb.size);
  if (smaller >= minContained && smaller <= 3 && shared === smaller) return true;
  return shared >= 3 && shared / smaller >= 0.7;
}

/** A page or document title without its site part ("Triangle - LeetCode" -> "Triangle"). */
export function titleCore(title: string): string {
  const parts = title.split(/\s+[-|–—]\s+/);
  return parts.length > 1 && parts[parts.length - 1].split(/\s+/).length <= 3 ? parts.slice(0, -1).join(' - ') : title;
}

/** Two titles of one source (the site part is ignored; a one-word title may be contained). */
export function sameTitle(a: string, b: string): boolean {
  return sameName(titleCore(a), titleCore(b), 1);
}
