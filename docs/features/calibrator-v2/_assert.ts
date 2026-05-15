import fs from "node:fs";

const preJsonPath    = process.env.PRE_JSON!;
const postJsonPath   = process.env.POST_JSON!;
const calJsonPath    = process.env.CAL_JSON!;
const judgeJsonPath  = process.env.JUDGE_JSON!;
const evidenceDir    = process.env.EVIDENCE_DIR!;
const runId         = process.env.RUN_ID!;

const pre = JSON.parse(fs.readFileSync(preJsonPath, "utf-8")) as Record<
  string, { confidence: number; demerit: number; tier: string }
>;
const post = JSON.parse(fs.readFileSync(postJsonPath, "utf-8")) as Record<
  string, { confidence: number; demerit: number; tier: string }
>;
const cal = JSON.parse(fs.readFileSync(calJsonPath, "utf-8")) as {
  totalAdjusted: number;
};

const failures: string[] = [];
const demoted_rule_ids: string[] = [];
const promoted_rule_ids: string[] = [];

// Assertion 1: rule-X demoted (confidence_post < confidence_pre OR demerit increased)
const preX  = pre["rule-X"];
const postX = post["rule-X"];
if (!preX || !postX) {
  failures.push("rule-X not found in snapshots");
} else {
  const confDrop  = postX.confidence < preX.confidence - 1e-9;
  const demRaise  = postX.demerit > preX.demerit + 1e-9;
  if (!confDrop && !demRaise) {
    failures.push(
      `rule-X not demoted: confidence ${preX.confidence.toFixed(4)} → ${postX.confidence.toFixed(4)}, demerit ${preX.demerit.toFixed(4)} → ${postX.demerit.toFixed(4)}`
    );
  } else {
    demoted_rule_ids.push("rule-X");
  }
}

// Assertion 2: rule-Y demoted (confidence_post < confidence_pre OR demerit increased)
const preY  = pre["rule-Y"];
const postY = post["rule-Y"];
if (!preY || !postY) {
  failures.push("rule-Y not found in snapshots");
} else {
  const confDrop  = postY.confidence < preY.confidence - 1e-9;
  const demRaise  = postY.demerit > preY.demerit + 1e-9;
  if (!confDrop && !demRaise) {
    failures.push(
      `rule-Y not demoted: confidence ${preY.confidence.toFixed(4)} → ${postY.confidence.toFixed(4)}, demerit ${preY.demerit.toFixed(4)} → ${postY.demerit.toFixed(4)}`
    );
  } else {
    demoted_rule_ids.push("rule-Y");
  }
}

// Assertion 3: at least one neutral rule unchanged
const TIER_RANK: Record<string, number> = {
  experimental: 0, probation: 1, stable: 2, canonical: 3, enforced: 4, dormant: -1,
};

let unchangedCount = 0;
for (const id of Object.keys(pre)) {
  if (!id.startsWith("rule-N")) continue;
  const preN  = pre[id]!;
  const postN = post[id];
  if (!postN) continue;
  if (
    Math.abs(postN.confidence - preN.confidence) < 1e-9 &&
    Math.abs(postN.demerit   - preN.demerit)    < 1e-9
  ) {
    unchangedCount++;
  }
}
if (unchangedCount === 0) {
  failures.push("no neutral rules unchanged (expected at least 1 of 30 rule-N* to be untouched)");
}

// Assertion 4: adjustments_count >= 2
if (cal.totalAdjusted < 2) {
  failures.push(`calibrate.json adjustments_count=${cal.totalAdjusted}, expected >= 2`);
}

// Collect promoted rules
for (const id of Object.keys(post)) {
  const preE  = pre[id];
  const postE = post[id]!;
  if (!preE) continue;
  if ((TIER_RANK[postE.tier] ?? -1) > (TIER_RANK[preE.tier] ?? -1)) {
    promoted_rule_ids.push(id);
  }
}

const exit_code = failures.length === 0 ? 0 : 1;

const judge = {
  run_id: runId,
  exit_code,
  adjustments_count: cal.totalAdjusted,
  demoted_rule_ids,
  promoted_rule_ids,
  unchanged_count: unchangedCount,
  failures,
  evidence_dir: evidenceDir,
  pre_stats_path: preJsonPath,
  post_stats_path: postJsonPath,
  pre_X:  preX  ? { confidence: preX.confidence,  demerit: preX.demerit  } : null,
  post_X: postX ? { confidence: postX.confidence, demerit: postX.demerit } : null,
  pre_Y:  preY  ? { confidence: preY.confidence,  demerit: preY.demerit  } : null,
  post_Y: postY ? { confidence: postY.confidence, demerit: postY.demerit } : null,
};

fs.writeFileSync(judgeJsonPath, JSON.stringify(judge, null, 2));
process.stdout.write(`judge.json: exit_code=${exit_code}, adjustments=${cal.totalAdjusted}, demoted=[${demoted_rule_ids.join(",")}], unchanged=${unchangedCount}\n`);
if (failures.length > 0) {
  process.stderr.write("ASSERTION FAILURES:\n" + failures.map((f) => `  - ${f}`).join("\n") + "\n");
}
process.exit(exit_code);
