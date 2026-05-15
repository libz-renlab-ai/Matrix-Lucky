#!/usr/bin/env tsx
/**
 * 一次性改写所有 avoidance 规则的 wrong_pattern 为通用关键词。
 *
 * 策略:
 *   - 扫 project + global DB 里所有 status=active 且 type=avoidance 的规则
 *   - 逐条喂 buildRetrofitPrompt → LLM 返回一行文本
 *   - 输出 "null" → **保留原 wrong_pattern 不动** (兜底, 不丢数据)
 *   - 输出关键词 → 合并: wrong_pattern = "<新关键词>|<原 pattern>" (兜底在后)
 *   - 写回 DB (dry-run 默认不写, 加 --apply 才落盘)
 *
 * 用法:
 *   pnpm tsx scripts/regenerate-wrong-patterns.ts            # dry-run, 给你看前后对比
 *   pnpm tsx scripts/regenerate-wrong-patterns.ts --apply    # 落盘
 *   pnpm tsx scripts/regenerate-wrong-patterns.ts --limit=5  # 只处理前 5 条 (调试用)
 *   pnpm tsx scripts/regenerate-wrong-patterns.ts --model=haiku  # 指定模型 (默认 haiku)
 */
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { fileURLToPath } from "node:url";
import {
  DualLayerStore,
  SqliteKnowledgeStore,
  ClaudeCodeLLMClient,
  openDb,
} from "../packages/adapters/src/index.js";
import { buildRetrofitPrompt } from "../packages/core/src/index.js";
import type { KnowledgeEntry } from "../packages/types/src/index.js";

interface Args {
  dryRun: boolean;
  limit?: number;
  model: string;
}

function parseArgs(argv: string[]): Args {
  const a: Args = { dryRun: true, model: "sonnet" };
  for (const x of argv) {
    if (x === "--apply") a.dryRun = false;
    else if (x.startsWith("--limit=")) a.limit = parseInt(x.slice(8), 10);
    else if (x.startsWith("--model=")) a.model = x.slice(8);
  }
  return a;
}

interface Outcome {
  id: string;
  before: string;
  llmOutput: string;
  after: string;
  action: "updated" | "kept-original" | "llm-error" | "invalid-output";
}

/** LLM 输出清洗: 裁前后空白, 去首尾引号/反引号. */
function cleanLLMOutput(raw: string): string {
  let s = raw.trim();
  // Strip markdown code fences if LLM disobeyed
  if (s.startsWith("```")) {
    s = s.replace(/^```[a-z]*\n?/i, "").replace(/\n?```$/, "").trim();
  }
  // Strip surrounding quotes
  if ((s.startsWith('"') && s.endsWith('"')) || (s.startsWith("'") && s.endsWith("'"))) {
    s = s.slice(1, -1).trim();
  }
  // Strip surrounding backticks
  if (s.startsWith("`") && s.endsWith("`")) s = s.slice(1, -1).trim();
  // Keep only first line (LLM might add explanation despite instructions)
  const firstLine = s.split(/\r?\n/)[0]?.trim() ?? "";
  return firstLine;
}

/** 黑名单: 已知坏 pattern 片段 */
const BAD_FRAGMENTS = [
  /^__[a-z]+__\/?$/i,         // __tests__/, __mocks__/
  /^packages\//,              // packages/
  /^@teamagent\//,            // @teamagent/...
  /^src\/?$/,                 // 纯 src/
  /^\.teamagent\//,           // .teamagent/
  /^node_modules/,            // node_modules
];

/** 过度通用 method-call 形式, 会误命中万物 */
const TOO_GENERIC_METHODS = [
  /^\.split\(/,
  /^\.map\(/,
  /^\.forEach\(/,
  /^\.then\(/,
  /^\.catch\(\)/,
  /^\.filter\(/,
  /^\.reduce\(/,
  /^\.toString\(/,
];

function isValidKeyword(s: string, originalPattern: string): boolean {
  if (!s || s.length < 3 || s.length > 200) return false;
  // Must not look like natural-language explanation
  if (s.includes("```") || s.includes("===")) return false;
  // Reject clear english prose heuristic: contains > 5 words separated by spaces in first 40 chars
  const head = s.slice(0, 40);
  const wordCount = head.split(/\s+/).length;
  if (wordCount > 6) return false;

  // Check every |-separated token for forbidden shapes
  const tokens = s.split("|").map((t) => t.trim()).filter(Boolean);
  if (tokens.length === 0) return false;
  for (const t of tokens) {
    if (BAD_FRAGMENTS.some((re) => re.test(t))) return false;
    if (TOO_GENERIC_METHODS.some((re) => re.test(t))) return false;
    // Pure path fragment (contains / but no lib-like signal)
    if (t.endsWith("/") && !t.includes("://")) return false;
  }

  // Copy-detection: if LLM just picked a >15-char substring of the original, reject
  const norm = (x: string) => x.replace(/\s+/g, " ").trim().toLowerCase();
  const origNorm = norm(originalPattern);
  for (const t of tokens) {
    if (t.length > 15 && origNorm.includes(norm(t))) return false;
  }

  return true;
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
  const projectDbPath = path.join(repoRoot, ".teamagent", "knowledge.db");
  const userGlobalDbPath = path.join(os.homedir(), ".teamagent", "global.db");

  console.log(`mode   : ${args.dryRun ? "dry-run (no writes)" : "APPLY (will update DBs)"}`);
  console.log(`model  : ${args.model}`);
  console.log(`limit  : ${args.limit ?? "(none)"}`);
  console.log(`project: ${projectDbPath}`);
  console.log(`global : ${userGlobalDbPath}`);
  console.log("");

  const store = new DualLayerStore({ projectDbPath, userGlobalDbPath });
  const all = store.findActive();
  const avoidance = all.filter((e) => e.type === "avoidance" && e.wrong_pattern);
  const targets = args.limit ? avoidance.slice(0, args.limit) : avoidance;
  console.log(`found ${avoidance.length} avoidance rules, processing ${targets.length}`);
  console.log("");

  const llm = new ClaudeCodeLLMClient({ model: args.model });
  const outcomes: Outcome[] = [];

  for (let i = 0; i < targets.length; i++) {
    const rule = targets[i]!;
    process.stdout.write(`[${i + 1}/${targets.length}] ${rule.id.slice(0, 30).padEnd(32)} ... `);

    let llmOutput = "";
    try {
      const prompt = buildRetrofitPrompt({
        trigger: rule.trigger,
        wrong_pattern: rule.wrong_pattern,
        correct_pattern: rule.correct_pattern,
        reasoning: rule.reasoning,
        tags: rule.tags,
      });
      const raw = await llm.complete(prompt);
      llmOutput = cleanLLMOutput(raw);
    } catch (err) {
      console.log("LLM error");
      outcomes.push({
        id: rule.id,
        before: rule.wrong_pattern,
        llmOutput: String(err).slice(0, 80),
        after: rule.wrong_pattern,
        action: "llm-error",
      });
      continue;
    }

    if (llmOutput.toLowerCase() === "null") {
      console.log("→ null (keep original)");
      outcomes.push({
        id: rule.id,
        before: rule.wrong_pattern,
        llmOutput: "null",
        after: rule.wrong_pattern,
        action: "kept-original",
      });
      continue;
    }

    if (!isValidKeyword(llmOutput, rule.wrong_pattern)) {
      console.log(`→ invalid output (${llmOutput.slice(0, 40)}..), keep original`);
      outcomes.push({
        id: rule.id,
        before: rule.wrong_pattern,
        llmOutput,
        after: rule.wrong_pattern,
        action: "invalid-output",
      });
      continue;
    }

    // Merge: new keyword first, original after (兜底). Dedupe if new === original.
    const merged =
      llmOutput === rule.wrong_pattern
        ? rule.wrong_pattern
        : `${llmOutput}|${rule.wrong_pattern}`;
    console.log(`→ ${llmOutput}`);
    outcomes.push({
      id: rule.id,
      before: rule.wrong_pattern,
      llmOutput,
      after: merged,
      action: "updated",
    });
  }

  // Summary
  console.log("");
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  const count = (k: Outcome["action"]) => outcomes.filter((o) => o.action === k).length;
  console.log(`updated       : ${count("updated")}`);
  console.log(`kept original : ${count("kept-original")}  (LLM returned null)`);
  console.log(`invalid output: ${count("invalid-output")}`);
  console.log(`llm errors    : ${count("llm-error")}`);
  console.log("");

  const updated = outcomes.filter((o) => o.action === "updated");
  if (updated.length > 0) {
    console.log("first 10 updates (before → after):");
    for (const o of updated.slice(0, 10)) {
      console.log(`  [${o.id.slice(0, 20)}]`);
      console.log(`    before : ${o.before.slice(0, 80)}`);
      console.log(`    after  : ${o.after.slice(0, 100)}`);
    }
  }

  if (args.dryRun) {
    console.log("");
    console.log("dry-run complete. re-run with --apply to write changes.");
    store.close();
    return;
  }

  // Apply
  console.log("");
  console.log("applying changes...");
  const projectStore = store.getProjectStore();
  const globalStore = store.getGlobalStore();
  let written = 0;
  for (const o of outcomes) {
    if (o.action !== "updated") continue;
    // find which store holds the rule (by id lookup on each)
    const inProject = projectStore.getById(o.id);
    const target: SqliteKnowledgeStore | null = inProject
      ? projectStore
      : globalStore.getById(o.id)
        ? globalStore
        : null;
    if (!target) {
      console.log(`  [${o.id.slice(0, 20)}] not found in either store, skip`);
      continue;
    }
    try {
      target.update(o.id, { wrong_pattern: o.after });
      written++;
    } catch (err) {
      console.log(`  [${o.id.slice(0, 20)}] update failed: ${String(err).slice(0, 80)}`);
    }
  }
  store.close();
  console.log(`wrote ${written} updates.`);
}

main().catch((err) => {
  console.error("fatal:", err);
  process.exit(1);
});
