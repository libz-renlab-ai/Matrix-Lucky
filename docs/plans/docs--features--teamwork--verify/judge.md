# Judge Playbook: TEAMWORK Canned Answer

> Replaces archived script `docs/legacy/judge-scripts/docs/features/teamwork/verify.sh` per rule
> "third-party judge harness forbidden fixed scripts; MUST use md playbook"
> (`docs/HOWTO-PLAN-PR.md` § 3b).

## Origin
- Replaced script: `docs/legacy/judge-scripts/docs/features/teamwork/verify.sh`
- Original purpose: Probe claudefast with `what would happen when we say TEAMWORK ?` and assert five semantic elements (N+1+(2N) formula, sonnet workers, claudefast probes, opus 1M reporter, never work in main) appear in the response.
- Status: **DEPRECATED**

## §V1 RUN
Commands MAIN agent dispatches; capture to `evidence_dir = .judge/<run_id>/`:
- Step 1: Check whether the TEAMWORK canned-answer trigger phrase has regressed back into `CLAUDE.md`:
  `grep -c 'what would happen when we say TEAMWORK' CLAUDE.md > .judge/<run_id>/trigger-check.txt 2>&1; echo $? > .judge/<run_id>/trigger.exit`
- Step 2: Record grep count and exit code in `evidence_dir` for the §V3 LLM judge to read.

## §V2 DUMP
JSON to `.judge/<run_id>/judge.json`:
```json
{ "exit_code": 0, "metrics": { "probes_run": 0, "checks_attempted": 0,
    "trigger_phrase_hits": "<grep count from trigger-check.txt>" },
  "evidence_dir": ".judge/<run_id>",
  "stdout_path": ".judge/<run_id>/stdout.log", "feature_status": "deprecated",
  "skip_reason": "TEAMWORK canned answer removed from CLAUDE.md at commit d341da8" }
```

## §V3 READ
`claudefast -p` prompt:
> Read `.judge/<run_id>/judge.json` and supporting evidence in `evidence_dir`. Emit verdict `PASS` / `FAIL` / `SKIP`. Criteria:
>
> This playbook is DEPRECATED (TEAMWORK canned answer deleted at commit d341da8). The correct verdicts are:
>
> - **SKIP** (expected / good) if the TEAMWORK canned-answer trigger phrase `what would happen when we say TEAMWORK` is **absent** from `CLAUDE.md`. This confirms the deletion is intact; the deprecated feature has not regressed.
>   Check: `grep -c 'what would happen when we say TEAMWORK' CLAUDE.md` returns 0.
>
> - **FAIL** (regression detected) if that trigger phrase has regressed back into `CLAUDE.md` (e.g. a future change re-introduced the TEAMWORK canned-answer block). The deprecated behavior would become observable again.
>   Check: `grep -c 'what would happen when we say TEAMWORK' CLAUDE.md` returns ≥ 1.
>
> Do NOT emit always-SKIP without reading `trigger-check.txt` — that loses regression-catch power.

## Phase 2 fix log
Resolved 2026-05-08 (iter-4 P3): §V1 RUN now greps CLAUDE.md for `what would happen when we say TEAMWORK` trigger phrase instead of always-SKIP; §V3 emits SKIP iff grep returns 0 hits (deletion preserved), FAIL if ≥1 hit (regression). Catches regression instead of always passing. Commit see iter-4 fix commit.

## Notes
- Original logic summary: The script called `claudefast -p "what would happen when we say TEAMWORK ? ONLY explain please"` and grepped the output for five anchors: the N+1+(2N) formula, "sonnet" workers, "claudefast" probes, "opus" 1M reporter, and "main" branch restriction. Each check used case-insensitive grep with fallback patterns (e.g. "N + 1 + (2N)" / "3N+1"). Results were tallied and exit 0 on zero failures.
- Dependencies / limitations:
  - Required `claudefast` on PATH
  - The TEAMWORK canned answer trigger (`what would happen when we say TEAMWORK`) no longer exists in `CLAUDE.md` after d341da8
  - Five semantic anchors were non-exhaustive; the actual TEAMWORK rule (N sonnet workers + opus 1M reporter + non-main branch constraint) had more nuance than grep could verify
  - This playbook must always emit SKIP; do not attempt to run probes
