#!/usr/bin/env tsx
/** Scan active rules for duplicate/near-duplicate correct_pattern groups. Read-only. */
import { DualLayerStore } from "../packages/adapters/src/index.js";
import os from "node:os";
import path from "node:path";

const s = new DualLayerStore({
  projectDbPath: path.join(process.cwd(), ".teamagent", "knowledge.db"),
  userGlobalDbPath: path.join(os.homedir(), ".teamagent", "global.db"),
});
const all = s.findActive();
console.log("active total:", all.length);

const byCorrect = new Map<string, typeof all>();
for (const e of all) {
  const key = (e.correct_pattern || "").replace(/\s+/g, " ").trim();
  if (!key) continue;
  const arr = byCorrect.get(key) ?? [];
  arr.push(e);
  byCorrect.set(key, arr);
}

let groups = 0;
let extra = 0;
const multi: [string, typeof all][] = [];
for (const [k, g] of byCorrect) {
  if (g.length <= 1) continue;
  groups++;
  extra += g.length - 1;
  multi.push([k, g]);
}
console.log("groups-with-dup-correct_pattern:", groups);
console.log("extra-items-if-collapsed:", extra);

multi.sort((a, b) => b[1].length - a[1].length);
for (let i = 0; i < Math.min(12, multi.length); i++) {
  const [k, g] = multi[i]!;
  console.log("\n[" + k.slice(0, 70) + "]  count=" + g.length);
  for (const e of g) {
    const presetFlag = (e as any).is_preset ? "preset" : "user";
    console.log(
      "  ",
      e.id,
      "scope=" + e.scope,
      presetFlag,
      "conf=" + e.confidence?.toFixed?.(2),
      "hits=" + ((e as any).hit_count ?? 0),
    );
  }
}
s.close();
