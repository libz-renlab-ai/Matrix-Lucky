/**
 * Prod e2e seed script for calibrator-v2 prod-judge.sh
 *
 * Seeds a realistic SQLite knowledge store with 5 rules at varying confidence
 * levels and ~16 real-shape session events:
 *   - rule-D (demotion target): calibrator.user_reject + validator.failure events
 *   - rule-P (promotion target): hook-pre.blocked success events (>= 10 needed)
 *   - rule-N0..N2: neutral rules — no events, no signal
 *
 * All events use shape exactly as read by executeCalibrate / synthesizeObservations.
 */
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

function makeEntry(
  id: string,
  confidence: number,
  tier: KnowledgeEntry["current_tier"] = "stable",
): KnowledgeEntry {
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
    current_tier: tier,
    max_tier_ever: tier,
    tier_entered_at: "2026-04-01T00:00:00Z",
    demerit: 0,
    demerit_last_updated: "2026-04-01T00:00:00Z",
    resurrect_count: 0,
  } satisfies KnowledgeEntry;
}

// Seed project store: 2 signal rules + 3 neutral rules
const store = new SqliteKnowledgeStore(openDb(projectDbPath));
store.add(makeEntry("rule-D", 0.80, "stable")); // demotion target
store.add(makeEntry("rule-P", 0.40, "experimental")); // promotion target (low start → Wilson goes up with successes)
store.add(makeEntry("rule-N0", 0.60, "stable")); // neutral
store.add(makeEntry("rule-N1", 0.65, "stable")); // neutral
store.add(makeEntry("rule-N2", 0.55, "stable")); // neutral
store.close();

// No global store entries needed (empty global is fine; calibrate skips empty stores)
const globalStore = new SqliteKnowledgeStore(openDb(globalDbPath));
globalStore.close();

// Seed events:
//   6 calibrator.user_reject for rule-D   → demerit (user_reject source)
//   4 validator.failure for rule-D        → demerit (validator_fail source)
//   10 hook-pre.blocked for rule-P        → synthetic "success" observation (Wilson LB goes up)
//   enough to meet MIN_OBS_FOR_PROMOTION=10 for rule-P (all are in experimental tier since tier_entered_at)
const log = new SqliteEventLog(openDb(eventsDbPath));
const ts = "2026-04-15T01:00:00Z";

// Demotion signals for rule-D
for (let i = 0; i < 6; i++) {
  log.append({
    id: `rej-D-${i}`,
    kind: "calibrator.user_reject",
    knowledge_id: "rule-D",
    timestamp: ts,
    schema_version: 1,
  } as PersistedEvent);
}
for (let i = 0; i < 4; i++) {
  log.append({
    id: `vf-D-${i}`,
    kind: "validator.failure",
    knowledge_id: "rule-D",
    timestamp: ts,
    schema_version: 1,
  } as PersistedEvent);
}

// Promotion signals for rule-P: hook-pre.blocked → synthetic success observation
// Need >= 10 obs in current tier (experimental, entered 2026-04-01); events are 2026-04-15 so all count
for (let i = 0; i < 10; i++) {
  log.append({
    id: `blocked-P-${i}`,
    kind: "hook-pre.blocked",
    knowledge_id: "rule-P",
    timestamp: ts,
    schema_version: 1,
  } as PersistedEvent);
}

log.close();
process.stdout.write(
  `seeded: rule-D(demotion) rule-P(promotion) rule-N0..N2(neutral) + ${6+4+10} events\n`,
);
