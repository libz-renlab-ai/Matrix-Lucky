/**
 * Prod e2e judge for calibrator-v2 prod-judge.sh
 *
 * Reads pre/post snapshots and calibrate CLI output JSON,
 * asserts at least 1 demotion AND at least 1 promotion,
 * emits judge.json with:
 *   rules_demoted, rules_promoted, adjustments_total, pass (bool), evidence_dir
 */
import fs from "node:fs";

const preJsonPath   = process.env.PRE_JSON!;
const postJsonPath  = process.env.POST_JSON!;
const calJsonPath   = process.env.CAL_JSON!;
const judgeJsonPath = process.env.JUDGE_JSON!;
const evidenceDir   = process.env.EVIDENCE_DIR!;
const runId         = process.env.RUN_ID!;

const pre = JSON.parse(fs.readFileSync(preJsonPath, "utf-8")) as Record<
  string, { confidence: number; demerit: number; tier: string }
>;
const post = JSON.parse(fs.readFileSync(postJsonPath, "utf-8")) as Record<
  string, { confidence: number; demerit: number; tier: string }
>;
const cal = JSON.parse(fs.readFileSync(calJsonPath, "utf-8")) as {
  totalAdjusted: number;
  byScope: Array<{ adjustedCount: number }>;
};

const failures: string[] = [];
const rules_demoted: string[] = [];
const rules_promoted: string[] = [];
const TIER_RANK: Record<string, number> = {
  experimental: 0, probation: 1, stable: 2, canonical: 3, enforced: 4, dormant: -1,
};

// Check all rules for demotion (confidence drop OR demerit increase)
for (const id of Object.keys(pre)) {
  const preE  = pre[id]!;
  const postE = post[id];
  if (!postE) continue;
  const confDrop = postE.confidence < preE.confidence - 1e-9;
  const demRaise = postE.demerit   > preE.demerit   + 1e-9;
  const tierDrop = (TIER_RANK[postE.tier] ?? 0) < (TIER_RANK[preE.tier] ?? 0);
  if (confDrop || demRaise || tierDrop) {
    rules_demoted.push(id);
  }
}

// Check all rules for promotion (confidence increase OR tier upgrade)
for (const id of Object.keys(post)) {
  const preE  = pre[id];
  const postE = post[id]!;
  if (!preE) continue;
  const confUp   = postE.confidence > preE.confidence + 1e-9;
  const tierUp   = (TIER_RANK[postE.tier] ?? 0) > (TIER_RANK[preE.tier] ?? 0);
  if (confUp || tierUp) {
    rules_promoted.push(id);
  }
}

// Assertion 1: at least 1 rule demoted
if (rules_demoted.length === 0) {
  failures.push("No rules demoted: expected at least 1 confidence drop or demerit increase");
}

// Assertion 2: at least 1 rule promoted
if (rules_promoted.length === 0) {
  failures.push("No rules promoted: expected at least 1 confidence increase or tier upgrade");
}

// Assertion 3: total adjustments >= 1
const adjustments_total = cal.totalAdjusted;
if (adjustments_total < 1) {
  failures.push(`calibrate produced 0 adjustments (expected >= 1); totalAdjusted=${adjustments_total}`);
}

// Collect detail for rule-D and rule-P explicitly
const preD = pre["rule-D"];
const postD = post["rule-D"];
const preP = pre["rule-P"];
const postP = post["rule-P"];

const pass = failures.length === 0;
const judge = {
  run_id: runId,
  exit_code: pass ? 0 : 1,
  pass,
  adjustments_total,
  rules_demoted,
  rules_promoted,
  failures,
  evidence_dir: evidenceDir,
  pre_D:  preD  ? { confidence: preD.confidence,  demerit: preD.demerit,  tier: preD.tier  } : null,
  post_D: postD ? { confidence: postD.confidence, demerit: postD.demerit, tier: postD.tier } : null,
  pre_P:  preP  ? { confidence: preP.confidence,  demerit: preP.demerit,  tier: preP.tier  } : null,
  post_P: postP ? { confidence: postP.confidence, demerit: postP.demerit, tier: postP.tier } : null,
};

fs.writeFileSync(judgeJsonPath, JSON.stringify(judge, null, 2));
process.stdout.write(
  `judge: pass=${pass}, adjustments=${adjustments_total}, demoted=[${rules_demoted.join(",")}], promoted=[${rules_promoted.join(",")}]\n`,
);
if (failures.length > 0) {
  process.stderr.write("FAILURES:\n" + failures.map((f) => `  - ${f}`).join("\n") + "\n");
}
process.exit(pass ? 0 : 1);
