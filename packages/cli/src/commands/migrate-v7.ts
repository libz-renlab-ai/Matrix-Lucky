import path from "node:path";
import os from "node:os";
import { openDb, syncToolVector } from "@teamagent/adapters";
import type { LLMClient, RuleEmbedder } from "@teamagent/ports";

export function buildToolContextPrompt(r: {
  trigger: string;
  wrong_pattern: string;
  correct_pattern: string;
  reasoning: string;
}): string {
  return [
    "你是代码质量规则分析助手。给定一条编程规则，描述当 AI 使用工具时，什么样的具体工具操作（Bash命令、文件编辑等）会触发这条规则。",
    "",
    "规则信息：",
    `- 触发场景: ${r.trigger}`,
    `- 错误做法: ${r.wrong_pattern || "(无)"}`,
    `- 正确做法: ${r.correct_pattern}`,
    `- 原因: ${r.reasoning}`,
    "",
    "用1-2句话描述：AI 会执行什么样的具体工具操作（如 Bash 命令、写入什么文件、编辑什么代码）才会触发这条规则？",
    "只描述工具操作，不要说场景或原因。直接输出描述，不加引号。",
  ].join("\n");
}

export async function executeMigrateV7(opts: {
  dryRun: boolean;
  dbPath?: string;
  limit?: number;
  llmClient?: LLMClient;
  /** 注入 embedder（测试用）；缺省用 XenovaRuleEmbedder */
  embedder?: RuleEmbedder;
  cwd?: string;
}): Promise<void> {
  const home = os.homedir();
  const dbPath = opts.dbPath ?? path.join(home, ".teamagent", "global.db");
  const db = openDb(dbPath);

  const rows = db
    .prepare(
      `SELECT id, trigger, wrong_pattern, correct_pattern, reasoning
       FROM knowledge
       WHERE status != 'archived'
         AND (tool_context_description IS NULL OR tool_context_description = '')
       ${opts.limit ? "LIMIT ?" : ""}`,
    )
    .all(...(opts.limit ? [opts.limit] : [])) as Array<{
    id: string;
    trigger: string;
    wrong_pattern: string;
    correct_pattern: string;
    reasoning: string;
  }>;

  process.stdout.write(`Migrating ${rows.length} rules (dryRun=${opts.dryRun})...\n`);

  if (rows.length === 0) {
    db.close();
    return;
  }

  const { ClaudeCodeLLMClient, XenovaRuleEmbedder } = await import("@teamagent/adapters");
  const llm: LLMClient = opts.llmClient ?? new ClaudeCodeLLMClient({ model: "haiku" });
  const embedder: RuleEmbedder = opts.embedder ?? new XenovaRuleEmbedder();
  let migrated = 0;

  for (const row of rows) {
    try {
      const desc = await llm.complete(buildToolContextPrompt(row));
      if (!desc || desc.trim().length < 5) continue;

      if (opts.dryRun) {
        process.stdout.write(`[dry] ${row.id}: ${desc.trim().slice(0, 60)}\n`);
        migrated++;
        continue;
      }

      const [vec] = await embedder.embed([desc.trim()]);
      if (!vec) continue;

      db.prepare("UPDATE knowledge SET tool_context_description = ? WHERE id = ?").run(
        desc.trim(),
        row.id,
      );
      syncToolVector(db, row.id, new Float32Array(vec));
      migrated++;
      process.stdout.write(`\r  已迁移 ${migrated}/${rows.length}`);
    } catch {
      /* 单条失败继续 */
    }
  }

  process.stdout.write(`\nmigrated=${migrated} skipped=${rows.length - migrated}\n`);
  db.close();
}
