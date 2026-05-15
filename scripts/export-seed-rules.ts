#!/usr/bin/env tsx
/**
 * 把开发者本机活跃规则导出成 seed/rules.jsonl，跟 teamagent tarball 一起发。
 *
 * 用法:
 *   pnpm tsx scripts/export-seed-rules.ts --dry-run   # 只打印过滤后计数+前 5 条样本
 *   pnpm tsx scripts/export-seed-rules.ts             # 实际写入 packages/teamagent/seed/rules.jsonl
 *
 * 过滤策略:
 *   1. status=active
 *   2. 去重: 按 normalized(trigger + "|" + correct_pattern) hash
 *   3. 剔除项目专属路径: correct_pattern/trigger/reasoning 含绝对 Windows 路径
 *      (repo-specific absolute paths) 或 "packages/core/src/init/meta-principles"
 *      (自指引用)
 *   4. confidence >= 0.6
 *   5. 排除 meta-principle 自身 (id 以 "preset-" 开头) —— 新用户 init 会另装一份
 */
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { fileURLToPath } from "node:url";
import { DualLayerStore } from "../packages/adapters/src/index.js";
import type { KnowledgeEntry } from "../packages/types/src/index.js";

const PROJECT_PATH_PATTERNS = [
  /C:[\\/]bzli/i,
  /\/c\/bzli/i,
  /\bpackages\/[a-z]+\/src/i,        // packages/<pkg>/src/* 路径
  /\.teamagent\/(knowledge|global)/i, // 内部 DB 路径
  /bin-[a-z-]+\.cjs/i,                // hook bundle 文件名
  /pnpm --filter @teamagent/i,         // 项目专属命令
  /@teamagent\/(cli|core|adapters|ports|types)/i, // 内部包名
];

function normalize(s: string): string {
  return s.replace(/\s+/g, " ").trim().toLowerCase();
}

function dedupeKey(e: KnowledgeEntry): string {
  return normalize(e.trigger) + "||" + normalize(e.correct_pattern);
}

function isProjectSpecific(e: KnowledgeEntry): boolean {
  const haystack = [e.trigger, e.correct_pattern, e.reasoning, e.wrong_pattern]
    .join(" ");
  return PROJECT_PATH_PATTERNS.some((p) => p.test(haystack));
}

function main(): void {
  const dryRun = process.argv.includes("--dry-run");
  const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
  const projectDbPath = path.join(repoRoot, ".teamagent", "knowledge.db");
  const userGlobalDbPath = path.join(os.homedir(), ".teamagent", "global.db");
  const outDir = path.join(repoRoot, "packages", "teamagent", "seed");
  const outPath = path.join(outDir, "rules.jsonl");

  console.log(`reading project db: ${projectDbPath}`);
  console.log(`reading global db:  ${userGlobalDbPath}`);

  const store = new DualLayerStore({ projectDbPath, userGlobalDbPath });
  const all = store.findActive();
  store.close();

  const seen = new Set<string>();
  const dropped = { dedupe: 0, projectSpecific: 0, lowConfidence: 0, preset: 0 };
  const kept: KnowledgeEntry[] = [];

  for (const e of all) {
    if (e.source === "preset" || e.id.startsWith("preset-")) {
      dropped.preset++;
      continue;
    }
    if (e.confidence < 0.6) {
      dropped.lowConfidence++;
      continue;
    }
    if (isProjectSpecific(e)) {
      dropped.projectSpecific++;
      continue;
    }
    const k = dedupeKey(e);
    if (seen.has(k)) {
      dropped.dedupe++;
      continue;
    }
    seen.add(k);
    kept.push(e);
  }

  console.log("");
  console.log(`input  : ${all.length} active entries`);
  console.log(`dropped:`);
  console.log(`  preset (meta-principles already shipped): ${dropped.preset}`);
  console.log(`  confidence < 0.6                        : ${dropped.lowConfidence}`);
  console.log(`  project-specific paths                  : ${dropped.projectSpecific}`);
  console.log(`  dedupe (normalized trigger+correct)     : ${dropped.dedupe}`);
  console.log(`keep   : ${kept.length}`);
  console.log("");
  const byConf = new Map<string, number>();
  for (const e of kept) {
    const band = e.confidence >= 0.9 ? "0.9+" : e.confidence >= 0.8 ? "0.8" : e.confidence >= 0.7 ? "0.7" : "0.6";
    byConf.set(band, (byConf.get(band) ?? 0) + 1);
  }
  console.log("confidence distribution:");
  for (const b of ["0.9+", "0.8", "0.7", "0.6"]) {
    console.log(`  ${b}: ${byConf.get(b) ?? 0}`);
  }
  console.log("");

  const sorted = [...kept].sort((a, b) => b.confidence - a.confidence);
  console.log("top 5 (highest confidence):");
  for (const e of sorted.slice(0, 5)) {
    const snippet = e.correct_pattern.slice(0, 110).replace(/\s+/g, " ");
    console.log(`  [${e.confidence.toFixed(2)}] ${snippet}${e.correct_pattern.length > 110 ? "..." : ""}`);
  }
  console.log("");
  console.log("bottom 5 (0.6-0.7 band):");
  for (const e of sorted.slice(-5)) {
    const snippet = e.correct_pattern.slice(0, 110).replace(/\s+/g, " ");
    console.log(`  [${e.confidence.toFixed(2)}] ${snippet}${e.correct_pattern.length > 110 ? "..." : ""}`);
  }

  if (dryRun) {
    console.log("\n--dry-run: no file written");
    return;
  }

  fs.mkdirSync(outDir, { recursive: true });
  const lines: string[] = [];
  for (const e of kept) {
    const reseeded: KnowledgeEntry = {
      ...e,
      id: "seed-" + e.id,
      scope: { level: "global" },
      source: "preset",
      hit_count: 0,
      success_count: 0,
      override_count: 0,
      last_hit_at: "",
      evidence: { success_sessions: 0, success_users: 0, correction_sessions: 0 },
    };
    lines.push(JSON.stringify(reseeded));
  }
  fs.writeFileSync(outPath, lines.join("\n") + "\n", "utf-8");
  console.log(`\nwrote ${kept.length} entries → ${outPath}`);
}

main();
