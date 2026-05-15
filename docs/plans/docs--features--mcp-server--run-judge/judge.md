# Judge Playbook: MCP Server (JSON-RPC stdio Handshake)

> Replaces archived script `docs/features/mcp-server/run-judge.sh` per rule
> "third-party judge harness forbidden fixed scripts; MUST use md playbook"
> (`docs/HOWTO-PLAN-PR.md` § 3b).

## Origin
- Replaced script: `docs/legacy/judge-scripts/docs/features/mcp-server/run-judge.sh`
- Original purpose: Send three JSON-RPC 2.0 messages over stdio to the MCP server (`initialize` / `tools/list` / `tools/call`) and verify protocol handshake, tool list, and `check_pitfall` invocation.
- Status: **ACTIVE**

## §V1 RUN
Concrete commands the MAIN agent dispatches (extracted from source .sh):

- Step 1: Write a JSONL file with 3 JSON-RPC requests to `.judge/mcp/<run_id>/requests.jsonl`:
  ```
  {"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2024-11-05","capabilities":{},"clientInfo":{"name":"test","version":"0"}}}
  {"jsonrpc":"2.0","id":2,"method":"tools/list","params":{}}
  {"jsonrpc":"2.0","id":3,"method":"tools/call","params":{"name":"check_pitfall","arguments":{"query":"test query for fixture rule"}}}
  ```

- Step 2: Pipe the requests to the MCP server via stdio (30s timeout), capture raw responses:
  ```
  timeout 30s bash -c "npx tsx packages/mcp-server/src/server.ts" \
    < .judge/mcp/<run_id>/requests.jsonl \
    > .judge/mcp/<run_id>/raw_responses.jsonl \
    2> .judge/mcp/<run_id>/server.stderr.txt
  ```
  Alternative server command (once CLI wires subcommand):
  ```
  timeout 30s bash -c "npx tsx packages/cli/src/bin.ts mcp-server" < requests.jsonl ...
  ```

- Step 3: Parse `raw_responses.jsonl` and extract per-id responses; write structured parse result:
  ```
  node --no-warnings -e "
    const lines = require('fs').readFileSync('.judge/mcp/<run_id>/raw_responses.jsonl','utf-8')
      .trim().split('\n').filter(l => l.trim().startsWith('{'));
    // ... match by id, check init_ok / tools_list_has_check_pitfall / tools_call_returned_content
  " > .judge/mcp/<run_id>/parse_result.json
  ```

- Step 4: Write `judge.json` from parsed booleans; call `claudefast -p` with the JSON for LLM verdict:
  ```
  printf '%s' "<judge_prompt_with_json>" | claudefast -p - \
    > .judge/mcp/<run_id>/verdict.txt 2>.judge/mcp/<run_id>/verdict.stderr.txt
  ```

Capture all stdout/stderr to `evidence_dir = .judge/mcp/<run_id>/`.

## §V2 DUMP
JSON written to `.judge/mcp/<run_id>/judge.json`:

```json
{
  "run_id": "<ISO timestamp>-<pid>",
  "exit_code": 0,
  "init_ok": true,
  "tools_list_has_check_pitfall": true,
  "tools_call_returned_content": true,
  "evidence_dir": ".judge/mcp/<run_id>",
  "raw_responses_path": ".judge/mcp/<run_id>/raw_responses.jsonl",
  "stdout_path": ".judge/mcp/<run_id>/stdout.log",
  "server_stderr_path": ".judge/mcp/<run_id>/server.stderr.txt",
  "metrics": {
    "init_ok": true,
    "tools_list_has_check_pitfall": true,
    "tools_call_returned_content": true,
    "all_checks_pass": true
  },
  "feature_status": "active"
}
```

Metric keys derived from source:
- `init_ok`: `true` when response id=1 has `result.protocolVersion` (string) AND `result.serverInfo` (object) — verifies MCP protocol handshake
- `tools_list_has_check_pitfall`: `true` when response id=2 has `result.tools` as an array containing at least one entry with `name="check_pitfall"` — verifies the pitfall tool is registered
- `tools_call_returned_content`: `true` when response id=3 has `result.content` as a non-empty array where at least one item has `type="text"` or a `text` string field — verifies the tool executes and returns output
- `exit_code`: the server process exit code (from `timeout` invocation; non-zero if server crashes or times out)

## §V3 READ
`claudefast -p` prompt:

> Read `.judge/mcp/<run_id>/judge.json` and `parse_result.json` in `evidence_dir`. Also check `server.stderr.txt` for crash indicators. Emit PASS / FAIL / SKIP.
>
> PASS criteria: All three boolean checks are `true` — `init_ok=true` (protocol handshake succeeded with protocolVersion + serverInfo), `tools_list_has_check_pitfall=true` (check_pitfall appears in tools/list response), `tools_call_returned_content=true` (tools/call returned non-empty text content).
>
> FAIL criteria: Any of the three booleans is `false`; name which check failed and include the relevant raw response from `parse_result.json`. Also FAIL if `server.stderr.txt` contains unhandled exception or crash output and `raw_responses.jsonl` is empty.
>
> SKIP if `packages/mcp-server/src/server.ts` is not present, or `npx tsx` is unavailable, or the MCP server binary cannot be resolved.

## Notes
- Original logic summary: The harness tests the MCP server's JSON-RPC 2.0 stdio interface end-to-end without any mocking. It sends exactly three messages in sequence through a single stdin pipe and parses responses by matching JSON object `id` fields. The three checks form a protocol chain: `initialize` verifies the server speaks MCP correctly and identifies itself; `tools/list` verifies `check_pitfall` is exposed as a registered tool; `tools/call check_pitfall` verifies the tool actually executes and returns non-empty content for a test query. The harness also optionally calls `claudefast -p` as a final LLM verdict step, reading the `judge.json` output and emitting `PASS` or `FAIL:<reason>` — this is the one place in the harness where an LLM reads raw JSON to summarize, not to make the pass/fail determination (the mechanical boolean checks do that).
- Dependencies: `pnpm install`, `npx tsx`, `packages/mcp-server/src/server.ts`, Node.js `--no-warnings`, `claudefast` in PATH (for optional LLM verdict step only)
- Limitations: The server command defaults to `npx tsx packages/mcp-server/src/server.ts`; the CLI-wired `mcp-server` subcommand is an alternative documented in the script but marked as future. The 30-second `timeout` may be insufficient for cold-start builds; if the server takes longer to initialize, increase to 60s. The `check_pitfall` tool call uses a hardcoded test query — if no fixture rules are seeded in the knowledge DB, `tools_call_returned_content` may be `false` even if the tool runs correctly.
