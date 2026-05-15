# Judge Playbook: Canary Skill — Hardmatch (claudefast vs Codex JSON Diff)

> Replaces archived script `docs/legacy/judge-scripts/docs/canary-verify/hardmatch.sh` per rule
> "third-party judge harness forbidden fixed scripts; MUST use md playbook"
> (`docs/HOWTO-PLAN-PR.md` § 3b).

## Origin
- Replaced script: `docs/legacy/judge-scripts/docs/canary-verify/hardmatch.sh`
- Original purpose: Deep-equal comparison between `claudefast.json` and `codex.json` outputs from the preceding two verifiers; exits 0 only when both files exist and are byte-identical after `jq -S` key-order canonicalization.
- Status: **ACTIVE**

## §V1 RUN
Commands MAIN agent dispatches; capture stdout/stderr to `evidence_dir = .judge/<run_id>/`:

- Step 1: Confirm both prerequisite output files exist (produced by the claudefast and codex probes respectively).
  ```
  test -f .judge/<run_id>/claudefast-registry.json || { echo "FAIL: claudefast-registry.json missing — run verify-claudefast playbook first"; exit 2; }
  test -f .judge/<run_id>/codex-registry.json     || { echo "FAIL: codex-registry.json missing — run verify-codex playbook first"; exit 2; }
  ```
- Step 2: Canonicalize both files by sorting keys with `jq -S`.
  ```
  jq -S . .judge/<run_id>/claudefast-registry.json > .judge/<run_id>/claudefast-registry.sorted.json
  jq -S . .judge/<run_id>/codex-registry.json      > .judge/<run_id>/codex-registry.sorted.json
  ```
- Step 3: Diff the two canonical forms; write diff output to evidence.
  ```
  diff -u \
    .judge/<run_id>/claudefast-registry.sorted.json \
    .judge/<run_id>/codex-registry.sorted.json \
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
    "claudefast_json_present": true,
    "codex_json_present": true,
    "canonical_diff_exit_code": 0,
    "hardmatch_pass": true
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
> PASS criteria: `exit_code` is 0; `metrics.hardmatch_pass` is `true`; `metrics.canonical_diff_exit_code` is 0; both JSON files are present.
> FAIL criteria: `exit_code` non-zero; diff returned non-zero (files differ); one or both input files are absent.
> SKIP if either prerequisite playbook (verify-claudefast or verify-codex) has not been run for this `<run_id>`.

## Notes
- Original logic summary: The script created two temp files, canonicalized each registry JSON with `jq -S` to normalize key order, then ran `diff -u` for byte-level equality. A clean diff (exit 0) means both tools produced structurally identical registry descriptions for the `canary` skill. On pass it printed the canonical JSON; on fail it printed the diff and exited 1. This is the cheapest possible cross-tool consistency gate: no model invoked, pure file comparison.
- Known dependencies / limitations:
  - Must run after both verify-claudefast and verify-codex playbooks have populated their output JSONs in the same `<run_id>` directory.
  - If the two probes use different JSON schemas (e.g., claudefast emits `null` for `name` when missing, while codex always emits a string), the hardmatch will legitimately fail. Review both schemas before diagnosing a spurious diff.
  - `jq -S` sorts object keys but does not normalize whitespace or numeric formatting; ensure both upstream playbooks write via `jq` (not raw string concat) to avoid phantom diffs.
