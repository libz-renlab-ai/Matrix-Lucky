# Judge Playbook: Multi-Tool Adaptation — Canned Answer Verification

> Replaces archived script `docs/legacy/judge-scripts/docs/features/multi-tool/verify-canned-answer.sh` per rule
> "third-party judge harness forbidden fixed scripts; MUST use md playbook"
> (`docs/HOWTO-PLAN-PR.md` § 3b).

## Origin
- Replaced script: `docs/legacy/judge-scripts/docs/features/multi-tool/verify-canned-answer.sh`
- Original purpose: Feed the content of `docs/features/multi-tool.md` to claudefast and verify that its response correctly identifies all four implemented channels (PreToolUse, UserPromptSubmit, Stop analyze, AttributionBus) and two NOT-YET channels (MCP Server, Cursor), plus at least one `packages/` file path.
- Status: **ACTIVE-PARTIAL**

## §V1 RUN
Commands MAIN agent dispatches; capture to `evidence_dir = .judge/<run_id>/`:
- Step 1: Read `docs/features/multi-tool.md` (first 180 lines) to obtain the doc content.
- Step 2: Dispatch `claudefast -p` with a prompt embedding the doc content:

  ```
  Using the docs/features/multi-tool.md content below, answer with these exact labels:
  PreToolUse, UserPromptSubmit, Stop analyze, AttributionBus, MCP Server status,
  Cursor status, and at least one packages/ file path.

  <content of docs/features/multi-tool.md lines 1-180>
  ```

  Capture stdout to `evidence_dir/probe-multitool.txt`. Allow up to 3 retry attempts if output lacks any of `PreToolUse|UserPromptSubmit|AttributionBus|packages/`.
- Step 3: Run all 7 anchor checks (see §V3 PASS criteria) against `evidence_dir/probe-multitool.txt` and record boolean results.

## §V2 DUMP
JSON to `.judge/<run_id>/judge.json`:
```json
{ "exit_code": 0,
  "metrics": {
    "pretooluse": true,
    "userpromptsubmit": true,
    "stop_analyze": true,
    "attribution_bus": true,
    "mcp_not_yet": true,
    "cursor_not_yet": true,
    "packages_path": true
  },
  "evidence_dir": ".judge/<run_id>",
  "stdout_path": ".judge/<run_id>/probe-multitool.txt",
  "feature_status": "active-partial" }
```

## §V3 READ
`claudefast -p` prompt:
> Read judge.json + evidence_dir/probe-multitool.txt. Emit PASS / FAIL / SKIP.
> PASS criteria: all 7 anchors must be true —
>   (1) "PreToolUse" appears;
>   (2) "UserPromptSubmit" appears;
>   (3) "Stop" followed by "analyze" / "hook" / "钩子" appears;
>   (4) "Attribution" followed by "Bus" (case-insensitive, optional hyphen/space) appears;
>   (5) "MCP" appears within 4 lines of "NOT YET" / "未实现" / "not implemented" / "尚未" / "Phase 2";
>   (6) "Cursor" appears within 4 lines of "NOT YET" / "未实现" / "importer only" / "no compiler" / "compiler missing" / "尚未" / "不支持";
>   (7) at least one path matching `packages/(cli|adapters|ports|core)/` appears.
> FAIL criteria: any of the 7 anchors is absent.
> SKIP if feature deleted at d341da8: not applicable — `docs/features/multi-tool.md` still exists; do not emit SKIP.

## Notes
- Original logic summary: The script read lines 1–180 of `docs/features/multi-tool.md`, embedded the content into a structured prompt asking for all channel labels and file paths, then called `claudefast -p` (with up to 3 retries if core anchors were absent from output). Seven anchors were verified: four implemented channels (plain string grep), MCP and Cursor both required proximity-within-4-lines checks using `awk` (not just substring presence), and one `packages/(cli|adapters|ports|core)/` path. All 7 had to pass for exit 0.
- Dependencies / limitations:
  - `docs/features/multi-tool.md` must exist and be readable; it does exist in the working tree
  - The canned-answer wrapper script is gone but the underlying doc (`docs/features/multi-tool.md`) remains — hence ACTIVE-PARTIAL: the feature description is maintained but the automated verification wrapper was archived
  - MCP Server and Cursor compiler are documented as NOT YET; an LLM response that omits the NOT YET qualifier on either channel would fail anchors 5 or 6
  - Proximity window of 4 lines for MCP/Cursor anchors is a heuristic from the original `awk` check; the LLM judge should apply equivalent "within a few lines" reasoning when scanning `probe-multitool.txt`
  - If `docs/features/multi-tool.md` is ever deleted, upgrade status to DEPRECATED and emit SKIP
