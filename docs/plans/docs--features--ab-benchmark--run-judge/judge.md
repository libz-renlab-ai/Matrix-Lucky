# Judge Playbook: ab-benchmark / run-judge

> Replaces archived script `docs/legacy/judge-scripts/docs/features/ab-benchmark/run-judge.sh` per rule
> "third-party judge harness forbidden fixed scripts; MUST use md playbook"
> (`docs/HOWTO-PLAN-PR.md` § 3b).

## Origin
- Replaced script: `docs/legacy/judge-scripts/docs/features/ab-benchmark/run-judge.sh`
- Original purpose: Run an A/B benchmark comparing bare Claude (arm-a, no rules) versus TeamAgent-armed Claude (arm-b, 10 rules injected via CLAUDE.md) across 10 probe scenarios, asserting that arm-b achieves at least 50% mistake reduction relative to arm-a.
- Status: **ACTIVE**

## §V1 RUN

Concrete commands (extracted from source):

- Step 1: Locate inputs — `docs/features/ab-benchmark/probes.json` (10 probe definitions with `id`, `name`, `prompt`, `mistake_regex`, `rule_tag`) and `docs/features/ab-benchmark/arm-b-rules.json` (10 rules with `wrong_pattern`, `correct_pattern`, `reasoning`).
- Step 2: Build arm-b CLAUDE.md — render `arm-b-rules.json` entries into `<evidence_dir>/arm-b-config/CLAUDE.md` using the inline Python script (one AVOID/PREFER bullet per rule).
- Step 3: Run 20 claudefast calls (10 probes × 2 arms) sequentially — for each probe `p` in `probes.json`:
  - arm-a: `CLAUDE_CONFIG_DIR=<arm_a_config> claudefast -p "<p.prompt>" --max-turns 2 --permission-mode acceptEdits --output-format text` → `<evidence_dir>/arm-a/<p.id>.txt`
  - arm-b: `CLAUDE_CONFIG_DIR=<arm_b_config> claudefast -p "<p.prompt>" --max-turns 2 --permission-mode acceptEdits --output-format text` → `<evidence_dir>/arm-b/<p.id>.txt`
- Step 4: Score results — for each probe, apply `mistake_regex` (case-insensitive) to arm-a and arm-b response text; record `arm_a_mistake`, `arm_b_mistake`, `avoided` (arm-a made mistake and arm-b did not).
- Step 5: Compute metrics:
  - `mistake_repeated_a` = count of probes where arm-a made mistake
  - `mistake_repeated_b` = count of probes where arm-b made mistake
  - `reduction_pct` = `1 - (mistake_repeated_b / mistake_repeated_a)` (None if arm-a made 0 mistakes)
  - `avoided_count` = count of probes where `avoided == true`
  - PASS assertion: `reduction_pct >= 0.50`
- Step 6: Write `judge.json` to `evidence_dir` and a canonical copy to `docs/features/ab-benchmark/judge.json`.
- Step 7: Exit 0 if `assertion.result == "PASS"`, exit 1 otherwise.

Capture to `evidence_dir = /tmp/.judge/ab/<timestamp>/` (or `$JUDGE_DIR` override).

## §V2 DUMP

```json
{
  "exit_code": 0,
  "metrics": {
    "run_id": "ab-<timestamp>",
    "recipe_id": "AB-BENCHMARK-001",
    "probes_total": 10,
    "arm_a_label": "bare-claude (no rules)",
    "arm_b_label": "teamagent-armed (10 rules)",
    "mistake_repeated_a": 7,
    "mistake_repeated_b": 2,
    "reduction_pct": 0.7143,
    "avoided_count": 5,
    "reduction_pct_gte_050": true,
    "result": "PASS"
  },
  "evidence_dir": "/tmp/.judge/ab/<timestamp>",
  "stdout_path": "/tmp/.judge/ab/<timestamp>/stdout.log",
  "stderr_path": "/tmp/.judge/ab/<timestamp>/stdout.log",
  "feature_status": "active"
}
```

## §V3 READ

`claudefast -p` prompt:
> Read judge.json + evidence_dir. PASS / FAIL / SKIP.
> PASS criteria: `assertion.result` == `"PASS"`, meaning `metrics.reduction_pct` >= 0.50 (arm-b reduced mistakes by at least 50% relative to arm-a across the 10 probes).
> FAIL criteria: `assertion.result` == `"FAIL"` — `reduction_pct` < 0.50, OR `reduction_pct` is null (arm-a made zero mistakes, meaning the probe set is not challenging bare Claude). Inspect `per_probe` array in judge.json to identify which specific probes arm-b failed to avoid.
> SKIP if `docs/features/ab-benchmark/probes.json` or `arm-b-rules.json` is missing, or if `claudefast` / `python3` is unavailable.

## Notes

- Original logic summary: The harness implements a controlled A/B benchmark with full environment isolation per arm. Arm-a uses an empty `CLAUDE_CONFIG_DIR` (no injected rules); arm-b uses a config dir containing a generated CLAUDE.md that lists 10 TeamAgent rules as AVOID/PREFER bullets. Both arms receive identical prompts from `probes.json`. A `mistake_regex` per probe (case-insensitive) detects whether the response contains the anti-pattern that the corresponding TeamAgent rule is meant to prevent. The `reduction_pct >= 0.50` threshold is the canonical pass bar (recipe `AB-BENCHMARK-001`). The canonical copy of `judge.json` written back to `docs/features/ab-benchmark/judge.json` allows the repo to record the latest benchmark result in VCS.
- Dependencies / limitations:
  - Requires `claudefast` in PATH (20 sequential calls; constraint from source: ≤25 total).
  - Requires `python3` for the inline scoring and CLAUDE.md generation scripts.
  - `probes.json` and `arm-b-rules.json` must be maintained in `docs/features/ab-benchmark/` — they are separate from this playbook.
  - If `mistake_repeated_a == 0` (arm-a never made the mistake), `reduction_pct` is null and the benchmark FAILs by design — the probe set must be updated to include challenging scenarios that actually trip bare Claude.
  - The canonical copy at `docs/features/ab-benchmark/judge.json` is overwritten on each run; commit it to track benchmark regressions.
  - `JUDGE_DIR` env var overrides the default `/tmp/.judge/ab/<ts>` output directory.

<self-report>
premature_stopping: false
permission_seeking: false
ownership_dodging: false
simplest_fix: false
reasoning_loop: false
known_limitation: false
skipped_repo_search: false
fabricated_value: false
placeholder_used: false
ambiguity_unresolved: false
contradiction_unresolved: false
silent_fallback: false
</self-report>
