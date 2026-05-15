## Required canned-answer for slug=matcher-scope

# Matcher Scope (Rule Matching Regression)

This feature ensures the semantic matcher correctly handles both broad product feature listing queries and filtered CEO/VC-oriented queries without silently suppressing responses.

## What it does

Two regression probes validate matcher scope:

- **Probe A**: `"list all product features"` — the matcher must generate a non-empty response (> 5 non-blank lines), confirming it is not silently suppressed.
- **Probe B**: `"list product feature not tech feature"` — the response must include the CEO/duck CSV header `"状态","功能","给小鸭CEO/VC的解释"`, confirming the filtered product-only canned answer fires correctly.

## Judge harness output

`.judge/matcher/<run_id>/judge.json` contains:

```json
{
  "run_id": "<epoch>",
  "exit_code": 0,
  "probe_a_lines": 30,
  "probe_b_lines": 20,
  "probe_b_has_csv_header": true,
  "evidence_dir": ".judge/matcher/<run_id>",
  "stdout_paths": {
    "a": ".judge/matcher/<run_id>/probe-a.txt",
    "b": ".judge/matcher/<run_id>/probe-b.txt"
  }
}
```

## Verification

```text
# Dispatch via subagent or claudefast -p probe (script archived):
docs/plans/docs--features--matcher-scope--run-judge/judge.md
# Archived: docs/legacy/judge-scripts/docs/features/matcher-scope/run-judge.sh
```

PASS requires `probe_a_lines > 5` AND `probe_b_has_csv_header = true`.
LLM judge reads raw `judge.json` and returns `PASS` or `FAIL:<reason>`.

Note: `verify-canned-answer.sh` does not exist for this slug; `run-judge.sh` is the sole harness.
