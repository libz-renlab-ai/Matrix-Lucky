import { describe, it, expect, beforeEach } from "vitest";
import { mkdtempSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { openDb } from "../schema.js";
import { syncRuleVectors } from "../vec-sync.js";

describe("syncRuleVectors", () => {
  let db: ReturnType<typeof openDb>;
  beforeEach(() => {
    db = openDb(join(mkdtempSync(join(tmpdir(), "m4b-vec-")), "t.db"));
  });

  it("upserts trigger + pattern vectors for a rule", () => {
    const v1 = new Float32Array(384).fill(0.1);
    const v2 = new Float32Array(384).fill(0.2);
    syncRuleVectors(db, "r1", v1, v2);
    const row = db.prepare("SELECT id FROM knowledge_trigger_vec WHERE id='r1'").get();
    expect(row).toBeTruthy();
  });

  it("replaces existing vectors on re-sync", () => {
    const v = new Float32Array(384).fill(0.1);
    syncRuleVectors(db, "r1", v, v);
    syncRuleVectors(db, "r1", v, v);
    const count = db.prepare("SELECT COUNT(*) as c FROM knowledge_trigger_vec WHERE id='r1'").get() as { c: number };
    expect(count.c).toBe(1);
  });
});
