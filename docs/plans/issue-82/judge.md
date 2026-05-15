```text
   judge.md — issue #82 team-scope viral sync teaching e2e harness
   (MD playbook, NOT a fixed bash script)

   main agent
       │
       ├─► sub-agent 1: glossary lint (no forbidden terms in plan body)
       ├─► sub-agent 2: M5 ship 7-item regression (xsync, pii, m5-auto-demo, vitest×3, SessionStart smoke)
       ├─► sub-agent 3: e2e teaching rig run + summary.json read
       ├─► sub-agent 4: attribution chain completeness (4 source_* fields)
       ├─► sub-agent 5: dependency check (≥1 #81 personal-use evidence)
       └─► main agent aggregate verdict.json
```

# Judge harness — issue #82

This is the **MD playbook** dispatched by the main agent (or a maintainer running it manually) to verify that the follow-up impl PR for #82 has produced an honest cross-machine team-scope viral-sync-teaching probe + complete attribution chain — without re-litigating M5's design.

## Inputs

- The current PR's diff (file list + content)
- `docs/superpowers/specs/2026-05-06-m5-team-viral-sync-design.md`
- `docs/features/team-share.md`
- `docs/features/multi-tool.md`
- `docs/plans/docs--features--xsync--run-judge/judge.md` (md playbook; xsync/run-judge.sh archived to docs/legacy/judge-scripts/), `docs/plans/docs--features--pii-redaction--run-judge/judge.md` (md playbook; pii-redaction/run-judge.sh archived), `scripts/m5-auto-demo.sh`
- The new e2e rig: `tests/e2e/m5-teaching/` or `packages/cli/src/__tests__/m5-e2e-teaching.test.ts`
- Latest `docs/research/<DATE>-personal-use-3people/subject-1/` from #81's follow-up impl PR (existence check only)

## Outputs

- `docs/plans/issue-82/judge-output/<run-id>/verdict.json`
- `docs/plans/issue-82/judge-output/<run-id>/step-<N>/raw.json` + `evidence/`

`verdict.json` schema:

```json
{
  "run_id": "<iso-or-uuid>",
  "steps": [
    {"id": 1, "name": "glossary-lint",                "exit_code": 0, "metrics": {"forbidden_terms_in_body": 0, "whitelisted_section_only": true}},
    {"id": 2, "name": "m5-ship-regression",           "exit_code": 0, "metrics": {"checks_run": 7, "checks_pass": 7}},
    {"id": 3, "name": "e2e-teaching-rig",             "exit_code": 0, "metrics": {"positive_trigger_rate": 1.0, "false_positive_rate": 0.0}},
    {"id": 4, "name": "attribution-chain-complete",   "exit_code": 0, "metrics": {"events_checked": 12, "events_with_all_source_fields": 12}},
    {"id": 5, "name": "dependency-on-#81",            "exit_code": 0, "metrics": {"personal_use_subjects_present": 1}}
  ],
  "verdict": "pass",
  "verdict_reason": "all 5 steps green; attribution chain intact; dependency on #81 satisfied"
}
```

## Step 1 — Glossary lint

Sub-agent reads every `*.md` file added or modified by the impl PR (NOT the docs-only plan-PR — that one is exempt by design, see plan ③ section).

- Build forbidden term set from `docs/CONTEXT.md` _Avoid_ list, plus issue-82 specific bans: `["group sharing","group brain","group rule","cross-user","federated sync"]`.
- For each modified `*.md`, count occurrences **only inside body prose** — i.e. EXCLUDE:
  - The top-of-file ASCII art block (first fenced code block before the first `# ` heading).
  - Any inline backtick or fenced code content.
  - Quoted strings like `"group sharing"` (single- or double-quoted, length ≤ 40 chars, referring to issue title).
  - Any `## Glossary mapping` section (whitelisted in entirety).
  - Any risk-table row whose text describes user-facing confusion about the issue title (these are meta-explanatory, not canonical use).

Emit:

```json
{"file": "...", "hits_in_prose": 0, "hits_in_whitelisted_contexts": 6, "context_breakdown": {"ascii_art": 4, "backtick": 1, "quoted_title": 1}}
```

Pass condition: aggregate `hits_in_prose == 0`. The whitelisted-context counter is informational only — it confirms the lint understood the boundary correctly, not a fail signal.

## Step 2 — M5 ship regression

Sub-agent runs each of the 7 M5 already-shipped verifications:

1. Dispatch md playbook `docs/plans/docs--features--xsync--run-judge/judge.md` (script archived; do not invoke `docs/features/xsync/run-judge.sh` directly — archived to `docs/legacy/judge-scripts/docs/features/xsync/run-judge.sh`)
2. Dispatch md playbook `docs/plans/docs--features--pii-redaction--run-judge/judge.md` (script archived; do not invoke `docs/features/pii-redaction/run-judge.sh` directly — archived to `docs/legacy/judge-scripts/docs/features/pii-redaction/run-judge.sh`)
3. `bash scripts/m5-auto-demo.sh`
4. `pnpm exec vitest run packages/core/src/m5/__tests__/lww-merge.test.ts`
5. `pnpm exec vitest run packages/core/src/m5/__tests__/secret-scanner.test.ts`
6. `pnpm exec vitest run packages/core/src/m5/__tests__/scope-classifier.test.ts`
7. SessionStart auto-pull smoke: in a temp git project with `.teamagent/team/` bootstrapped, simulate SessionStart and verify the auto-pull chain completes without throwing (env vars unset → default-on path).

Emit per-check:

```json
{"check_id": 1, "name": "xsync-judge", "exit_code": 0, "stdout_path": "evidence/step-2/check-1.stdout.log"}
```

Pass condition: all 7 `exit_code == 0`. M5 must not regress.

## Step 3 — E2E teaching rig

Sub-agent runs the new e2e rig (path defined in plan ② section). Reads its `summary.json`. Pass conditions, all required:

- `positive_trigger_rate == 1.0`
- `false_positive_rate == 0.0`
- `attribution_present == true`
- `source_commit_sha` (top-level on each event in `attribution.jsonl`, matching the flat 4-field schema in plan §② and Step 4) matches the M1-side commit SHA recorded in `m1.log`
- Total intercept events ≥ the rig's expected sample size (configurable in the rig but ≥ 5)

The rig itself is responsible for picking a representative pitfall (e.g., a substring that maps cleanly to a `wrong_pattern` rule) and for not faking attribution chain. Sub-agent does NOT modify rig output.

## Step 4 — Attribution chain completeness

Sub-agent reads `attribution.jsonl` from step 3's evidence dir. For every event:

- Required fields: `source_author`, `source_machine_id`, `source_commit_sha`, `source_rule_id`.
- Each field must be non-empty string.

Pass condition: 100% of events have all 4 fields non-empty.

```json
{"events_checked": 12, "events_with_all_source_fields": 12, "events_missing_fields": []}
```

Any missing-field event lists the offending event ID and which fields are missing — those become the follow-up impl PR's punch list.

## Step 5 — Dependency on #81

Sub-agent reads `docs/research/` to find any subdir matching `*-personal-use-*people/subject-*` with redacted evidence files. Counts how many `subject-*` subdirs are present.

Pass condition: `personal_use_subjects_present >= 1` (per ADR-0006 hardness condition that #82's impl is gated on #81's impl having produced at least 1 redacted personal-use evidence subdir).

If the impl PR fires before any subject-* exists, this step fails; the impl PR is asked to wait, and #82 is **not** reopened.

## Step 6 — Aggregate verdict

Main agent reads `step-{1..5}/raw.json`, applies pass conditions, writes `verdict.json` per the schema above. Failure on any step is a hard block.

## Phase 2 fix log
Resolved 2026-05-08 (iter-4 P2): §V1 RUN steps 1+2 now dispatch md playbooks (docs--features--xsync--run-judge, docs--features--pii-redaction--run-judge) instead of broken archived .sh paths; Inputs dependency note updated to match. Commit see iter-4 fix commit.

## What this judge harness does NOT do

- It does not re-validate M5's overall design (PR #71 already shipped that).
- It does not measure "is team-scope viral sync useful" — that's product judgment for `docs/PRESHIP.md`.
- It does not replay across actually different physical machines for the e2e rig — two local worktrees + bare git remote is sufficient (rig isolation is documented in plan ① section).
- It does not enforce attribution chain UX styling — only field presence.
- It does not verify cross-project sharing (M5 spec §12 YAGNI; out of scope).
