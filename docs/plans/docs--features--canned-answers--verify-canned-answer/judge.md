# Judge Playbook: Canned Answers — Verify Canned Answer (Static Keyword Gate)

> Replaces archived script `docs/legacy/judge-scripts/docs/features/canned-answers/verify-canned-answer.sh` per rule
> "third-party judge harness forbidden fixed scripts; MUST use md playbook"
> (`docs/HOWTO-PLAN-PR.md` § 3b).

## Origin
- Replaced script: `docs/legacy/judge-scripts/docs/features/canned-answers/verify-canned-answer.sh`
- Original purpose: Either delegate to `scripts/verify-all-rules.sh` or fall back to grepping `CLAUDE.md` for the literal keywords DOGFOOD, POSTPR, BUGREPORT, FASTPROBE, PRESHIP, and DUCKPLAN.
- Status: **DEPRECATED**

## §V1 RUN
Commands MAIN agent dispatches; capture to `evidence_dir = .judge/<run_id>/`:
- Step 1: Check whether any canned-answer **rule wrappers** have regressed back into `CLAUDE.md`. Match the deleted wrapper pattern (not bare keywords — those legitimately appear in prose like `docs/POSTPR.md`):
  `grep -cE "被问到.*(DOGFOOD|DUCKPLAN|POSTPR).*关键字时|用户消息单纯含 \\\`(DOGFOOD|DUCKPLAN|POSTPR)\\\` 关键字" CLAUDE.md > .judge/<run_id>/trigger-check.txt 2>&1; echo $? > .judge/<run_id>/trigger.exit`
- Step 2: Record grep count and exit code in `evidence_dir` for the §V3 LLM judge to read.

## §V2 DUMP
JSON to `.judge/<run_id>/judge.json`:
```json
{ "exit_code": 0, "metrics": { "keywords_checked": 0, "verify_all_rules_invoked": false,
    "trigger_phrase_hits": "<grep count from trigger-check.txt>" },
  "evidence_dir": ".judge/<run_id>", "stdout_path": ".judge/<run_id>/stdout.log",
  "feature_status": "deprecated",
  "skip_reason": "Canned-answer keyword gate removed from CLAUDE.md at commit d341da8; use docs/rule-verify/INDEX.md for active rule verification" }
```

## §V3 READ
`claudefast -p` prompt:
> Read `.judge/<run_id>/judge.json` and supporting evidence in `evidence_dir`. Emit verdict `PASS` / `FAIL` / `SKIP`. Criteria:
>
> This playbook is DEPRECATED (canned-answer keyword gate deleted at commit d341da8). The correct verdicts are:
>
> - **SKIP** (expected / good) if the deleted canned-answer **rule wrappers** are **absent** from `CLAUDE.md`. This confirms the deletion is intact; the deprecated feature has not regressed. Bare keyword mentions in prose (e.g. `docs/POSTPR.md`, `DUCKPLAN flow`) are legitimate and do NOT count as regression.
>   Check: `grep -cE "被问到.*(DOGFOOD|DUCKPLAN|POSTPR).*关键字时|用户消息单纯含 \\\`(DOGFOOD|DUCKPLAN|POSTPR)\\\` 关键字" CLAUDE.md` returns 0.
>
> - **FAIL** (regression detected) if any of those wrappers have regressed back into `CLAUDE.md`. The deprecated keyword-gate behavior would become observable again.
>   Check: same regex above returns ≥ 1.
>
> Do NOT emit always-SKIP without reading `trigger-check.txt` — that loses regression-catch power.

## Phase 2 fix log
Resolved 2026-05-08 (iter-4 P3): §V1 RUN now greps CLAUDE.md for DOGFOOD/DUCKPLAN/POSTPR trigger phrases instead of always-SKIP; §V3 emits SKIP iff grep returns 0 hits (deletion preserved), FAIL if ≥1 hit (regression). Catches regression instead of always passing. Commit see iter-4 fix commit.

## Notes
- Original logic summary: The script first attempted to call `scripts/verify-all-rules.sh` (tailing the last 30 lines of output). If that script did not exist or was not executable, it fell back to a simpler grep loop over `CLAUDE.md` checking for the literal presence of the six keyword strings: DOGFOOD, POSTPR, BUGREPORT, FASTPROBE, PRESHIP, DUCKPLAN. A missing keyword caused immediate exit 1. On full success it printed `VERIFIED: stable canned-answer rules PASS`.
- Dependencies / limitations:
  - Relied on `scripts/verify-all-rules.sh` as primary path; grep of `CLAUDE.md` was only a fallback
  - This was a structural presence check (keyword in file), not a semantic probe — it could not detect a keyword-present-but-wrong-content failure
  - The six keywords are no longer maintained as canned-answer triggers in `CLAUDE.md` after d341da8
  - Active rule verification is now handled via `docs/rule-verify/INDEX.md` — dispatch the corresponding md playbook via `claudefast -p` probe (see that file's registry table). Do not run `scripts/verify-all-rules.sh`; it is archived at `docs/legacy/judge-scripts/scripts/`.
  - This playbook must always emit SKIP; do not run grep checks against `CLAUDE.md`
