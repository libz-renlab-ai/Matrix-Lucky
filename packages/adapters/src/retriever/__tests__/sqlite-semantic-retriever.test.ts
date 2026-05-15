import { describe, it } from "vitest";
import { mkdtempSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { openDb } from "../../storage/sqlite/schema.js";
import { SqliteSemanticRetriever } from "../sqlite-semantic-retriever.js";
import type { KnowledgeEntry } from "@teamagent/types";
import { semanticRetrieverContractSuite } from "@teamagent/ports/contracts";

function tempPath(): string {
  return join(mkdtempSync(join(tmpdir(), "m4b-retriever-")), "t.db");
}

describe("SqliteSemanticRetriever", () => {
  semanticRetrieverContractSuite(() => {
    const db = openDb(tempPath());
    const retriever = new SqliteSemanticRetriever(db);
    return {
      retriever,
      async seed(
        rules: KnowledgeEntry[],
        vectors: Map<string, [Float32Array, Float32Array]>,
      ) {
        const INSERT_RULE = db.prepare(`
          INSERT OR REPLACE INTO knowledge (
            id, scope_level, scope_project, scope_paths, scope_file_types, scope_branches,
            category, tags, type, nature, trigger, wrong_pattern, correct_pattern,
            correct_pattern_code_example, correct_pattern_import_path, correct_pattern_tldr,
            reasoning, when_expression, confidence, demerit, demerit_last_updated,
            current_tier, max_tier_ever, tier_entered_at, enforcement, status,
            hit_count, success_count, override_count, resurrect_count,
            evidence, source, conflict_with, created_at, last_hit_at, last_validated_at,
            channel,
            trigger_description, pattern_description,
            threshold_alpha, threshold_beta, fire_threshold, embedder_model_id
          ) VALUES (
            @id, @scope_level, @scope_project, @scope_paths, @scope_file_types, @scope_branches,
            @category, @tags, @type, @nature, @trigger, @wrong_pattern, @correct_pattern,
            NULL, NULL, NULL,
            @reasoning, NULL, @confidence, @demerit, NULL,
            @current_tier, @max_tier_ever, @tier_entered_at, @enforcement, @status,
            @hit_count, @success_count, @override_count, @resurrect_count,
            @evidence, @source, @conflict_with, @created_at, @last_hit_at, @last_validated_at,
            @channel,
            @trigger_description, @pattern_description,
            @threshold_alpha, @threshold_beta, @fire_threshold, @embedder_model_id
          )
        `);

        for (const rule of rules) {
          const e = rule as any;
          INSERT_RULE.run({
            id: rule.id,
            scope_level: rule.scope.level,
            scope_project: rule.scope.project ?? null,
            scope_paths: rule.scope.paths ? JSON.stringify(rule.scope.paths) : null,
            scope_file_types: rule.scope.file_types ? JSON.stringify(rule.scope.file_types) : null,
            scope_branches: rule.scope.branches ? JSON.stringify(rule.scope.branches) : null,
            category: rule.category,
            tags: JSON.stringify(rule.tags),
            type: rule.type,
            nature: rule.nature,
            trigger: rule.trigger,
            wrong_pattern: rule.wrong_pattern ?? "",
            correct_pattern: rule.correct_pattern,
            reasoning: rule.reasoning,
            confidence: rule.confidence,
            demerit: e.demerit ?? 0,
            current_tier: e.current_tier ?? "experimental",
            max_tier_ever: e.max_tier_ever ?? "experimental",
            tier_entered_at: (e.tier_entered_at && e.tier_entered_at.length > 0)
              ? e.tier_entered_at
              : rule.created_at,
            enforcement: rule.enforcement,
            status: rule.status,
            hit_count: rule.hit_count,
            success_count: rule.success_count,
            override_count: rule.override_count,
            resurrect_count: e.resurrect_count ?? 0,
            evidence: JSON.stringify(rule.evidence),
            source: rule.source,
            conflict_with: JSON.stringify(rule.conflict_with),
            created_at: rule.created_at,
            last_hit_at: rule.last_hit_at || null,
            last_validated_at: rule.last_validated_at || null,
            channel: e.channel ?? "tool-action",
            trigger_description: e.trigger_description ?? "",
            pattern_description: e.pattern_description ?? "",
            threshold_alpha: e.threshold_alpha ?? 1.0,
            threshold_beta: e.threshold_beta ?? 1.0,
            fire_threshold: e.fire_threshold ?? 0.40,
            embedder_model_id: e.embedder_model_id ?? "",
          });

          const vecs = vectors.get(rule.id);
          if (vecs) {
            try {
              // Sync trigger vector
              db.prepare("DELETE FROM knowledge_trigger_vec WHERE id = ?").run(rule.id);
              db.prepare(
                "INSERT INTO knowledge_trigger_vec(id, vec) VALUES (?, ?)",
              ).run(rule.id, new Uint8Array(vecs[0].buffer));

              // Sync pattern vector
              db.prepare("DELETE FROM knowledge_pattern_vec WHERE id = ?").run(rule.id);
              db.prepare(
                "INSERT INTO knowledge_pattern_vec(id, vec) VALUES (?, ?)",
              ).run(rule.id, new Uint8Array(vecs[1].buffer));

              // Also populate FTS5 if available
              try {
                db.prepare(
                  "INSERT OR REPLACE INTO knowledge_fts(id, trigger_description, pattern_description) VALUES (?,?,?)",
                ).run(rule.id, e.trigger_description ?? "", e.pattern_description ?? "");
              } catch { /* FTS5 not available */ }
            } catch { /* vec0 not available — skip vector seed */ }
          }
        }
      },
    };
  });
});
