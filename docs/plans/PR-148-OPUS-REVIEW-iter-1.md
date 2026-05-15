# PR #148 — Independent /review Iteration 1

- Reviewed commit: `fb777b6b860db77425e8c08e0b00770c37d3086d`
- Reviewer: sonnet (claude-sonnet-4-6) via subagent (opus 1M quota capped until 5pm Asia/Shanghai)
- Date: 2026-05-08
- Skill path: manual (project `/review` skill not invoked — independent review per instructions)

## Verdict

- [ ] PASS — no P1 / P2 findings; ready to merge
- [x] CHANGES REQUESTED — see findings below

## Findings

| Severity | Path | Line | Finding | Suggested fix |
|---|---|---|---|---|
| P2 | `docs/features/INDEX.md` | 11–22 (tree diagram) and 39–62 (prose + table) | The file tree comment and "All features — VERIFIED" table both still reference archived `.sh` harnesses by their old paths (`auto-capture/verify-canned-answer.sh + real-judge.sh`, `calibrator-v2/run-judge.sh`, `team-share/run-judge.sh`, `xsync/run-judge.sh`, `mcp-server/run-judge.sh`, `pii-redaction/run-judge.sh`, `hook-registered/run-judge.sh`, `doctor-install/run-judge.sh`, `cursor-compiler/run-judge.sh`, `ab-benchmark/run-judge.sh`, `rule-quality/run-judge.sh`, `matcher-scope/run-judge.sh`, `multi-tool/verify-canned-answer.sh`). Lines 39–40 describe the design rule as "All shipped features carry a judge harness (`run-judge.sh`) or verify script (`verify-canned-answer.sh`)" — precisely the shape that was just deprecated. The bottom of the table (line 76) does note scripts are archived, but the table above it gives no indication the "Verify Script" column now contains dead paths. Any reader using this table to find the active harness will land on paths that no longer exist outside `docs/legacy/`. The `ab4f07e` sweep missed this file's tree-diagram and table columns. | Replace tree-diagram labels with `← md playbook at docs/plans/<slug>/judge.md`; replace the "Verify Script" column in the VERIFIED table with "md playbook" pointers; update the prose at lines 39–40 to say playbooks, not `.sh`. |
| P2 | `docs/features/pii-redaction/GOAL.md` | 10, 12, 63 | Three lines in `related_docs:` and the "Notes for verifier" section explicitly name `docs/features/pii-redaction/run-judge.sh` and `docs/features/pii-redaction/verify-canned-answer.sh` as the active harness. Those two files were archived to `docs/legacy/judge-scripts/docs/features/pii-redaction/`. The `ab4f07e` sweep log in `docs/legacy/judge-scripts/README.md` does not list `GOAL.md` as updated. A verifier following this file will try to run a script that no longer exists at this path. `last-verified.md:48` repeats the same bad path. | Replace `.sh` references in `GOAL.md` and `last-verified.md` with pointers to `docs/plans/docs--features--pii-redaction--run-judge/judge.md` and `docs/plans/docs--features--pii-redaction--verify-canned-answer/judge.md`. Add archive note, consistent with how other swept files were updated. |
| P2 | `docs/feature-verify-kit/README.md` | 33–34 | The "回归守护" sentence reads `bash docs/feature-verify-kit/test-hardmatch-regression.sh （由 Worker 1 创建的同级脚本）已接入 run-all.sh，…`. This embeds two dead references in one sentence: (a) `test-hardmatch-regression.sh` still exists at this path (not archived), so the command itself would run, but (b) `run-all.sh` was archived to `docs/legacy/judge-scripts/docs/feature-verify-kit/run-all.sh`. The sentence tells readers the regression script is "wired into `run-all.sh`" as its entry point — a guard that no longer applies because `run-all.sh` is deprecated. The actual regression gate is now Step 6 in `docs/plans/docs--feature-verify-kit--run-all/judge.md`. This creates a misleading assurance: readers believe the regression guard is automated by a gate that no longer runs. | Rewrite the "回归守护" sentence to: (1) drop the `run-all.sh` wiring claim; (2) point to `docs/plans/docs--feature-verify-kit--run-all/judge.md` §V1 Step 6 as the active mandatory regression gate; (3) keep the `bash docs/feature-verify-kit/test-hardmatch-regression.sh` command if the script itself still serves as a manual quick-check, or archive it and update the reference accordingly. |
| P3 | `docs/plans/docs--features--canned-answers--verify-canned-answer/judge.md` | 39 | The Notes section ends with: "Active rule verification is now handled via `docs/rule-verify/INDEX.md` and `bash scripts/verify-all-rules.sh`". This contradicts the rest of the PR: `scripts/verify-all-rules.sh` is archived to `docs/legacy/judge-scripts/scripts/verify-all-rules.sh` and `docs/rule-verify/INDEX.md` itself was updated in `ab4f07e` to remove that script. The correct statement is "Active rule verification is now handled via md playbooks — dispatch from `docs/rule-verify/INDEX.md` using `claudefast -p` probes." A reader consulting this Notes section to understand where rule verification lives gets sent to an archived path. | Replace line 39 to say: "Active rule verification is now handled via `docs/rule-verify/INDEX.md` — dispatch the corresponding md playbook via `claudefast -p` probe (see that file's registry table). Do not run `scripts/verify-all-rules.sh`; it is archived at `docs/legacy/judge-scripts/scripts/`." |
| P3 | `CLAUDE.md` | 47 | The Gstack skills section ends with: `確定性验证：bash scripts/verify-gstack-skill-mirrors.sh`. This script was **not** archived — it still exists at `scripts/verify-gstack-skill-mirrors.sh` — so the command itself is runnable. However, per project rule (CLAUDE.md meta-constraint, `docs/HOWTO-PLAN-PR.md` §3b), judge harnesses must use md playbooks, not fixed scripts. The plan (`docs/plans/2026-05-08-pr-148-fix-plan.md` §② negative outputs) explicitly says "No new `.sh` files introduced" but the existing `verify-gstack-skill-mirrors.sh` was not archived or converted. This is a pre-existing `.sh` that survives the purge untouched — its retention is not called out in the plan or README as an intentional exception. The legacy README does explicitly exempt "UTILITY scripts (CLI smoke tests, vitest wrappers, mirror checkers, dogfood launchers…)" from archiving. The script is a mirror-checker utility, which fits that exemption. The CLAUDE.md reference is therefore borderline acceptable but should be clarified. | Add a parenthetical noting this is a utility mirror-checker (not a judge harness) so future readers don't question it: `bash scripts/verify-gstack-skill-mirrors.sh  # utility mirror-checker (not a judge harness; retained per docs/legacy/judge-scripts/README.md exemption)`. No archiving needed. |

## Notes

**What this PR does well:**

1. The core work — archiving 61 judge scripts, creating 61 md playbooks, stripping 14 canned-answer blocks from CLAUDE.md — is structurally sound and correctly executed. The `docs/legacy/judge-scripts/README.md` clearly documents the deprecation rationale and scope.

2. `docs/rule-verify/INDEX.md` is cleanly migrated. The registry table correctly points to md playbooks, and the "Run them all" section correctly describes dispatch via `claudefast -p`. The `ab4f07e` sweep covered this file well.

3. The two previously-reported Codex P2 issues (auto-capture/verify-canned-answer playbook and feature-verify-kit/run-all hardmatch regression gate) are correctly addressed in commits `8545d42` and `fb777b6`.

4. Historical command references in `docs/canary-verify/README.md`, `docs/vendored-skills-verification/README.md`, `docs/teambrain/ONBOARDING.md`, and `docs/teambrain/USAGE_EXAMPLES.md` are correctly placed inside "Historical command reference (archived — do not run directly)" fenced blocks, which is the right pattern.

5. `docs/teambrain/evidence/` transcripts reference `scripts/verify/tbrain-verify.sh` extensively — these are immutable historical evidence records, not active instructions, and are correctly left unchanged.

6. No code changes in `packages/` were introduced by this PR (confirmed via `git diff --name-only`), so no test coverage gap exists in the code layer.

7. CLAUDE.md is genuinely lean (185 lines) with no re-introduced canned-answer trigger sections.

**Scope assessment:**

The sweep in `ab4f07e` touched 56 files according to the commit message, but `docs/features/INDEX.md` and `docs/features/pii-redaction/GOAL.md` were not in the sweep log (`docs/legacy/judge-scripts/README.md` lines 63–95). These two files were added to the repo before the archive commit and contain tables and YAML `related_docs` lists that directly named the archived scripts as the active harness.

The P2 findings (INDEX.md table + pii-redaction GOAL.md) are the most important — they are the natural first stop for anyone trying to run a feature harness and will send them to broken paths with no indication that the paths moved. The other two are cosmetic/documentation-consistency issues.

**Eight regressions from Phase 2:** The PHASE2-FINAL-REPORT.md correctly lists these as "suggested follow-up tickets" rather than blocking this PR. That triage is appropriate — they pre-date this PR and are independent of the md-playbook migration.
