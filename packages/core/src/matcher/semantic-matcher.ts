import type { RuleEmbedder, SemanticRetriever } from "@teamagent/ports";
import { DEFAULT_FIRE_THRESHOLD, type KnowledgeEntry } from "@teamagent/types";
import { scoreSoftAnd } from "./soft-and-scorer.js";

export interface SemanticMatch {
  rule: KnowledgeEntry;
  score: number;
  triggerSim: number;
  patternSim: number;
  hardNegSim: number;
}

/** Cosine similarity between two equal-length numeric vectors. */
function cosine(a: number[], b: number[]): number {
  if (a.length === 0 || a.length !== b.length) return 0;
  let dot = 0, normA = 0, normB = 0;
  for (let i = 0; i < a.length; i++) {
    const ai = a[i] as number;
    const bi = b[i] as number;
    dot += ai * bi;
    normA += ai * ai;
    normB += bi * bi;
  }
  const denom = Math.sqrt(normA) * Math.sqrt(normB);
  return denom === 0 ? 0 : dot / denom;
}

export async function semanticMatch(args: {
  contextText: string;
  actionText: string;
  embedder: RuleEmbedder;
  retriever: SemanticRetriever;
  scope: { level: "personal" | "team" | "global"; project?: string };
  topK?: number;
}): Promise<SemanticMatch[]> {
  const embedResult = await args.embedder.embed([
    args.contextText || " ",
    args.actionText || " ",
  ]);
  const ctxVec: number[] = embedResult[0] ?? [];
  const actVec: number[] = embedResult[1] ?? [];

  const candidates = await args.retriever.retrieve({
    contextText: args.contextText,
    actionText: args.actionText,
    contextVec: new Float32Array(ctxVec),
    actionVec: new Float32Array(actVec),
    scope: args.scope,
    topK: args.topK,
  });

  const debug = (globalThis as any).process?.env?.TEAMAGENT_HOOK_DEBUG === "1";

  const scored = candidates.map((c) => {
    // Resolve hard_negatives: deserializeRow already JSON.parses into number[][],
    // but store may also hold a JSON string if the rule was partially migrated.
    const raw = (c.rule as any).hard_negatives;
    const hardNegVecs: number[][] = Array.isArray(raw)
      ? (raw as number[][]).filter(Array.isArray)
      : (typeof raw === "string" && raw
          ? (() => { try { return JSON.parse(raw) as number[][]; } catch { return []; } })()
          : []);

    const hnSims = hardNegVecs.map((hn) => cosine(ctxVec, hn));

    const score = scoreSoftAnd({
      triggerSim: c.triggerSim,
      patternSim: c.patternSim,
      hardNegativeSims: hnSims,
    });

    const hardNegSim = hnSims.length > 0 ? Math.max(...hnSims) : 0;

    return {
      rule: c.rule,
      score,
      triggerSim: c.triggerSim,
      patternSim: c.patternSim,
      hardNegSim,
    };
  });

  if (debug) {
    const proc = (globalThis as any).process;
    proc?.stderr?.write?.(
      `[teamagent-matcher] scope=${args.scope.level} scored ${scored.length} candidates\n`,
    );
    for (const m of scored.slice(0, 5)) {
      const ft = (m.rule as any).fire_threshold ?? DEFAULT_FIRE_THRESHOLD;
      const passed = m.score > ft;
      proc?.stderr?.write?.(
        `[teamagent-matcher]   ${m.rule.id} t=${m.triggerSim.toFixed(3)} ` +
        `p=${m.patternSim.toFixed(3)} hn=${m.hardNegSim.toFixed(3)} ` +
        `score=${m.score.toFixed(3)} >${ft.toFixed(2)}? ${passed ? "PASS" : "drop"}\n`,
      );
    }
  }

  return scored
    .filter((m) => m.score > (m.rule.fire_threshold ?? DEFAULT_FIRE_THRESHOLD))
    .sort((a, b) => b.score - a.score);
}

// TODO(Phase C): wire accumulateHardNegative in bin-stop.ts Step 6c.
// After Step 6b (semantic scan), read recent ai.override.ignored events from eventsDb,
// call accumulateHardNegative({ event, store: globalStore, embedder, now }) for each,
// and update rule hard_negatives via store.update(). This will populate hard_negatives
// so the cosine suppression above takes effect on subsequent calls.
