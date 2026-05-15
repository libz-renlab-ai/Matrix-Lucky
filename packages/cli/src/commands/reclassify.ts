/**
 * M4-A: teamagent reclassify apply/rollback.
 *
 * Takes the JSON plan produced by scripts/reclassify-rules.ts, updates the
 * project knowledge.db's channel+enforcement per entry, appends a rollback
 * record to ~/.teamagent/reclassify-audit.jsonl. Rollback reads that audit
 * and reverses the moves.
 */
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { openDb } from "@teamagent/adapters/storage/sqlite/schema";

export interface ApplyOptions {
  plan: string;
  dryRun?: boolean;
  minConfidence?: number;
}

export interface RollbackOptions {
  auditId: string;
}

interface PlanEntry {
  id: string;
  wrong_pattern: string;
  old_channel: string;
  new_channel: string;
  old_enforcement: string;
  new_enforcement: string;
  confidence: number;
  reason: string;
}

interface AuditRecord {
  id: string;
  plan_file: string;
  applied_at: string;
  rollback: Array<{ id: string; channel: string; enforcement: string }>;
}

function auditPath(): string {
  return path.join(os.homedir(), ".teamagent", "reclassify-audit.jsonl");
}

export function runReclassifyApply(opts: ApplyOptions): void {
  const planJson = JSON.parse(fs.readFileSync(opts.plan, "utf8"));
  const plan: PlanEntry[] = planJson.plan ?? [];
  const minConf = opts.minConfidence ?? 0.7;
  const dbPath = path.join(process.cwd(), ".teamagent", "knowledge.db");
  if (!fs.existsSync(dbPath)) {
    console.error(`knowledge.db not found at ${dbPath}`);
    process.exit(1);
  }
  const db = openDb(dbPath);

  const eligible = plan.filter((p) => p.confidence >= minConf);
  const skipped = plan.length - eligible.length;

  const rollback: AuditRecord["rollback"] = [];
  const updateStmt = db.prepare(
    `UPDATE knowledge SET channel = @ch, enforcement = @enf WHERE id = @id`,
  );

  let applied = 0;
  for (const entry of eligible) {
    rollback.push({
      id: entry.id,
      channel: entry.old_channel,
      enforcement: entry.old_enforcement,
    });
    if (!opts.dryRun) {
      updateStmt.run({
        ch: entry.new_channel,
        enf: entry.new_enforcement,
        id: entry.id,
      });
    }
    applied++;
  }

  if (!opts.dryRun && applied > 0) {
    const auditId = `audit-${new Date().toISOString().replace(/[:.]/g, "-")}`;
    const record: AuditRecord = {
      id: auditId,
      plan_file: path.resolve(opts.plan),
      applied_at: new Date().toISOString(),
      rollback,
    };
    fs.mkdirSync(path.dirname(auditPath()), { recursive: true });
    fs.appendFileSync(auditPath(), JSON.stringify(record) + "\n");
    console.log(`Applied ${applied} reclassifications.`);
    if (skipped > 0) {
      console.log(`Skipped ${skipped} entries below confidence ${minConf}.`);
    }
    console.log(`Audit id: ${auditId}`);
    console.log(`Rollback: teamagent reclassify rollback --audit ${auditId}`);
  } else if (opts.dryRun) {
    console.log(`[dry-run] Would apply ${applied} reclassifications (skipped ${skipped} below conf ${minConf}).`);
  }

  db.close();
}

export function runReclassifyRollback(opts: RollbackOptions): void {
  const file = auditPath();
  if (!fs.existsSync(file)) {
    console.error(`No audit log at ${file}`);
    process.exit(1);
  }
  const lines = fs.readFileSync(file, "utf8").split("\n").filter(Boolean);
  const record = lines
    .map((l) => JSON.parse(l) as AuditRecord)
    .find((r) => r.id === opts.auditId);
  if (!record) {
    console.error(`Audit id ${opts.auditId} not found.`);
    process.exit(1);
  }
  const dbPath = path.join(process.cwd(), ".teamagent", "knowledge.db");
  const db = openDb(dbPath);
  const stmt = db.prepare(
    `UPDATE knowledge SET channel = @ch, enforcement = @enf WHERE id = @id`,
  );
  let n = 0;
  for (const r of record.rollback) {
    stmt.run({ ch: r.channel, enf: r.enforcement, id: r.id });
    n++;
  }
  console.log(`Rolled back ${n} rules to pre-apply channel/enforcement.`);
  db.close();
}
