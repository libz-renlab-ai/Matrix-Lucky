#!/usr/bin/env tsx
/**
 * Dedupe active rules by normalized correct_pattern.
 * Per group: keep the best one (highest confidence, then highest hit_count, then oldest created_at),
 * archive the rest. Prefer non-seed IDs over seed- IDs when tied.
 * Read-only unless --apply is passed.
 */
import { DualLayerStore } from "../packages/adapters/src/index.js";
import os from "node:os";
import path from "node:path";

const APPLY = process.argv.includes("--apply");

const s = new DualLayerStore({
  projectDbPath: path.join(process.cwd(), ".teamagent", "knowledge.db"),
  userGlobalDbPath: path.join(os.homedir(), ".teamagent", "global.db"),
});
const projectStore = s.getProjectStore();
const globalStore = s.getGlobalStore();

const all = s.findActive();
const byKey = new Map<string, typeof all>();
for (const e of all) {
  const correct = (e.correct_pattern || "").replace(/\s+/g, " ").trim();
  if (!correct) continue;
  const arr = byKey.get(correct) ?? [];
  arr.push(e);
  byKey.set(correct, arr);
}

function score(e: any): [number, number, string] {
  const conf = typeof e.confidence === "number" ? e.confidence : 0;
  const hits = typeof e.hit_count === "number" ? e.hit_count : 0;
  const created = e.created_at ?? "";
  return [conf, hits, created];
}

function better(a: any, b: any): any {
  const [ca, ha, ta] = score(a);
  const [cb, hb, tb] = score(b);
  if (ca !== cb) return ca > cb ? a : b;
  if (ha !== hb) return ha > hb ? a : b;
  // tie: prefer non-seed
  const aSeed = a.id.startsWith("seed-");
  const bSeed = b.id.startsWith("seed-");
  if (aSeed !== bSeed) return aSeed ? b : a;
  // then oldest (stable)
  return (ta || "") <= (tb || "") ? a : b;
}

let archived = 0;
let groupsAffected = 0;
for (const [k, g] of byKey) {
  if (g.length <= 1) continue;
  groupsAffected++;
  let keeper = g[0]!;
  for (let i = 1; i < g.length; i++) keeper = better(keeper, g[i]!);
  for (const e of g) {
    if (e.id === keeper.id) continue;
    const tgt = projectStore.getById(e.id)
      ? projectStore
      : globalStore.getById(e.id)
        ? globalStore
        : null;
    if (!tgt) continue;
    if (APPLY) tgt.update(e.id, { status: "archived" as const });
    archived++;
  }
  if (g.length >= 3) {
    console.log(
      `[${k.slice(0, 55)}]  keep=${keeper.id.slice(0, 28)}  archived=${g.length - 1}`,
    );
  }
}
console.log(
  `\n${APPLY ? "APPLIED" : "DRY-RUN"}  groups=${groupsAffected}  archived=${archived}`,
);
s.close();
