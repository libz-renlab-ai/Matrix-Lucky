import { describe, it, expect } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { openDb } from "@teamagent/adapters";
import { executeMigrateV7 } from "../commands/migrate-v7.js";

function mkDb(dir: string) {
  return openDb(join(dir, "t.db"));
}

function insertRule(db: ReturnType<typeof openDb>, id: string, trigger = "test") {
  db.prepare(`
    INSERT INTO knowledge (
      id, scope_level, category, tags, type, nature,
      trigger, wrong_pattern, correct_pattern, reasoning,
      confidence, enforcement, status, hit_count, success_count,
      override_count, evidence, source, conflict_with,
      created_at, last_hit_at, last_validated_at,
      current_tier, max_tier_ever, tier_entered_at,
      demerit, demerit_last_updated, resurrect_count
    ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
  `).run(
    id, "personal", "E", "[]", "avoidance", "objective",
    trigger, "bad", "good", "reason",
    0.8, "warn", "active", 0, 0,
    0, "{}", "accumulated", "[]",
    new Date().toISOString(), "", new Date().toISOString(),
    "canonical", "canonical", "",
    0, "", 0,
  );
}

// stub LLM client
const stubLlm = {
  async complete(_prompt: string): Promise<string> {
    return "在终端执行某条特定 Bash 命令时触发";
  },
};

// stub embedder — avoids loading real ML model
const stubEmbedder = {
  dim: 384,
  modelId: "test",
  async embed(texts: string[]): Promise<number[][]> {
    return texts.map(() => new Array(384).fill(0));
  },
};

describe("executeMigrateV7", () => {
  it("migrating 0 rules — empty DB completes without error", async () => {
    const dir = mkdtempSync(join(tmpdir(), "mv7-empty-"));
    try {
      const db = mkDb(dir);
      db.close();
      await expect(
        executeMigrateV7({ dryRun: false, dbPath: join(dir, "t.db") })
      ).resolves.not.toThrow();
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("dry-run: does NOT write tool_context_description to DB", async () => {
    const dir = mkdtempSync(join(tmpdir(), "mv7-dry-"));
    try {
      const db = mkDb(dir);
      insertRule(db, "rule-dry", "dry trigger");
      db.close();

      await executeMigrateV7({
        dryRun: true,
        dbPath: join(dir, "t.db"),
        llmClient: stubLlm,
      });

      const db2 = openDb(join(dir, "t.db"));
      const row = db2.prepare("SELECT tool_context_description FROM knowledge WHERE id='rule-dry'").get() as any;
      db2.close();
      // dry-run should not write to DB
      expect(row?.tool_context_description ?? "").toBe("");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("live run: writes tool_context_description to DB", async () => {
    const dir = mkdtempSync(join(tmpdir(), "mv7-live-"));
    try {
      const db = mkDb(dir);
      insertRule(db, "rule-live", "live trigger");
      db.close();

      await executeMigrateV7({
        dryRun: false,
        dbPath: join(dir, "t.db"),
        llmClient: stubLlm,
        embedder: stubEmbedder,
      });

      const db2 = openDb(join(dir, "t.db"));
      const row = db2.prepare("SELECT tool_context_description FROM knowledge WHERE id='rule-live'").get() as any;
      db2.close();
      expect(row?.tool_context_description).toContain("Bash");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("skips rules that already have tool_context_description", async () => {
    const dir = mkdtempSync(join(tmpdir(), "mv7-skip-"));
    try {
      const db = mkDb(dir);
      insertRule(db, "rule-existing", "existing trigger");
      db.prepare("UPDATE knowledge SET tool_context_description='already set' WHERE id='rule-existing'").run();
      db.close();

      const callCount = { n: 0 };
      const countingLlm = {
        async complete(_: string): Promise<string> {
          callCount.n++;
          return "new description";
        },
      };

      await executeMigrateV7({
        dryRun: false,
        dbPath: join(dir, "t.db"),
        llmClient: countingLlm,
      });

      expect(callCount.n).toBe(0); // should not call LLM for already-set rules
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
