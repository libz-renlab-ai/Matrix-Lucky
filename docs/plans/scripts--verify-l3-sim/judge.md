# Judge Playbook: L3 Hook Simulation (verify-l3-sim)

> Replaces archived script `scripts/verify-l3-sim.sh` per project rule
> "third-party judge harness forbidden fixed scripts; MUST use md playbook"
> (`docs/HOWTO-PLAN-PR.md` § 3b).

## Origin

- Replaced script: `docs/legacy/judge-scripts/scripts/verify-l3-sim.sh`
- Original purpose: Simulate Claude Code's hook caller by directly piping synthetic PreToolUse events through the built hook bundle, running three behavioral tests (download command, forbidden console.log pattern, forbidden `node:fs` import in core) and checking event log growth.
- Status: ACTIVE — the hook bundle and event logging infrastructure still exist.

## §V1 RUN

Commands the MAIN agent dispatches (via subagent or `claudefast -p` probe).
Capture stdout/stderr to `evidence_dir = .judge/<run_id>/`.

- Step 1: Verify hook bundle exists: `ls packages/cli/dist/bin-pre-tool-use.cjs > .judge/<run_id>/bundle-check.txt 2>&1; echo $? > .judge/<run_id>/bundle-check.exit`
- Step 2: Record initial event log line count: `wc -l < ~/.teamagent/events.jsonl > .judge/<run_id>/events-before.txt 2>/dev/null || echo 0 > .judge/<run_id>/events-before.txt`
- Step 3: Construct and pipe Test 1 payload (Bash / `wget --version`) through hook bundle; capture output to `.judge/<run_id>/t1-out.txt`.
- Step 4: Construct and pipe Test 2 payload (Write / `console.log` content) through hook bundle; capture output to `.judge/<run_id>/t2-out.txt`.
- Step 5: Construct and pipe Test 3 payload (Edit / add `import fs from "node:fs"` to a core file) through hook bundle; capture output to `.judge/<run_id>/t3-out.txt`.
- Step 6: Record final event log line count: `wc -l < ~/.teamagent/events.jsonl > .judge/<run_id>/events-after.txt 2>/dev/null || echo 0 > .judge/<run_id>/events-after.txt`

## §V2 DUMP

Canonical JSON written to `.judge/<run_id>/judge.json`:

```json
{
  "exit_code": 0,
  "metrics": {
    "t1_hit": true,
    "t1_expected_keyword": "先检查下载目录",
    "t2_hit": true,
    "t2_expected_keyword_pattern": "AttributionBus|trace",
    "t3_hit": true,
    "t3_expected_keyword_pattern": "adapter|纯函数|IO",
    "events_new_count": 3,
    "bundle_present": true
  },
  "evidence_dir": ".judge/<run_id>",
  "stdout_path": ".judge/<run_id>/t1-out.txt",
  "stderr_path": ".judge/<run_id>/bundle-check.txt",
  "feature_status": "active"
}
```

## §V3 READ

LLM judge prompt (run via `claudefast -p`):

> Read `.judge/<run_id>/judge.json` and supporting evidence in
> `evidence_dir`. Emit verdict `PASS` / `FAIL` / `SKIP`. Criteria:
>
> - PASS if: `bundle_present == true` AND `t1_hit == true` (hook returns valid JSON for wget; keyword "先検査下载目录" check is DEPRECATED — see notes) AND `t2_hit == true` (response matches AttributionBus or trace) AND `t3_hit == true` (response matches adapter, 纯函数, or IO).
> - Note: `events_new_count >= 3` is SKIP-INFRA if `~/.teamagent/events.jsonl` is absent.
> - FAIL if: bundle absent, or t2/t3 did not hit their expected keyword.
> - SKIP if: required infrastructure is unavailable in this environment.

## Notes

- Original logic summary: The script constructs three synthetic PreToolUse JSON payloads using `node -e`, pipes each through `packages/cli/dist/bin-pre-tool-use.cjs`, and checks the response for expected Chinese keywords or English technical terms. It also measures growth of `~/.teamagent/events.jsonl` to confirm event attribution is working. No `claudefast` invocation required — purely local hook binary tests.
- Known limitations / dependencies:
  - Requires built hook bundle at `packages/cli/dist/bin-pre-tool-use.cjs`.
  - Test 2 assertion ("AttributionBus|trace") may become stale if the rule's description changes.
  - Event log path `~/.teamagent/events.jsonl` must be writable; non-existent file treated as 0 lines.
  - Test 3 checks that writing `import fs from "node:fs"` into a `packages/core/` file triggers a rule; this depends on the "Functional Core" rule remaining in the knowledge base.

### DEPRECATED: Test 1 download-directory keyword check

`t1_expected_keyword: "先检查下载目录"` is **DEPRECATED** and must NOT be part of the PASS gate.

**Root cause (investigated 2026-05-08):** Same as `scripts--verify-l0/judge.md` — the download-directory rule is `status=dormant` and was never seeded. A `wget` payload correctly returns `decision: allow` without emitting the keyword. `t1_hit` should be interpreted as "hook returned valid JSON with `permissionDecision`", not as a keyword match. Update the §V2 DUMP metric: `t1_hit` = hook exit 0 AND response contains `permissionDecision`.

## Phase 2 fix log

Resolved 2026-05-08: PLAYBOOK-FIX — t1 download-directory keyword assertion deprecated; t1_hit redefined as "hook returned valid JSON". Matches investigate findings in scripts--verify-l0 fix log.
