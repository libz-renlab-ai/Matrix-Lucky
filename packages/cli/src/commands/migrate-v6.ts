import os from "node:os";
import path from "node:path";
import type { LLMClient, RuleEmbedder } from "@teamagent/ports";
import { openDb, syncRuleVectors } from "@teamagent/adapters";
import { buildSemanticDescriptions } from "@teamagent/core";
import { DEFAULT_FIRE_THRESHOLD } from "@teamagent/types";

export function buildMigrationPrompt(r: {
  trigger: string;
  wrong_pattern: string;
  correct_pattern: string;
  reasoning: string;
}): string {
  return [
    "把下面这条旧知识规则转成新版双描述格式。",
    "",
    "【旧字段】",
    `trigger:         ${r.trigger}`,
    `wrong_pattern:   ${r.wrong_pattern}`,
    `correct_pattern: ${r.correct_pattern}`,
    `reasoning:       ${r.reasoning}`,
    "",
    "【新字段】生成 2 个字段，**只**输出 JSON：",
    `{`,
    `  "trigger_description": "用一两句话描述什么情境下这条规则该触发（完整的场景，用自然语言）",`,
    `  "pattern_description": "描述什么具体行为/代码/操作是错的（具体到行为，用自然语言）"`,
    `}`,
    "",
    "示例：",
    '  旧 trigger="需要发起HTTP请求" wrong_pattern="axios" correct_pattern="fetch"',
    '  新 trigger_description="在项目代码里新发起一次HTTP请求的场景"',
    '  新 pattern_description="引入或调用axios库发请求"',
    "",
    "只输出 JSON，不要解释。",
  ].join("\n");
}

export function shouldResurrectDormant(r: { status: string; hit_count: number }): boolean {
  return r.status === "dormant" && r.hit_count >= 3;
}

export function buildFallbackDescriptions(r: {
  trigger: string;
  wrong_pattern: string;
  correct_pattern: string;
  reasoning: string;
}): { trigger_description: string; pattern_description: string } {
  return buildSemanticDescriptions(r);
}

export async function executeMigrateV6(opts: {
  dryRun: boolean;
  dbPath?: string;
  limit?: number;
  cwd?: string;
  fast?: boolean;
  repairAll?: boolean;
  /** 注入 LLM client（测试用）；缺省用 ClaudeCodeLLMClient */
  llmClient?: LLMClient;
  embedder?: RuleEmbedder;
}): Promise<{ migrated: number; resurrected: number; skipped: number }> {
  const home = os.homedir();
  const dbPath = opts.dbPath ?? path.join(home, ".teamagent", "global.db");

  const db = openDb(dbPath);

  const { ClaudeCodeLLMClient, XenovaRuleEmbedder } = await import("@teamagent/adapters");
  const llm: LLMClient | undefined = opts.fast
    ? undefined
    : (opts.llmClient ?? new ClaudeCodeLLMClient({ model: "haiku" }));
  let embedder: RuleEmbedder | undefined = opts.embedder;

  const rows = db
    .prepare(
      `SELECT id, trigger, wrong_pattern, correct_pattern, reasoning, status, hit_count
       FROM knowledge
       WHERE ${opts.repairAll ? "status != 'archived'" : "COALESCE(trigger_description,'') = '' AND status != 'archived'"}
       ${opts.limit ? "LIMIT ?" : ""}`,
    )
    .all(...(opts.limit ? [opts.limit] : [])) as Array<{
    id: string; trigger: string; wrong_pattern: string;
    correct_pattern: string; reasoning: string;
    status: string; hit_count: number;
  }>;

  process.stderr.write(`Migrating ${rows.length} rules (dryRun=${opts.dryRun})...\n`);

  let migrated = 0, resurrected = 0, skipped = 0;

  for (const r of rows) {
    try {
      let parsed: { trigger_description: string; pattern_description: string };
      if (llm) {
        try {
          const promptText = buildMigrationPrompt(r);
          const rawText = await llm.complete(promptText);
          const jsonStr = rawText.trim().replace(/^```json\s*/m, "").replace(/```\s*$/m, "").trim();
          parsed = JSON.parse(jsonStr) as {
            trigger_description: string;
            pattern_description: string;
          };
        } catch (e) {
          process.stderr.write(`fallback ${r.id}: ${(e as Error).message}\n`);
          parsed = buildFallbackDescriptions(r);
        }
      } else {
        parsed = buildFallbackDescriptions(r);
      }

      if (opts.dryRun) {
        process.stdout.write(`[dry] ${r.id}: ${parsed.trigger_description.slice(0, 60)}\n`);
        migrated++;
        continue;
      }

      embedder ??= new XenovaRuleEmbedder();
      const [tvec, pvec] = await embedder.embed([
        parsed.trigger_description,
        parsed.pattern_description,
      ]);

      const resurrect = shouldResurrectDormant(r);
      db.prepare(
        `UPDATE knowledge SET
           trigger_description = ?,
           pattern_description = ?,
           threshold_alpha = 1.0,
           threshold_beta = 1.0,
           fire_threshold = ?,
           embedder_model_id = ?,
           status = CASE WHEN ? THEN 'active' ELSE status END,
           current_tier = CASE WHEN ? THEN 'probation' ELSE current_tier END
         WHERE id = ?`,
      ).run(
        parsed.trigger_description,
        parsed.pattern_description,
        DEFAULT_FIRE_THRESHOLD,
        embedder.modelId,
        resurrect ? 1 : 0,
        resurrect ? 1 : 0,
        r.id,
      );

      if (!tvec || !pvec) {
        throw new Error("Embedder returned no vector for rule migration");
      }
      syncRuleVectors(db, r.id, new Float32Array(tvec), new Float32Array(pvec));

      // FTS sync (try/catch in case FTS5 not available)
      try {
        db.prepare(
          `INSERT OR REPLACE INTO knowledge_fts(id, trigger_description, pattern_description) VALUES (?, ?, ?)`,
        ).run(r.id, parsed.trigger_description, parsed.pattern_description);
      } catch { /* FTS5 not available */ }

      migrated++;
      if (resurrect) resurrected++;
    } catch (e) {
      process.stderr.write(`skip ${r.id}: ${(e as Error).message}\n`);
      skipped++;
    }
  }

  return { migrated, resurrected, skipped };
}
