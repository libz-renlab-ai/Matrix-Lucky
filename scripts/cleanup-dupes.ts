#!/usr/bin/env tsx
import { SqliteKnowledgeStore, openDb } from "../packages/adapters/src/index.js";
import os from "node:os";
import path from "node:path";

const CAVEAT_MARKER = "<local-command-" + "caveat>";

const s = new SqliteKnowledgeStore(
  openDb(path.join(os.homedir(), ".teamagent", "global.db")),
);
const all = s.getAll();
let seedDropped = 0;
let caveatDropped = 0;
const keptCaveat = new Set<string>();
for (const e of all) {
  if (e.id.startsWith("seed-")) {
    s.delete(e.id);
    seedDropped++;
    continue;
  }
  if (e.wrong_pattern && e.wrong_pattern.includes(CAVEAT_MARKER)) {
    const key = e.wrong_pattern.slice(0, 50);
    if (keptCaveat.has(key)) {
      s.delete(e.id);
      caveatDropped++;
    } else {
      keptCaveat.add(key);
    }
  }
}
console.log(
  "seedDropped:",
  seedDropped,
  "caveatDupsDropped:",
  caveatDropped,
  "remaining:",
  s.count(),
);
s.close();
