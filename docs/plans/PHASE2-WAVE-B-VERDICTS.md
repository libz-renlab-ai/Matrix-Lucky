# Phase 2 Wave B — ACTIVE-PARTIAL Verdict Scoreboard

> 5 playbooks where the underlying feature still exists but at least one
> §V sub-check depends on a deleted canned answer.

## Per-playbook verdicts

### 1. calibrator-v2 verify-canned-answer

- **Overall verdict**: MIXED
- Sub-steps:
  - Step 0 (claudefast available as zsh alias): PASS
  - Step 1 (probe-feature.sh exists): PASS
  - Step 2 (run probe-feature.sh calibrator-v2): SKIP-TIMEOUT — default timeout 180s exceeds 2-min constraint
  - Step 3 (artifact dir created): SKIP-TIMEOUT — depends on Step 2
  - Step 4 (stream.jsonl non-empty): SKIP-TIMEOUT — depends on Step 2
  - Step 5 (calibration-pipeline-v2.ts anchor in output): SKIP-TIMEOUT — depends on Step 2
- Notes: Source file `packages/core/src/pipeline/calibration-pipeline-v2.ts` confirmed present. Utility infrastructure (probe-feature.sh, claudefast alias) intact. Blocked only by probe execution timeout. This playbook has no deleted canned answer — its ACTIVE-PARTIAL status is purely about probe runtime cost.

Evidence: `.judge/wave-b/calibrator-v2/judge.json`

---

### 2. matcher-scope run-judge

- **Overall verdict**: SKIP
- Sub-steps:
  - Step 1 (run_id + evidence_dir setup): PASS (mechanical, no dependency)
  - Step 2 (Probe A — "list all product features"): SKIP-DELETED — canned answer removed at d341da8 (`docs(canned-answer-purge): strip CLAUDE.md`); CLAUDE.md managed block no longer dispatches the 58-feature product list
  - Step 3 (Probe B — CEO/duck CSV with `"状态","功能","给小鸭CEO/VC的解释"` header): SKIP-DELETED — same commit deleted the product-features dispatch; CSV canned answer gone
  - Step 4 (LLM judge verdict): SKIP-DELETED — no probe outputs to judge
- Notes: Both probes depended exclusively on canned answers deleted at d341da8. `docs/PRODUCT-FEATURES.md` exists but claudefast would not dispatch it without the CLAUDE.md trigger. Per §V3 SKIP clause: "SKIP if canned answers deleted". No underlying code issue.

Evidence: `.judge/wave-b/matcher-scope/judge.json`

---

### 3. multi-tool verify-canned-answer

- **Overall verdict**: MIXED
- Sub-steps:
  - Step 1 (docs/features/multi-tool.md exists, 7210 bytes): PASS
  - Step 2 (claudefast -p probe with embedded doc content): SKIP-INFRA — API endpoint `api.minimaxi.com/anthropic` timed out at 90s in current environment; not a code or doc issue
  - Step 3 (7 anchor checks on probe-multitool.txt): SKIP-INFRA — depends on Step 2
- Notes: All 7 anchors mechanically verified **present in source doc** `docs/features/multi-tool.md`: PreToolUse, UserPromptSubmit, Stop analyze, AttributionBus, MCP+NOT_YET (proximity), Cursor+NOT_YET (proximity), packages/ path. The doc is healthy. Failure is purely infrastructure (API unreachable). §V3 states "do not emit SKIP" for this playbook since the doc exists — verdicted MIXED as the source is strong but the probe could not execute.

Evidence: `.judge/wave-b/multi-tool/judge.json`

---

### 4. judge-issue104-statusline

- **Overall verdict**: PASS (V1–V4) / SKIP (V5)
- Sub-steps:
  - V1 (user-level statusLine preserved after installHook): PASS — `USER_OWN_STATUSLINE_TOKEN` preserved in user settings.json
  - V2 (project-level chain command registered with user command + teamagent): PASS — chain cmd: `bash -c 'echo USER_OWN_STATUSLINE_TOKEN; echo; node <statusline-bundle.cjs>'`, `statusLineMergedScope=user`
  - V3 (no prior statusLine → teamagent registers cleanly): PASS — project statusLine registered, `statusLineMergedScope=null`
  - V4 (uninstall restores user original, clears project): PASS — user restored to `echo USER_OWN_STATUSLINE_TOKEN`; project cleared
  - V5 (anchor regression — FASTPROBE/POSTPR/TEAMWORK in CLAUDE.md): SKIP-DELETED — canned-answer block removed at d341da8
- Notes: tsx found at `/Users/m1/projects/TeamBrain/node_modules/.bin/tsx` (main repo, shared via git common dir). Driver ran successfully using worktree's `packages/cli/src/commands/install-hook.ts`. Initial driver had a path bug (read `settings.json` instead of `settings.local.json` for project); corrected driver confirmed all four invariants pass. V5 is explicitly downgradeable per playbook spec.

Evidence: `.judge/wave-b/issue104-statusline/judge.json`

---

### 5. tbrain-verify

- **Overall verdict**: PASS
- Sub-steps:
  - Pre-flight (recipe_id / run_id format validation): PASS — `VERIFY-TBRAIN-001` / `20260508T000000Z-wave-b` both valid
  - Step 1 — Anchor sweep (4 files, regex `must stay stable|TASK_TITLE|archive_dir|Output JSON with recipe_id|metrics|missing_evidence|Never append`): PASS — 4/4 files with hits, 27 total hits
    - `TASK_TEMPLATE.md`: 3 hits
    - `VERIFY_TEMPLATE.md`: 14 hits
    - `agent_rules/claude.md`: 3 hits
    - `evidence/README.md`: 7 hits
  - Step 2 — Canonical path sweep (6 files): PASS — 6/6 present and non-empty (README.md, STRUCTURE.md, TRAPS.md, TRAP_FORMAT.md, TASK_TEMPLATE.md, VERIFY_TEMPLATE.md)
  - Step 3 — Archive gate: PASS — `docs/teambrain/evidence/` exists; archive dir creatable
  - Step 4 — evidence summary: PASS — judge.json written
- Notes: `docs/teambrain/` subtree fully intact. No deleted canned answer dependency for this playbook. ACTIVE-PARTIAL label reflects possible fragility if template wording changes, not a current failure.

Evidence: `.judge/wave-b/tbrain-verify/judge.json`

---

## Summary

| Playbook | Verdict | PASS sub-steps | SKIP sub-steps | FAIL sub-steps |
|---|---|---|---|---|
| 1. calibrator-v2 | MIXED | 2 (Step 0, Step 1) | 4 (SKIP-TIMEOUT) | 0 |
| 2. matcher-scope | SKIP | 1 (setup) | 3 (SKIP-DELETED) | 0 |
| 3. multi-tool | MIXED | 1 (Step 1) | 2 (SKIP-INFRA) | 0 |
| 4. issue104-statusline | PASS (with V5 SKIP) | 4 (V1–V4) | 1 (V5 SKIP-DELETED) | 0 |
| 5. tbrain-verify | PASS | 4 (all steps) | 0 | 0 |

- **PASS**: 2 / 5 (playbooks 4 and 5)
- **MIXED** (some sub-steps PASS, some SKIP): 2 / 5 (playbooks 1 and 3)
- **SKIP**: 1 / 5 (playbook 2)
- **FAIL**: 0 / 5

## Notes

**Infrastructure gaps encountered:**

1. **API endpoint timeout**: `api.minimaxi.com/anthropic` (claudefast/MiniMax backend) timed out at 45–90s in this execution environment. This affected playbook 3 (multi-tool, needs 1 claudefast call) and would have affected playbook 1 (calibrator-v2, needs probe-feature.sh which fires claudefast). Playbook 1 was pre-empted by the 2-min timeout constraint before attempting the API call.

2. **worktree node_modules not installed**: `pnpm install` was not run in this worktree; `node_modules/.bin/tsx` was absent. Resolved by using the main repo tsx at `/Users/m1/projects/TeamBrain/node_modules/.bin/tsx`, which successfully imported the worktree's TypeScript source.

3. **Canned answer deletion scope**: d341da8 deleted all 14 canned-answer rules from CLAUDE.md. This directly affects playbooks 2 (both probes) and 4 (V5 only). The deletion was intentional per commit message; these SKIP-DELETED verdicts are expected and correct.

4. **No fabricated PASS**: playbooks where evidence could not be collected are honestly marked MIXED or SKIP, not PASS. All PASS verdicts are backed by concrete command output in the evidence files.
