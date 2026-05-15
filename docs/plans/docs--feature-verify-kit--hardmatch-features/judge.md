# Judge Playbook: Feature Verify Kit — Hardmatch Feature JSON vs Fixture

> Replaces archived script `docs/legacy/judge-scripts/docs/feature-verify-kit/hardmatch-features.sh` per rule
> "third-party judge harness forbidden fixed scripts; MUST use md playbook"
> (`docs/HOWTO-PLAN-PR.md` § 3b).

## Origin
- Replaced script: `docs/legacy/judge-scripts/docs/feature-verify-kit/hardmatch-features.sh`
- Original purpose: Deep-equal comparison between the 7-key feature JSON extracted by `verify-claude-stream-json` and the golden fixture `fixtures/expected-product-features.json`, with an additional assertion that all values are non-blank strings (not nested JSON).
- Status: **ACTIVE**

## §V1 RUN
Commands MAIN agent dispatches; capture stdout/stderr to `evidence_dir = .judge/<run_id>/`:

- Step 1: Confirm both input files exist.
  ```
  test -f .judge/<run_id>/claude-features.json \
    || { echo "FAIL: claude-features.json missing — run verify-claude-stream-json playbook first"; exit 2; }
  test -f fixtures/expected-product-features.json \
    || { echo "FAIL: fixtures/expected-product-features.json missing — check repo"; exit 2; }
  ```
- Step 2: Canonicalize both files with `jq -S` and validate that all values in the extracted file are non-empty, non-nested strings.
  ```
  jq -S . .judge/<run_id>/claude-features.json  > .judge/<run_id>/claude-features.sorted.json
  jq -S . fixtures/expected-product-features.json > .judge/<run_id>/expected-features.sorted.json

  # Validate non-blank, non-nested values
  jq -e 'to_entries | all(.value | type == "string" and (gsub("\\s+"; "") | length > 0))' \
    .judge/<run_id>/claude-features.json \
    > .judge/<run_id>/value-validation.log 2>&1
  ```
- Step 3: Diff the two canonical forms.
  ```
  diff -u \
    .judge/<run_id>/expected-features.sorted.json \
    .judge/<run_id>/claude-features.sorted.json \
    > .judge/<run_id>/hardmatch.diff 2>&1
  DIFF_EXIT=$?
  echo "diff exit: $DIFF_EXIT" >> .judge/<run_id>/hardmatch.diff
  ```

## §V2 DUMP
Canonical JSON to `.judge/<run_id>/judge.json`:
```json
{
  "exit_code": 0,
  "metrics": {
    "claude_features_json_present": true,
    "fixture_json_present": true,
    "all_values_non_blank_strings": true,
    "canonical_diff_exit_code": 0,
    "hardmatch_pass": true,
    "keys_checked": [
      "positioning", "metrics", "market_gap",
      "delivered_vs_planned", "hooks",
      "knowledge_delivery", "self_evolution"
    ]
  },
  "evidence_dir": ".judge/<run_id>/",
  "stdout_path": ".judge/<run_id>/hardmatch.diff",
  "stderr_path": ".judge/<run_id>/hardmatch.diff",
  "feature_status": "active"
}
```

## §V3 READ
`claudefast -p` prompt:
> Read `.judge/<run_id>/judge.json` and evidence in `evidence_dir`.
> Emit `PASS` / `FAIL` / `SKIP`.
> PASS criteria: `exit_code` is 0; `metrics.hardmatch_pass` is `true`; `metrics.canonical_diff_exit_code` is 0; `metrics.all_values_non_blank_strings` is `true`.
> FAIL criteria: `exit_code` non-zero; diff returned non-zero (values differ from fixture); any value is blank or nested JSON; either input file is absent.
> SKIP if `verify-claude-stream-json` playbook has not been run for this `<run_id>` or `fixtures/expected-product-features.json` does not exist.

## Notes
- Original logic summary: The script called `jq -S` on both the live-extracted feature JSON and the golden fixture, then ran `diff -u` for byte-level key-value equality. Before diffing it asserted (via `jq -e`) that every value in the live file is a non-empty string whose whitespace-stripped form has positive length — this guards against the model returning blank strings or nested JSON objects. The contract comment in the original explicitly prohibits downgrading to keys-only comparison (referencing issue #64 and commits 39e81ea / 9c78f99), meaning values must match verbatim, not just keys.
- Known dependencies / limitations:
  - Must run after `verify-claude-stream-json` playbook has produced `.judge/<run_id>/claude-features.json`.
  - `fixtures/expected-product-features.json` is the golden source of truth; if `docs/系统展示.md` is updated, the fixture must be updated in the same PR to keep them in sync.
  - The contract (from `README.md ## Hardmatch contract`) forbids relaxing to keys-only comparison; any future proposal to do so must reference and supersede that contract explicitly.
  - `jq -S` sorts keys but does not normalize Unicode normalization forms; if Chinese strings have different NFC/NFD encodings between the fixture and the live extraction, a spurious diff will result.
