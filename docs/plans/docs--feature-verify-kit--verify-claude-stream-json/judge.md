# Judge Playbook: Feature Verify Kit — claudefast stream-json Product Feature Probe

> Replaces archived script `docs/legacy/judge-scripts/docs/feature-verify-kit/verify-claude-stream-json.sh` per rule
> "third-party judge harness forbidden fixed scripts; MUST use md playbook"
> (`docs/HOWTO-PLAN-PR.md` § 3b).

## Origin
- Replaced script: `docs/legacy/judge-scripts/docs/feature-verify-kit/verify-claude-stream-json.sh`
- Original purpose: Invoke `claudefast -p` with `--output-format stream-json` and a JSON schema to extract the 7-key canonical product-feature object from `docs/系统展示.md § Canonical Feature TL;DR`, capturing hook-debug evidence alongside the stream.
- Status: **ACTIVE (partially)** — The product-features canned answer was removed from `CLAUDE.md` at commit `d341da8`, but `docs/系统展示.md` and `docs/PRODUCT-FEATURES.md` still exist per user instruction "do not touch D1/D2/D3". The 7-key extraction from `docs/系统展示.md` remains testable; the test cannot validate a CLAUDE.md inline canned answer (that anchor is gone). Mark results accordingly.

## §V1 RUN
Commands MAIN agent dispatches; capture stdout/stderr to `evidence_dir = .judge/<run_id>/`:

- Step 1: Confirm `claudefast` binary and capture help output; assert `--debug` and `--debug-file` flags are listed.
  ```
  claudefast --help > .judge/<run_id>/claudefast.help.txt 2>&1
  grep -- '--debug' .judge/<run_id>/claudefast.help.txt
  grep -- '--debug-file' .judge/<run_id>/claudefast.help.txt
  ```
- Step 2: Run `claudefast -p` with stream-json output, hook debug logging, and a JSON schema enforcing the 7-key product feature object. The prompt instructs the model to read `docs/系统展示.md § Canonical Feature TL;DR` and return the exact verbatim sentences.
  ```
  claudefast -p \
    --output-format stream-json \
    --include-partial-messages \
    --verbose \
    --debug hooks \
    --debug-file .judge/<run_id>/claude-hooks.debug.log \
    --permission-mode acceptEdits \
    --json-schema '{"type":"object","properties":{"positioning":{"type":"string","minLength":1},"metrics":{"type":"string","minLength":1},"market_gap":{"type":"string","minLength":1},"delivered_vs_planned":{"type":"string","minLength":1},"hooks":{"type":"string","minLength":1},"knowledge_delivery":{"type":"string","minLength":1},"self_evolution":{"type":"string","minLength":1}},"required":["positioning","metrics","market_gap","delivered_vs_planned","hooks","knowledge_delivery","self_evolution"],"additionalProperties":false}' \
    'Read the section "## Canonical Feature TL;DR" in docs/系统展示.md. That section contains 7 bullet lines starting with: positioning, metrics, market_gap, delivered_vs_planned, hooks, knowledge_delivery, self_evolution. Return ONLY a JSON object whose 7 keys are exactly those names and whose values are the EXACT verbatim sentences from that section (byte-for-byte, same punctuation, same characters). Do not paraphrase.' \
    > .judge/<run_id>/claude-stream.jsonl \
    2> .judge/<run_id>/claude-stream.stderr.log
  ```
- Step 3: Parse the stream-json to extract the final validated 7-key object. Prefer `result.structured_output`, then the last `StructuredOutput` tool-use block, then `result.result` parsed as JSON. Validate all 7 keys are present as non-empty strings not starting with `{` or `[`.
  ```
  # MAIN agent dispatches claudefast -p to parse .judge/<run_id>/claude-stream.jsonl
  # and write the extracted object to .judge/<run_id>/claude-features.json
  ```
- Step 4: Verify hook debug log is non-empty and contains hook-related lines.
  ```
  test -s .judge/<run_id>/claude-hooks.debug.log
  grep -qi "hook" .judge/<run_id>/claude-hooks.debug.log
  ```

## §V2 DUMP
Canonical JSON to `.judge/<run_id>/judge.json`:
```json
{
  "exit_code": 0,
  "metrics": {
    "stream_jsonl_present": true,
    "hook_debug_log_non_empty": true,
    "hook_debug_log_contains_hook_lines": true,
    "all_7_keys_present": true,
    "all_values_non_empty_strings": true,
    "no_nested_json_values": true,
    "source": "result.structured_output",
    "canned_answer_in_claude_md": false,
    "docs_系统展示_exists": true
  },
  "evidence_dir": ".judge/<run_id>/",
  "stdout_path": ".judge/<run_id>/claude-features.json",
  "stderr_path": ".judge/<run_id>/claude-stream.stderr.log",
  "feature_status": "active"
}
```

## §V3 READ
`claudefast -p` prompt:
> Read `.judge/<run_id>/judge.json` and evidence in `evidence_dir`.
> Emit `PASS` / `FAIL` / `SKIP`.
> PASS criteria: `exit_code` is 0; `metrics.all_7_keys_present` is `true`; `metrics.all_values_non_empty_strings` is `true`; `metrics.no_nested_json_values` is `true`; `metrics.hook_debug_log_non_empty` is `true`. Note: `metrics.canned_answer_in_claude_md` being `false` is expected and does not cause FAIL — the test validates extraction from `docs/系统展示.md`, not a CLAUDE.md inline answer.
> FAIL criteria: `exit_code` non-zero; any of the 7 keys missing or non-string; any value is a nested JSON-looking string; hook debug log is empty or missing.
> SKIP if `docs/系统展示.md` does not exist or `claudefast` is not on PATH.

## Notes
- Original logic summary: The script sourced a helper to assemble stream-json flags (with hook-debug evidence mode), ran `claudefast -p --model haiku` with the flags plus a JSON schema, captured both the JSONL stream and hook debug log, then ran a Node.js validator that searched the stream for the last `StructuredOutput` tool-use block or `result.structured_output` (falling back to parsing `result.result` as JSON). The validator checked all 7 keys exist, are plain strings, and are not nested JSON. The product-features canned answer was previously inlined in CLAUDE.md to also prime the model; since that block was removed at `d341da8`, the test now relies solely on the model reading `docs/系统展示.md` via the `Read` tool.
- Known dependencies / limitations:
  - `docs/系统展示.md` must exist with a `## Canonical Feature TL;DR` section containing exactly the 7 keys. Per user instruction this file must not be deleted.
  - `fixtures/expected-product-features.json` is used by the hardmatch playbook (see `hardmatch-features`); this playbook only produces `claude-features.json` as input to that fixture comparison.
  - The original script used `--model haiku` for cost savings; MAIN agent may substitute another fast model.
  - Hook evidence (`--debug hooks --debug-file`) is a hard gate; the playbook cannot PASS if `claudefast` does not support these flags.
  - `docs/feature-verify-kit/claudefast-stream-json-flags.sh` helper is archived; its logic is inlined above.
