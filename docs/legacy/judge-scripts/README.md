# Deprecated Judge Harness Scripts

These shell scripts are archived here as a frozen reference. **They are
no longer called by any workflow** in this project.

## Why deprecated

The project's third-party judge harness rule (see
`docs/HOWTO-PLAN-PR.md` § 3b and `docs/PR-PLAN.md` § ③) requires:

- **Third-party judge harness forbidden fixed scripts.**
- **MUST use md playbook.**

Judge harnesses must live at `docs/plans/<issue>/judge.md` as markdown
playbooks dispatched by the MAIN agent through subagents (TEAMWORK
`N+1+(2N)`) or `claudefast -p` probes (FASTPROBE max 8 parallel).
Fixed bash scripts encode judgement logic into code that itself needs
a judge — recursive "who tests the test?" — and reviewers can't grep
judgement logic out of `[[ ]]` exit codes.

## What's archived

Categories preserved under their original relative paths:

- Per-rule canned-answer verifiers (`docs/<rule>/verify-canned-answer.sh`)
- Per-feature judge harnesses
  (`docs/features/<feature>/{run,prod,real,extraction,transfer}-judge.sh`,
  `docs/features/<feature>/verify-canned-answer.sh` for the subset that
  grep canned-answer probe outputs)
- canary-verify, feature-verify-kit harnesses
- Project-wide orchestrators: `scripts/verify-all-rules.sh`,
  `scripts/verify-l*.sh`, `scripts/judge-*.sh`, `scripts/duck-mode-verify.sh`,
  `scripts/hook-prompt-verify.sh`, `scripts/verify-vendored-skills.sh`,
  `scripts/verify-issue85-pr1.sh`, `scripts/verify-hyperframes-fixes.sh`,
  `scripts/verify-codex-raw-chat.sh`, `scripts/verify/tbrain-verify.sh`,
  `scripts/user-collect/run-v4-judge.sh`

UTILITY scripts (CLI smoke tests, vitest wrappers, mirror checkers, dogfood
launchers, info collectors, installers, demos, hook scripts, test fixtures)
are NOT archived — they remain in their original locations.

## Migration path

For each archived script, the verification logic should move into a
`docs/plans/<feature>/judge.md` md playbook with three sections:

- **§V1 RUN** — fixed tools to invoke
- **§V2 DUMP** — canonical JSON schema written to `.judge/<run_id>/judge.json`
- **§V3 READ** — separate LLM judge reads ONLY raw JSON + evidence

The MAIN agent dispatches the playbook through subagents or claudefast probes;
no fixed bash gates the verdict.

This archive exists for git history and reference. Deleting the archive
entirely in a future commit is acceptable; `git log` preserves original
content.

## Phase 3 sweep log (PR #148, 2026-05-08)

All dangling references to archived `.sh` paths were swept across docs on
branch `worktree-mdplaybook`. Files updated:

- `docs/rule-verify/INDEX.md` — registry table converted to md playbook pointers
- `docs/PRODUCT-FEATURES.md` — evidence column updated for features 5, 8–64
- `docs/features/INDEX.md` — run-all section rewritten
- `docs/feature-verification.md` — run command updated
- `docs/feature-verify-kit/README.md` — run sections replaced
- `docs/canary-verify/README.md` — re-run section replaced
- `docs/feature-verification/duck-mode-judge-harness.md` — script ref updated
- `docs/feature-verification/hook-prompt-judge-harness.md` — script ref updated
- `README.md` — installer verify harness updated
- `WORKTREE_TASK.md` — archive note added
- `scripts/judge-first-run.README.md` — sweep note added
- 17 `docs/features/*/canned-answer-snippet.md` files — bash→text blocks
- `docs/features/first-run.md` — verification section updated
- `docs/features/multi-tool.md` — 3 references updated
- `docs/features/team-share.md` — 2 references updated
- `docs/features/pack-cli/INDEX.md` — judge harness reference updated
- `docs/features/team-sharing-probe/README.md` — run sections rewritten
- `docs/specs/2026-05-07-issue82-*.md` (5 files) — run command references updated
- `docs/specs/2026-05-07-issue85-*.md` (2 files) — verify script references updated
- `docs/specs/2026-05-07-issue87-first-run.md` — 4 references updated
- `docs/PRESHIP.md` — Rule 8 updated
- `docs/pr-14-status.md` — utility/archive clarification added
- `docs/issues/92/{plan,report,research}.md` — run-judge refs updated
- `docs/vendored-skills-verification/README.md` — harness ref updated
- `docs/reports/2026-05-06-canned-answer-migration-report.md` — verify-all-rules refs updated
- `docs/teambrain/ONBOARDING.md` — tbrain-verify refs updated
- `docs/teambrain/USAGE_EXAMPLES.md` — tbrain-verify refs updated
- `docs/teambrain/TRAPS.md` — TRAP-OPS-012 verify_command and GAP table updated
- `docs/teambrain/VERIFY_TEMPLATE.md` — command field and example updated
- `docs/teambrain/CONVERGENCE.md` — H24-36 and Decision paragraphs updated
- `docs/teambrain/agent_rules/claude.md` — AP-8 awk scope updated
- `docs/teambrain/evidence/README.md` — registered runs table and archive gate description updated
