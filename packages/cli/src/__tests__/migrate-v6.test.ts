import { describe, it, expect } from "vitest";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { openDb } from "@teamagent/adapters";
import {
  buildFallbackDescriptions,
  buildMigrationPrompt,
  executeMigrateV6,
  shouldResurrectDormant,
} from "../commands/migrate-v6.js";

describe("migrate-v6 helpers", () => {
  it("buildMigrationPrompt includes all 4 source fields", () => {
    const p = buildMigrationPrompt({
      trigger: "T", wrong_pattern: "W", correct_pattern: "C", reasoning: "R",
    });
    expect(p).toContain("T");
    expect(p).toContain("W");
    expect(p).toContain("C");
    expect(p).toContain("R");
  });

  it("resurrects dormant rules with hit_count >= 3", () => {
    expect(shouldResurrectDormant({ status: "dormant", hit_count: 3 })).toBe(true);
    expect(shouldResurrectDormant({ status: "dormant", hit_count: 2 })).toBe(false);
    expect(shouldResurrectDormant({ status: "active", hit_count: 100 })).toBe(false);
  });

  it("builds deterministic fallback descriptions for fast migrations", () => {
    const out = buildFallbackDescriptions({
      trigger: "need an HTTP request",
      wrong_pattern: "axios",
      correct_pattern: "fetch",
      reasoning: "project standard",
    });
    expect(out.trigger_description).toContain("need an HTTP request");
    expect(out.pattern_description).toContain("axios");
    expect(out.pattern_description).toContain("fetch");
  });

  it("dry-runs fast migration without constructing or calling an embedder", async () => {
    const dbPath = join(mkdtempSync(join(tmpdir(), "migrate-v6-")), "test.db");
    const db = openDb(dbPath);
    db.prepare(`INSERT INTO knowledge (
      id, scope_level, category, tags, type, nature,
      trigger, wrong_pattern, correct_pattern, reasoning,
      confidence, enforcement, source, created_at, tier_entered_at
    ) VALUES (
      'r1', 'global', 'E', '[]', 'avoidance', 'objective',
      'need an HTTP request', 'axios', 'fetch', 'project standard',
      0.8, 'warn', 'accumulated', datetime('now'), datetime('now')
    )`).run();
    db.close();

    let embedCalled = false;
    const result = await executeMigrateV6({
      dryRun: true,
      fast: true,
      dbPath,
      embedder: {
        dim: 384,
        modelId: "test",
        async embed() {
          embedCalled = true;
          return [];
        },
      },
    });

    expect(result).toEqual({ migrated: 1, resurrected: 0, skipped: 0 });
    expect(embedCalled).toBe(false);
  });
});
