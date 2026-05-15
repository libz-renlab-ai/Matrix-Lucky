/**
 * 一次性迁移：为现有 LLM 提取的（source=accumulated 且没有 scope.paths/file_types 的）
 * 知识条目补上默认 DEFAULT_CODE_FILE_TYPES。修完 M4 scope 反噬 bug 后用一次就够。
 *
 * 用法:
 *   pnpm tsx scripts/backfill-llm-scope.ts [--dry-run]
 */
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { DEFAULT_CODE_FILE_TYPES } from "../packages/core/src/index.js";

const DRY = process.argv.includes("--dry-run");
const home = os.homedir();
const stores = [
  path.resolve("./.teamagent/knowledge.jsonl"),
  path.join(home, ".teamagent", "personal", "knowledge.jsonl"),
  path.join(home, ".teamagent", "global", "knowledge.jsonl"),
];

let total = 0;
let patched = 0;

for (const storePath of stores) {
  if (!fs.existsSync(storePath)) continue;
  const raw = fs.readFileSync(storePath, "utf-8");
  const lines = raw.split("\n").filter((l) => l.trim());
  const out: string[] = [];
  let storePatched = 0;
  for (const line of lines) {
    total++;
    const entry = JSON.parse(line);
    const needsBackfill =
      entry.source === "accumulated" &&
      (!entry.scope.paths || entry.scope.paths.length === 0) &&
      (!entry.scope.file_types || entry.scope.file_types.length === 0);
    if (needsBackfill) {
      entry.scope.file_types = [...DEFAULT_CODE_FILE_TYPES];
      entry.last_validated_at = new Date().toISOString();
      storePatched++;
      patched++;
      console.log(`  [patch] ${entry.id}  trigger: ${entry.trigger.slice(0, 60)}`);
    }
    out.push(JSON.stringify(entry));
  }
  if (storePatched > 0 && !DRY) {
    const tmp = `${storePath}.tmp-${process.pid}`;
    fs.writeFileSync(tmp, out.join("\n") + "\n", "utf-8");
    fs.renameSync(tmp, storePath);
  }
  console.log(
    `${storePath}: ${storePatched} / ${lines.length} patched${DRY ? " (dry-run)" : ""}`,
  );
}

console.log(`\n总计: ${patched} / ${total} 条打上 DEFAULT_CODE_FILE_TYPES`);
if (DRY) console.log("(dry-run，未写盘)");
