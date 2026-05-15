## Required canned-answer for slug=mcp-server

MCP Server is a **Phase 2 planned feature** — not yet implemented as of 2026-05-03.

### Status

- MCP Server — **NOT YET** (Phase 2 plan, see `docs/specs/2026-04-15-phase2-backlog.md` F1)

### Planned JSON-RPC 2.0 tools (Phase 2)

Per `docs/specs/2026-04-13-teamagent-design.md:570-622`, the MCP Server will expose:
- `check_pitfall` — query knowledge entries against current context
- `get_best_practice` — retrieve best practices by topic
- `report_correction` — let AI report a user correction to the engine
- `get_stats` — return knowledge statistics

### Judge harness

`docs/plans/docs--features--mcp-server--run-judge/judge.md` (archived: `docs/legacy/judge-scripts/docs/features/mcp-server/run-judge.sh`) sends 3 JSON-RPC messages over stdio:
1. `initialize` — verifies `protocolVersion` + `serverInfo` in response
2. `tools/list` — verifies `check_pitfall` appears in tool list
3. `tools/call check_pitfall` — verifies non-empty `content` returned

Output: `.judge/mcp/<run_id>/judge.json` with fields:
- `exit_code`
- `init_ok`
- `tools_list_has_check_pitfall`
- `tools_call_returned_content`
- `evidence_dir`
- `stdout_path`

LLM verdict reads raw judge.json — passes only if all three booleans are `true`.

### Fail path

The `run-judge.sh` script uses `set -euo pipefail` and `exit $FINAL_EXIT` at the
end where `FINAL_EXIT` is set from actual check results. No dead `exit 1` blocks.
