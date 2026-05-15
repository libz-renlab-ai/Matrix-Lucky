import type { KnowledgeEntry } from "@teamagent/types";
import type { SemanticMatch } from "../matcher/semantic-matcher.js";

const TIER_FACTOR: Record<string, number> = {
  canonical: 1.0,
  enforced: 1.0,
  full: 1.0,
  stable: 0.9,
  probation: 0.7,
  experimental: 0.5,
};

export function confidenceWeight(rule: KnowledgeEntry): number {
  if (rule.status === "archived") return 0;
  const tier = TIER_FACTOR[rule.current_tier] ?? 0.6;
  return rule.confidence * tier;
}

export function rerankByConfidence(matches: SemanticMatch[]): SemanticMatch[] {
  return matches
    .map((m) => ({ ...m, score: m.score * confidenceWeight(m.rule) }))
    .sort((a, b) => b.score - a.score);
}
