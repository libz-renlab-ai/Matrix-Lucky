#!/usr/bin/env tsx
/**
 * 一次性批量清洗规则库：
 * 1. 归档重复 avoidance（同 wrong_pattern，只保留最高 confidence 那条）
 * 2. 归档项目内部实现细节（experimental + 引用内部代码结构）
 * 3. 归档 wiki 条目（passive/experimental，ID 为 UUID 格式）
 *
 * 用法:
 *   pnpm tsx scripts/bulk-cleanup.ts --dry-run
 *   pnpm tsx scripts/bulk-cleanup.ts
 */
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { fileURLToPath } from "node:url";
import { DualLayerStore } from "../packages/adapters/src/index.js";
import type { KnowledgeEntry } from "../packages/types/src/index.js";

const dryRun = process.argv.includes("--dry-run");
const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const projectDbPath = path.join(repoRoot, ".teamagent", "knowledge.db");
const userGlobalDbPath = path.join(os.homedir(), ".teamagent", "global.db");

const store = new DualLayerStore({ projectDbPath, userGlobalDbPath });
const all = store.findActive();

const toArchive: string[] = [];
const reasons: Record<string, string> = {};

// ── 1. 重复 avoidance：同 wrong_pattern，保留最高 confidence，归档其余 ──
const avoidance = all.filter(e => e.type === "avoidance" && e.wrong_pattern);
const byWrongPattern = new Map<string, KnowledgeEntry[]>();
for (const e of avoidance) {
  const key = e.wrong_pattern!.trim().toLowerCase();
  if (!byWrongPattern.has(key)) byWrongPattern.set(key, []);
  byWrongPattern.get(key)!.push(e);
}
for (const [wp, group] of byWrongPattern) {
  if (group.length <= 1) continue;
  const sorted = [...group].sort((a, b) => b.confidence - a.confidence);
  const keep = sorted[0];
  if (!keep) continue;
  for (const dup of sorted.slice(1)) {
    toArchive.push(dup.id);
    reasons[dup.id] = `重复 avoidance（wrong_pattern="${wp.slice(0,40)}"），保留 ${keep.id}[${keep.confidence}]`;
  }
}

// ── 2. 项目内部实现细节（experimental avoidance，引用内部代码概念）──
const INTERNAL_CODE_PATTERNS = [
  /tierFromDemerit/i,
  /new Date\(""\)/i,
  /tier_entered_at/i,
  /effectiveTier/i,
  /hysteresis/i,
  /AttributionEvent\.source/i,
  /adapters subpath/i,
  /@teamagent\/(cli|core|adapters|ports|types)/i,
  /packages\/adapters\/package\.json/i,
  /exports 字段/i,
];

for (const e of all) {
  if (toArchive.includes(e.id)) continue;
  const haystack = [e.trigger, e.correct_pattern, e.reasoning, e.wrong_pattern ?? ""].join(" ");
  if (INTERNAL_CODE_PATTERNS.some(p => p.test(haystack))) {
    toArchive.push(e.id);
    reasons[e.id] = "项目内部实现细节，不适合作为通用 AI 行为规则";
  }
}

// ── 3. Wiki 条目（type="wiki"）──
for (const e of all) {
  if (toArchive.includes(e.id)) continue;
  if ((e as any).type === "wiki") {
    toArchive.push(e.id);
    reasons[e.id] = "wiki 外部知识条目（论文/新闻摘要），不影响 AI 行为规则";
  }
}

// ── 汇总 ──
console.log(`\n待归档: ${toArchive.length} 条（共 ${all.length} 条活跃）\n`);

const byReason = new Map<string, string[]>();
for (const id of toArchive) {
  const r = reasons[id] ?? "未知";
  const prefix = r.split(/[（(，,]/)[0] ?? r;
  const bucket = byReason.get(prefix) ?? [];
  bucket.push(id);
  byReason.set(prefix, bucket);
}
for (const [reason, ids] of byReason) {
  console.log(`  ${reason}: ${ids.length} 条`);
}

console.log(`\n保留: ${all.length - toArchive.length} 条\n`);

if (dryRun) {
  console.log("预览前 20 条待归档：");
  for (const id of toArchive.slice(0, 20)) {
    const e = all.find(x => x.id === id);
    if (!e) continue;
    const snippet = (e.trigger ?? "").slice(0, 60);
    console.log(`  [${e.confidence}] ${id}: ${snippet}`);
    console.log(`    → ${reasons[id]}`);
  }
  console.log("\n--dry-run: 未实际修改");
  store.close();
  process.exit(0);
}

// ── 执行归档（通过 project/global store 的 update 方法）──
const projectStore = store.getProjectStore();
const globalStore = store.getGlobalStore();
const projectActive = new Set(projectStore.findActive().map(e => e.id));
const globalActive = new Set(globalStore.findActive().map(e => e.id));

let archived = 0;
for (const id of toArchive) {
  try {
    if (projectActive.has(id)) {
      projectStore.update(id, { status: "archived" } as any);
      archived++;
    } else if (globalActive.has(id)) {
      globalStore.update(id, { status: "archived" } as any);
      archived++;
    } else {
      console.warn(`  ⚠ 未找到 ${id}`);
    }
  } catch (err) {
    console.warn(`  ⚠ 归档失败 ${id}: ${err}`);
  }
}
store.close();

console.log(`✓ 已归档 ${archived} 条规则`);
console.log(`\n下一步: pnpm teamagent compile --force 重新编译 CLAUDE.md`);
