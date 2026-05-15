import { describe, it, expect, afterEach } from "vitest";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { openDb, closeDb, CURRENT_SCHEMA_VERSION } from "../schema.js";

let tmpDir: string;

function tmpDbPath(): string {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "teamagent-schema-"));
  return path.join(tmpDir, "test.db");
}

afterEach(() => {
  if (tmpDir && fs.existsSync(tmpDir)) fs.rmSync(tmpDir, { recursive: true, force: true });
});

describe("sqlite schema", () => {
  it("initializes all tables on first open", () => {
    const db = openDb(tmpDbPath());
    const tables = db
      .prepare("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name")
      .all() as { name: string }[];
    const names = tables.map(t => t.name);
    expect(names).toContain("knowledge");
    expect(names).toContain("observations");
    expect(names).toContain("events");
    expect(names).toContain("schema_version");
    closeDb(db);
  });

  it("is idempotent — opening twice does not duplicate data", () => {
    const p = tmpDbPath();
    const db1 = openDb(p);
    closeDb(db1);
    const db2 = openDb(p);
    const versions = db2.prepare("SELECT version FROM schema_version ORDER BY version DESC").all() as { version: number }[];
    // schema_version tracks migration history; the highest version must equal CURRENT_SCHEMA_VERSION
    expect(versions.length).toBeGreaterThanOrEqual(1);
    expect(versions[0]!.version).toBe(CURRENT_SCHEMA_VERSION);
    closeDb(db2);
  });

  it("enforces CHECK constraint on tier", () => {
    const db = openDb(tmpDbPath());
    expect(() => {
      db.prepare(
        "INSERT INTO knowledge (id, scope_level, category, type, nature, trigger, correct_pattern, current_tier, tier_entered_at, source, created_at) VALUES (?, 'personal', 'C', 'avoidance', 'objective', 't', 'c', 'bogus_tier', datetime('now'), 'preset', datetime('now'))"
      ).run("r1");
    }).toThrow();
    closeDb(db);
  });

  // sqlite-vec must load when allowExtension:true is set so the knowledge_vec
  // virtual table is actually created. Verify it exists when sqlite-vec is
  // installed (which it is in this workspace).
  it("creates knowledge_vec virtual table when sqlite-vec is loaded", () => {
    const db = openDb(tmpDbPath());
    const tables = db
      .prepare("SELECT name FROM sqlite_master WHERE type IN ('table', 'virtual') ORDER BY name")
      .all() as { name: string }[];
    const names = tables.map((t) => t.name);
    expect(names).toContain("knowledge_vec");
    closeDb(db);
  });
});
