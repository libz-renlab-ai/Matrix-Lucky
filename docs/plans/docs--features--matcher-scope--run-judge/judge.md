# Judge Playbook: matcher-scope/run-judge

> Replaces archived script `docs/legacy/judge-scripts/docs/features/matcher-scope/run-judge.sh` per rule
> "third-party judge harness forbidden fixed scripts; MUST use md playbook"
> (`docs/HOWTO-PLAN-PR.md` § 3b).

## Origin
- Replaced script: `docs/legacy/judge-scripts/docs/features/matcher-scope/run-judge.sh`
- Original purpose: Matcher scope regression harness that probes `claudefast` with two prompts to verify the canned-answer dispatch still fires (Probe A: product features list generated; Probe B: CEO/duck CSV with correct header).
- Status: **ACTIVE-PARTIAL** (depends on canned answers deleted at d341da8)

## §V1 RUN
Concrete commands from source:

- Step 1: Set run ID and create evidence directory:
  ```bash
  RUN_ID="$(date +%s)"
  EVIDENCE_DIR=".judge/matcher/$RUN_ID"
  mkdir -p "$EVIDENCE_DIR"
  ```

- Step 2: Run Probe A — query claudefast for full product feature list and capture output:
  ```bash
  claudefast -p "list all product features" 2>&1 | head -100 > "$EVIDENCE_DIR/probe-a.txt"
  PROBE_A_LINES=$(grep -c '[^[:space:]]' "$EVIDENCE_DIR/probe-a.txt" || true)
  # PASS criterion: PROBE_A_LINES > 5
  ```

- Step 3: Run Probe B — query claudefast for product (not tech) features and capture output:
  ```bash
  claudefast -p "list product feature not tech feature" 2>&1 | head -100 > "$EVIDENCE_DIR/probe-b.txt"
  # PASS criterion: response contains the exact CSV header string:
  # '"状态","功能","给小鸭CEO/VC的解释"'
  PROBE_B_HAS_CSV=$(grep -qF '"状态","功能","给小鸭CEO/VC的解释"' "$EVIDENCE_DIR/probe-b.txt" && echo true || echo false)
  ```

- Step 4: Write judge.json and run LLM verdict:
  ```bash
  # Write judge.json with probe results
  cat > "$EVIDENCE_DIR/judge.json" <<EOF
  {
    "run_id": "<run_id>",
    "exit_code": 0,
    "probe_a_lines": <int>,
    "probe_b_lines": <int>,
    "probe_b_has_csv_header": <bool>,
    "evidence_dir": "<path>",
    "stdout_paths": { "a": "<probe-a.txt>", "b": "<probe-b.txt>" }
  }
  EOF

  # LLM judge reads the JSON and emits PASS or FAIL
  claudefast -p "read this judge.json and return PASS only if probe_a_lines > 5 AND probe_b_has_csv_header = true; else FAIL with which probe failed. JSON: $(cat "$EVIDENCE_DIR/judge.json")" \
    2>&1 > "$EVIDENCE_DIR/verdict.txt"
  ```

Capture to `evidence_dir = .judge/matcher/<run_id>/`.

## §V2 DUMP
```json
{
  "exit_code": 0,
  "metrics": {
    "probe_a_lines": "> 5",
    "probe_b_has_csv_header": "= true"
  },
  "evidence_dir": ".judge/matcher/<run_id>",
  "stdout_paths": {
    "a": ".judge/matcher/<run_id>/probe-a.txt",
    "b": ".judge/matcher/<run_id>/probe-b.txt"
  },
  "verdict_path": ".judge/matcher/<run_id>/verdict.txt",
  "feature_status": "active-partial"
}
```

Document EXACT thresholds from source:
- Probe A: `probe_a_lines > 5` (claudefast returns a non-empty product feature list)
- Probe B: `probe_b_has_csv_header == true` (response contains literal string `"状态","功能","给小鸭CEO/VC的解释"`)

## §V3 READ
`claudefast -p`:
> Read judge.json + evidence_dir. PASS / FAIL / SKIP.
>
> PASS criteria:
> - `metrics.probe_a_lines > 5`
> - `metrics.probe_b_has_csv_header == true`
> - `verdict.txt` contains `PASS`
>
> FAIL criteria:
> - `probe_a_lines <= 5` (Probe A suppressed or empty)
> - `probe_b_has_csv_header == false` (CSV header absent from Probe B response)
> - `verdict.txt` contains `FAIL`
>
> SKIP if infra missing: `claudefast` not available in PATH; or the canned answers
> that Probe A and Probe B rely on have been deleted (as of commit d341da8, the
> `CLAUDE.md` managed block containing the product-features canned answer was
> removed). In that case emit SKIP with note: "Probe A expected product features
> generated via deleted CLAUDE.md canned answer; playbook cannot PASS until
> docs are re-anchored."

## Notes
- Original logic summary: The script fires two `claudefast -p` calls (head-limited to 100 lines
  each to avoid token overflow), saves output to probe-a.txt and probe-b.txt, then evaluates two
  mechanical checks: (1) non-trivial line count for Probe A, (2) exact CSV header substring match
  for Probe B. It then calls `claudefast -p` a third time as the LLM judge, passing the
  judge.json inline and asking it to return PASS or FAIL with which probe failed.
- Dependencies:
  - `claudefast` in PATH (non-interactive `-p` mode)
  - CLAUDE.md canned answer for `list all product features` (provides the 58-feature list);
    **deleted at d341da8** — Probe A will emit 0–5 lines and fail until re-anchored
  - CLAUDE.md canned answer for `list product feature not tech feature` (provides the 9-row
    CEO/duck CSV); **also at risk** if the managed block is gone
- For matcher-scope specifically: Probe A expected "product features generated" via the deleted
  CLAUDE.md canned answer; this playbook's §V3 will often emit SKIP or FAIL until the docs are
  re-anchored to a source of truth (e.g. `docs/PRODUCT-FEATURES.md` or a reinstated canned
  answer in CLAUDE.md).

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
