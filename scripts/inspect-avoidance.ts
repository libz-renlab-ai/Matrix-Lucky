#!/usr/bin/env tsx
import { DualLayerStore } from "../packages/adapters/src/index.js";
import os from "node:os";
import path from "node:path";

const CAVEAT = "<local-command-" + "caveat>";
const s = new DualLayerStore({
  projectDbPath: path.join(process.cwd(), ".teamagent", "knowledge.db"),
  userGlobalDbPath: path.join(os.homedir(), ".teamagent", "global.db"),
});
const avoid = s
  .findActive()
  .filter((e) => e.type === "avoidance" && e.wrong_pattern);
const caveatCount = avoid.filter((e) => e.wrong_pattern.includes(CAVEAT)).length;
const byEnf = new Map<string, number>();
for (const e of avoid) {
  byEnf.set(e.enforcement, (byEnf.get(e.enforcement) ?? 0) + 1);
}
console.log("total avoidance:", avoid.length);
console.log("caveat-marker rules:", caveatCount);
console.log("by enforcement:", Object.fromEntries(byEnf));
s.close();
