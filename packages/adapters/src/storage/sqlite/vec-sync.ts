import type { DatabaseSync } from "node:sqlite";

/** 把规则的 trigger + pattern 向量写到 vec0 虚表。幂等。 */
export function syncRuleVectors(
  db: DatabaseSync,
  ruleId: string,
  triggerVec: Float32Array,
  patternVec: Float32Array,
): void {
  // vec0 虚表不支持 INSERT OR REPLACE，需要先删后插
  db.prepare("DELETE FROM knowledge_trigger_vec WHERE id = ?").run(ruleId);
  db.prepare(
    "INSERT INTO knowledge_trigger_vec(id, vec) VALUES (?, ?)",
  ).run(ruleId, new Uint8Array(triggerVec.buffer));

  db.prepare("DELETE FROM knowledge_pattern_vec WHERE id = ?").run(ruleId);
  db.prepare(
    "INSERT INTO knowledge_pattern_vec(id, vec) VALUES (?, ?)",
  ).run(ruleId, new Uint8Array(patternVec.buffer));
}

export function deleteRuleVectors(db: DatabaseSync, ruleId: string): void {
  db.prepare("DELETE FROM knowledge_trigger_vec WHERE id = ?").run(ruleId);
  db.prepare("DELETE FROM knowledge_pattern_vec WHERE id = ?").run(ruleId);
}

/** 把规则的 tool_context 向量写到 knowledge_tool_vec 虚表。幂等。 */
export function syncToolVector(
  db: DatabaseSync,
  ruleId: string,
  vec: Float32Array,
): void {
  db.prepare("DELETE FROM knowledge_tool_vec WHERE id = ?").run(ruleId);
  db.prepare(
    "INSERT INTO knowledge_tool_vec(id, vec) VALUES (?, ?)",
  ).run(ruleId, new Uint8Array(vec.buffer));
}
