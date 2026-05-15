/**
 * Internet RAG: rank external sources (papers / blogs / docs) by lexical overlap
 * and domain-tier preference.  Pure function — no IO, no side-effects.
 */

export type RagSource = {
  url: string;
  title: string;
  domain: 'paper' | 'blog' | 'docs';
};

/**
 * Rank sources by relevance to a query.
 * Scoring = lexical-token overlap * 10 + domain-tier (paper=3, docs=2, blog=1).
 * `now` is accepted but unused — kept for future time-decay extensions.
 */
export function rankSources(
  sources: RagSource[],
  query: string,
  now: number,
): RagSource[] {
  const tokens = query.split(/\s+/).filter(Boolean);
  return [...sources].sort((a, b) => {
    const score = (s: RagSource): number => {
      const overlap = tokens.filter(t =>
        s.title.toLowerCase().includes(t.toLowerCase()),
      ).length;
      const tier =
        s.domain === 'paper' ? 3 : s.domain === 'docs' ? 2 : 1;
      return overlap * 10 + tier;
    };
    return score(b) - score(a);
  });
}
