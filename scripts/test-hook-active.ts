#!/usr/bin/env tsx
import { openDb } from "../packages/adapters/src/index.js";
import os from "node:os";
import path from "node:path";

const db = openDb(path.join(os.homedir(), ".teamagent", "events.db"));

const todayEvents = db
  .prepare(
    "SELECT kind, COUNT(*) as n FROM events WHERE date(timestamp) = date('now') GROUP BY kind ORDER BY n DESC",
  )
  .all();
console.log("=== TODAY (UTC) events by kind ===");
console.log(todayEvents);

const last5 = db
  .prepare(
    "SELECT kind, timestamp, knowledge_id FROM events ORDER BY timestamp DESC LIMIT 5",
  )
  .all();
console.log("\n=== LAST 5 events (any kind) ===");
console.log(last5);

const hookActivity24h = db
  .prepare(
    "SELECT kind, COUNT(*) as n FROM events WHERE timestamp > datetime('now', '-24 hours') GROUP BY kind ORDER BY n DESC",
  )
  .all();
console.log("\n=== Last 24 hours ===");
console.log(hookActivity24h);

db.close();
