import { describe, it, expect } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { openDb, syncToolVector } from "../../index.js";
import { SqliteToolRetriever } from "../sqlite-tool-retriever.js";

// 确定性 stub embedder
function stubVec(text: string): Float32Array {
  const v = new Array(384).fill(0.5);
  let h = 0;
  for (let i = 0; i < text.length; i++) h = ((h * 31 + text.charCodeAt(i)) & 0xffff);
  v[h % 384] += 0.5;
  const n = Math.sqrt(v.reduce((s: number, x: number) => s + x * x, 0));
  return new Float32Array(v.map((x: number) => x / n));
}

function insertRule(db: ReturnType<typeof openDb>, id: string, scopeLevel: string, toolContextDesc: string) {
  db.prepare(`
    INSERT INTO knowledge (
      id, scope_level, category, tags, type, nature,
      trigger, wrong_pattern, correct_pattern, reasoning,
      confidence, enforcement, status, hit_count, success_count,
      override_count, evidence, source, conflict_with,
      created_at, last_hit_at, last_validated_at,
      current_tier, max_tier_ever, tier_entered_at,
      demerit, demerit_last_updated, resurrect_count,
      fire_threshold, threshold_alpha, threshold_beta,
      embedder_model_id, trigger_description, pattern_description,
      tool_context_description
    ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
  `).run(
    id, scopeLevel, "E", "[]", "avoidance", "objective",
    "test", "bad", "good", "",
    0.9, "warn", "active", 0, 0,
    0, "{}", "accumulated", "[]",
    new Date().toISOString(), "", new Date().toISOString(),
    "canonical", "canonical", "",
    0, "", 0,
    0.1, 1.0, 1.0,
    "stub", "", "",
    toolContextDesc,
  );
}

describe("SqliteToolRetriever", () => {
  it("finds rule whose tool_context_description matches query vec", async () => {
    const dir = mkdtempSync(join(tmpdir(), "tool-ret-"));
    try {
      const db = openDb(join(dir, "t.db"));
      const desc = "在终端执行 git push --force 命令";
      insertRule(db, "rule-1", "personal", desc);
      syncToolVector(db, "rule-1", stubVec(desc));

      const retriever = new SqliteToolRetriever(db);
      const queryVec = stubVec(desc);
      const candidates = await retriever.retrieve({
        contextText: desc,
        actionText: desc,
        contextVec: queryVec,
        actionVec: queryVec,
        scope: { level: "personal" },
      });

      expect(candidates.length).toBeGreaterThanOrEqual(1);
      expect(candidates.map(c => c.rule.id)).toContain("rule-1");
      db.close();
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("scope filter: personal query does not return global rules", async () => {
    const dir = mkdtempSync(join(tmpdir(), "tool-ret-scope-"));
    try {
      const db = openDb(join(dir, "t.db"));
      const desc = "编辑认证文件";
      insertRule(db, "global-rule", "global", desc);
      syncToolVector(db, "global-rule", stubVec(desc));

      const retriever = new SqliteToolRetriever(db);
      const results = await retriever.retrieve({
        contextText: desc, actionText: desc,
        contextVec: stubVec(desc), actionVec: stubVec(desc),
        scope: { level: "personal" },
      });

      expect(results.map(c => c.rule.id)).not.toContain("global-rule");
      db.close();
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
