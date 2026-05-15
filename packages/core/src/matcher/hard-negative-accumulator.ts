import type { KnowledgeEntry } from "@teamagent/types";
import type { RuleEmbedder } from "@teamagent/ports";
import type { KnowledgeStore } from "@teamagent/ports";

export const MAX_HARD_NEG = 20;
const WINDOW_MS = 24 * 3600 * 1000;

const TRIGGER_KINDS = new Set([
  "ai.override.ignored",
  "ai.override.blocked_circumvented",
  "user.supportive_negation",
  "git.revert.related",
]);

export async function accumulateHardNegative(args: {
  event: {
    kind: string;
    knowledge_id: string;
    timestamp: string;
    payload: Record<string, unknown>;
  };
  store: KnowledgeStore;
  embedder: RuleEmbedder;
  now: Date;
}): Promise<void> {
  if (!TRIGGER_KINDS.has(args.event.kind)) return;
  if (args.now.getTime() - Date.parse(args.event.timestamp) > WINDOW_MS) return;

  const rule = args.store.getById(args.event.knowledge_id);
  if (!rule) return;

  const contextText = String(args.event.payload?.contextText ?? "");
  const [ctxVec] = await args.embedder.embed([contextText || " "]);
  if (!ctxVec) return;

  const existing: number[][] = (() => {
    try {
      if (Array.isArray(rule.hard_negatives)) return rule.hard_negatives;
      return rule.hard_negatives ? JSON.parse(String(rule.hard_negatives)) : [];
    } catch {
      return [];
    }
  })();

  existing.push(ctxVec);
  while (existing.length > MAX_HARD_NEG) existing.shift();

  args.store.update(args.event.knowledge_id, {
    hard_negatives: JSON.stringify(existing) as any,
  });
}
