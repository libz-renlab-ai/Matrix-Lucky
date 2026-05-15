#!/usr/bin/env tsx
/** Dedupe active avoidance rules by normalized wrong_pattern. Keep oldest. */
import { DualLayerStore } from "../packages/adapters/src/index.js";
import os from "node:os";
import path from "node:path";

const s = new DualLayerStore({
  projectDbPath: path.join(process.cwd(), ".teamagent", "knowledge.db"),
  userGlobalDbPath: path.join(os.homedir(), ".teamagent", "global.db"),
});
const all = s.findActive().filter((e) => e.type === "avoidance" && e.wrong_pattern);
const byPattern = new Map<string, typeof all>();
for (const e of all) {
  const k = e.wrong_pattern.replace(/\s+/g, " ").trim();
  const arr = byPattern.get(k) ?? [];
  arr.push(e);
  byPattern.set(k, arr);
}
let dropped = 0;
const projectStore = s.getProjectStore();
const globalStore = s.getGlobalStore();
for (const [pat, group] of byPattern) {
  if (group.length <= 1) continue;
  // sort by created_at ascending, keep first (oldest), archive rest
  group.sort((a, b) => (a.created_at ?? "").localeCompare(b.created_at ?? ""));
  for (let i = 1; i < group.length; i++) {
    const e = group[i]!;
    const target = projectStore.getById(e.id)
      ? projectStore
      : globalStore.getById(e.id)
        ? globalStore
        : null;
    if (!target) continue;
    target.update(e.id, { status: "archived" as const });
    dropped++;
  }
  console.log(`[${pat.slice(0, 50)}] kept ${group[0]!.id.slice(0, 25)}, archived ${group.length - 1}`);
}
console.log("archived dupes:", dropped);
s.close();
