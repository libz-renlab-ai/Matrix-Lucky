import fs from "node:fs";
import path from "node:path";
import {
  SqliteKnowledgeStore,
  SqliteEventLog,
  openDb,
} from "../../../packages/adapters/src/index.js";
import type { KnowledgeEntry, PersistedEvent } from "@teamagent/types";

const projectDbPath = process.env.PROJECT_DB!;
const globalDbPath  = process.env.GLOBAL_DB!;
const eventsDbPath  = process.env.EVENTS_DB!;

fs.mkdirSync(path.dirname(projectDbPath), { recursive: true });
fs.mkdirSync(path.dirname(globalDbPath),  { recursive: true });
fs.mkdirSync(path.dirname(eventsDbPath),  { recursive: true });

function makeEntry(id: string, confidence: number): KnowledgeEntry {
  return {
    id,
    scope: { level: "personal" },
    category: "E",
    tags: [],
    type: "avoidance",
    nature: "subjective",
    trigger: `trigger-${id}`,
    wrong_pattern: `wrong-${id}`,
    correct_pattern: `correct-${id}`,
    reasoning: `reasoning-${id}`,
    confidence,
    enforcement: "warn",
    status: "active",
    hit_count: 0,
    success_count: 0,
    override_count: 0,
    evidence: { success_sessions: 0, success_users: 0, correction_sessions: 0 },
    created_at: "2026-04-01T00:00:00Z",
    last_hit_at: null,
    last_validated_at: "2026-04-01T00:00:00Z",
    source: "accumulated",
    conflict_with: [],
    current_tier: "stable" as const,
    max_tier_ever: "stable" as const,
    tier_entered_at: "2026-04-01T00:00:00Z",
    demerit: 0,
    demerit_last_updated: "2026-04-01T00:00:00Z",
    resurrect_count: 0,
  } satisfies KnowledgeEntry;
}

// Seed rules: rule-X and rule-Y are targets; rule-N0..N29 are neutral.
const store = new SqliteKnowledgeStore(openDb(projectDbPath));
store.add(makeEntry("rule-X", 0.80));
store.add(makeEntry("rule-Y", 0.75));
for (let i = 0; i < 30; i++) {
  store.add(makeEntry(`rule-N${i}`, 0.60));
}
store.close();

// Seed 50 events:
//   10 calibrator.user_reject for rule-X   → demerit (user_reject path, +10 override)
//   10 ai.override.ignored for rule-X       → demerit + synthetic failure obs (lowers Wilson)
//   10 validator.failure for rule-Y         → demerit (validator_fail path)
//   10 hook-post.result failure for rule-Y  → failure observation (lowers Wilson)
//   10 neutral events (no knowledge_id)     → no rule touched
const log = new SqliteEventLog(openDb(eventsDbPath));
const ts = "2026-04-15T01:00:00Z";

for (let i = 0; i < 10; i++) {
  log.append({
    id: `rej-X-${i}`,
    kind: "calibrator.user_reject",
    knowledge_id: "rule-X",
    timestamp: ts,
    schema_version: 1,
  } as PersistedEvent);
}

for (let i = 0; i < 10; i++) {
  log.append({
    id: `ign-X-${i}`,
    kind: "ai.override.ignored",
    knowledge_id: "rule-X",
    timestamp: ts,
    schema_version: 1,
  } as PersistedEvent);
}

for (let i = 0; i < 10; i++) {
  log.append({
    id: `vf-Y-${i}`,
    kind: "validator.failure",
    knowledge_id: "rule-Y",
    timestamp: ts,
    schema_version: 1,
  } as PersistedEvent);
}

for (let i = 0; i < 10; i++) {
  log.append({
    id: `pr-Y-${i}`,
    kind: "hook-post.result",
    knowledge_id: "rule-Y",
    tool_use_id: `tuid-Y-${i}`,
    timestamp: ts,
    schema_version: 1,
    payload: { success: false },
  } as unknown as PersistedEvent);
}

for (let i = 0; i < 10; i++) {
  log.append({
    id: `neutral-${i}`,
    kind: "hook-pre.matched",
    timestamp: ts,
    schema_version: 1,
  } as PersistedEvent);
}

log.close();
process.stdout.write(`seeded: rule-X rule-Y rule-N0..N29 + 50 events\n`);
