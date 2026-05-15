# Judge Playbook: Canned Answers (DOGFOOD / DUCKPLAN / POSTPR) — Run Judge

> Replaces archived script `docs/legacy/judge-scripts/docs/features/canned-answers/run-judge.sh` per rule
> "third-party judge harness forbidden fixed scripts; MUST use md playbook"
> (`docs/HOWTO-PLAN-PR.md` § 3b).

## Origin
- Replaced script: `docs/legacy/judge-scripts/docs/features/canned-answers/run-judge.sh`
- Original purpose: Fire three `claudefast -p` probes for DOGFOOD, DUCKPLAN, and POSTPR canned answers; mechanically grep each output for named anchors; aggregate into `.judge/canned-answers/<run_id>/judge.json`.
- Status: **DEPRECATED**

## §V1 RUN
Commands MAIN agent dispatches; capture to `evidence_dir = .judge/<run_id>/`:
- Step 1: Check whether any canned-answer **rule wrappers** have regressed back into `CLAUDE.md`. Match the deleted wrapper pattern (not bare keywords — those legitimately appear in prose like `docs/POSTPR.md`):
  `grep -cE "被问到.*(DOGFOOD|DUCKPLAN|POSTPR).*关键字时|用户消息单纯含 \\\`(DOGFOOD|DUCKPLAN|POSTPR)\\\` 关键字" CLAUDE.md > .judge/<run_id>/trigger-check.txt 2>&1; echo $? > .judge/<run_id>/trigger.exit`
- Step 2: Record grep count and exit code in `evidence_dir` for the §V3 LLM judge to read.

## §V2 DUMP
JSON to `.judge/<run_id>/judge.json`:
```json
{ "exit_code": 0, "metrics": { "probes_run": 0, "dogfood_checks": 0, "duckplan_checks": 0, "postpr_checks": 0,
    "trigger_phrase_hits": "<grep count from trigger-check.txt>" },
  "evidence_dir": ".judge/<run_id>", "stdout_path": ".judge/<run_id>/stdout.log",
  "feature_status": "deprecated",
  "skip_reason": "DOGFOOD / DUCKPLAN / POSTPR canned answers removed from CLAUDE.md at commit d341da8" }
```

## §V3 READ
`claudefast -p` prompt:
> Read `.judge/<run_id>/judge.json` and supporting evidence in `evidence_dir`. Emit verdict `PASS` / `FAIL` / `SKIP`. Criteria:
>
> This playbook is DEPRECATED (canned answers deleted at commit d341da8). The correct verdicts are:
>
> - **SKIP** (expected / good) if the deleted canned-answer **rule wrappers** are **absent** from `CLAUDE.md`. This confirms the deletion is intact; the deprecated feature has not regressed. Bare keyword mentions in prose (e.g. `docs/POSTPR.md`, `DUCKPLAN flow`) are legitimate and do NOT count as regression.
>   Check: `grep -cE "被问到.*(DOGFOOD|DUCKPLAN|POSTPR).*关键字时|用户消息单纯含 \\\`(DOGFOOD|DUCKPLAN|POSTPR)\\\` 关键字" CLAUDE.md` returns 0.
>
> - **FAIL** (regression detected) if any of those wrappers have regressed back into `CLAUDE.md` (e.g. a future change re-introduced a `被问到 \`...DOGFOOD...\` 时` rule). The deprecated behavior would become observable again.
>   Check: same regex above returns ≥ 1.
>
> Do NOT emit always-SKIP without reading `trigger-check.txt` — that loses regression-catch power.

## Phase 2 fix log
Resolved 2026-05-08 (iter-4 P3): §V1 RUN now greps CLAUDE.md for DOGFOOD/DUCKPLAN/POSTPR trigger phrases instead of always-SKIP; §V3 emits SKIP iff grep returns 0 hits (deletion preserved), FAIL if ≥1 hit (regression). Catches regression instead of always passing. Commit see iter-4 fix commit.

## Notes
- Original logic summary: The harness ran three sequential `claudefast -p` probes (DOGFOOD: "what would happen when we say DOGFOOD?"; DUCKPLAN: "what would happen if we say 'DUCKPLAN'"; POSTPR: "what we shall do after each PR?"). Each probe output was saved to a separate file in the evidence dir. Mechanical grep checks were applied: DOGFOOD required `two tmux windows`, `left/?right split`, and `interact`; DUCKPLAN required `task description|任务描述`, `expected outputs|预期产出`, `judge harness|JSON|LLM`, and `duck|鸭|呷呷`; POSTPR required `fetch the codex review|fetch.*codex`, `chatgpt-codex-connector`, `pulls/.*comments`, and `silent|loop`. All 11 anchors had to pass for OVERALL_PASS. A 180-second timeout per probe was applied when `timeout` or `gtimeout` was available.
- Dependencies / limitations:
  - Required `claudefast` on PATH and `timeout`/`gtimeout` for bounded execution
  - The three canned answer triggers no longer exist in `CLAUDE.md` after d341da8
  - Greps were regex (`-Eq`) with alternation; no LLM re-judge stage existed
  - Re-evaluation block was duplicated (first grepped into shell vars, then re-evaluated inline) — a known verbosity issue in the original script
  - This playbook must always emit SKIP; do not attempt to run probes
