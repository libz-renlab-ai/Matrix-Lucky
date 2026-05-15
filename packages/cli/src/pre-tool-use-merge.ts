import type { KnowledgeEntry } from "@teamagent/types";

export interface RankedSemanticRule {
  rule: KnowledgeEntry;
  score: number;
}

export function mergeSemanticAndLegacyMatches(
  semanticMatches: RankedSemanticRule[],
  legacyMatches: KnowledgeEntry[],
): KnowledgeEntry[] {
  const seen = new Set<string>();
  const merged: KnowledgeEntry[] = [];

  for (const match of [...semanticMatches].sort((a, b) => b.score - a.score)) {
    if (!seen.has(match.rule.id)) {
      seen.add(match.rule.id);
      merged.push(match.rule);
    }
  }

  for (const rule of legacyMatches) {
    if (!seen.has(rule.id)) {
      seen.add(rule.id);
      merged.push(rule);
    }
  }

  return merged;
}
