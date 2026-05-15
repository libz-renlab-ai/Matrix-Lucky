#!/usr/bin/env tsx
import { DualLayerStore } from "../packages/adapters/src/index.js";
import os from "node:os";
import path from "node:path";

const s = new DualLayerStore({
  projectDbPath: path.join(process.cwd(), ".teamagent", "knowledge.db"),
  userGlobalDbPath: path.join(os.homedir(), ".teamagent", "global.db"),
});
const all = s.findActive();

const groups: Record<string, typeof all> = { avoidance: [], practice: [], wiki: [], other: [] };
for (const e of all) {
  const k = e.type === "avoidance" || e.type === "practice" || e.type === "wiki" ? e.type : "other";
  groups[k]!.push(e);
}

function printGroup(title: string, arr: typeof all, showPattern = true): void {
  if (arr.length === 0) return;
  console.log(`\n${"═".repeat(60)}`);
  console.log(`${title}: ${arr.length} 条`);
  console.log("═".repeat(60));
  arr.sort((a, b) => {
    const rank = { block: 0, warn: 1, suggest: 2, passive: 3 } as Record<string, number>;
    const r = (rank[a.enforcement] ?? 9) - (rank[b.enforcement] ?? 9);
    if (r !== 0) return r;
    return b.confidence - a.confidence;
  });
  for (const e of arr) {
    const enf = e.enforcement.padEnd(8);
    const conf = e.confidence.toFixed(2);
    const tier = (e.current_tier ?? "-").padEnd(12);
    const id = e.id.slice(0, 30).padEnd(32);
    console.log(`[${conf}] ${enf} ${tier} ${id}`);
    console.log(`   trigger : ${e.trigger.slice(0, 100)}`);
    if (showPattern && e.wrong_pattern) {
      console.log(`   ✗ avoid : ${e.wrong_pattern.slice(0, 110)}`);
    }
    if (e.correct_pattern) {
      console.log(`   ✓ do    : ${e.correct_pattern.slice(0, 100)}`);
    }
    if (e.reasoning) {
      console.log(`   · why   : ${e.reasoning.slice(0, 110)}`);
    }
    console.log("");
  }
}

printGroup("AVOIDANCE (拦截型, 有 wrong_pattern, 参与 matcher)", groups.avoidance!);
printGroup("PRACTICE  (建议型, 不拦截, 只靠 CLAUDE.md 注入)", groups.practice!, false);
printGroup("WIKI      (前沿/研究/综述, 通过 UserPromptSubmit 注入)", groups.wiki!, false);
if (groups.other!.length > 0) {
  printGroup("OTHER", groups.other!);
}

console.log(`\n总计: ${all.length} 条活跃规则`);
console.log(`  avoidance: ${groups.avoidance!.length}`);
console.log(`  practice : ${groups.practice!.length}`);
console.log(`  wiki     : ${groups.wiki!.length}`);
s.close();
