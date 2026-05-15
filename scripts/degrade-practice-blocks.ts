#!/usr/bin/env tsx
/**
 * M3 洞2 软着陆脚本：一次性降级已入库的 practice+wrong_pattern+block 规则到 warn。
 *
 * 背景：
 * - M3 洞1 (commit refactor(m3): decouple matcher from rule.type) 解冻了 34 条
 *   type=practice+wrong_pattern 规则。其中 11 条 enforcement=block 原本因 matcher
 *   硬筛从未生效，没经过 warn 期 hit_count / ignored 比例的质量筛选。
 * - 直接以 block 上线风险：某条 LLM 瞎填的 wrong_pattern 突然频繁误拦 AI → 体验炸。
 *
 * 做法：
 * - 把所有 `type=practice AND wrong_pattern!='' AND enforcement='block'` 的规则
 *   临时降级到 'warn'，重置 tier_entered_at 进入观察窗口。
 * - 后续靠 warn → ignored/complied 事件流 (M2.5 已实现) 收集真实使用数据，
 *   由人工或自动 calibrator 决定升回 block 或归档。
 *
 * 使用：
 *   pnpm tsx scripts/degrade-practice-blocks.ts [--db <path>] [--dry-run]
 *
 * 默认 db 路径: ./.teamagent/knowledge.db
 * --dry-run: 只打印会改哪些规则，不实际改
 *
 * 幂等：已降级过的规则不会被再次改 (它们已经是 warn)。可以安全重跑。
 */
import { DatabaseSync } from "node:sqlite";
import path from "node:path";
import process from "node:process";

function parseArgs(): { dbPath: string; dryRun: boolean } {
  const args = process.argv.slice(2);
  let dbPath = path.resolve(process.cwd(), ".teamagent/knowledge.db");
  let dryRun = false;

  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === "--db" && args[i + 1]) {
      dbPath = path.resolve(args[i + 1]!);
      i++;
    } else if (a === "--dry-run") {
      dryRun = true;
    } else if (a === "--help" || a === "-h") {
      process.stdout.write(
        "Usage: degrade-practice-blocks.ts [--db <path>] [--dry-run]\n",
      );
      process.exit(0);
    }
  }
  return { dbPath, dryRun };
}

function main(): void {
  const { dbPath, dryRun } = parseArgs();

  process.stdout.write(`[degrade-practice-blocks] db=${dbPath} dry_run=${dryRun}\n`);

  const db = new DatabaseSync(dbPath);

  // 查询候选
  const rows = db
    .prepare(
      `SELECT id, wrong_pattern, confidence, current_tier, hit_count
       FROM knowledge
       WHERE type='practice'
         AND wrong_pattern IS NOT NULL AND wrong_pattern != ''
         AND enforcement='block'
         AND status='active'`,
    )
    .all() as Array<{
    id: string;
    wrong_pattern: string;
    confidence: number;
    current_tier: string;
    hit_count: number;
  }>;

  if (rows.length === 0) {
    process.stdout.write("[degrade-practice-blocks] no candidate rules found → nothing to do\n");
    db.close();
    return;
  }

  process.stdout.write(`[degrade-practice-blocks] ${rows.length} candidate rule(s):\n`);
  for (const r of rows) {
    const wp = r.wrong_pattern.length > 40 ? r.wrong_pattern.slice(0, 40) + "…" : r.wrong_pattern;
    process.stdout.write(
      `  · ${r.id}  conf=${r.confidence.toFixed(2)} tier=${r.current_tier} hits=${r.hit_count}  wp="${wp}"\n`,
    );
  }

  if (dryRun) {
    process.stdout.write("[degrade-practice-blocks] --dry-run → not modifying DB\n");
    db.close();
    return;
  }

  const nowIso = new Date().toISOString();
  const stmt = db.prepare(
    `UPDATE knowledge
     SET enforcement='warn', tier_entered_at=?
     WHERE id=?`,
  );
  let changed = 0;
  for (const r of rows) {
    const res = stmt.run(nowIso, r.id);
    if (res.changes) changed++;
  }

  process.stdout.write(
    `[degrade-practice-blocks] degraded ${changed}/${rows.length} rules from block → warn\n`,
  );
  process.stdout.write(
    `[degrade-practice-blocks] next: observe ignored/complied ratio for ~2 weeks then decide\n`,
  );
  db.close();
}

main();
