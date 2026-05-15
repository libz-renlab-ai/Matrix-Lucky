# PR #148 — Independent /review Iteration 3

- Reviewed commit: `8a5ebfc75afe0b8e68f447059458bf0e81e2d1ad`
- Reviewer: sonnet via subagent
- Date: 2026-05-08
- Skill path: manual

## Verdict

- [ ] PASS — no P1 / P2 findings; ready to merge
- [x] CHANGES REQUESTED — see findings below

## Iter-2 follow-up confirmation

| iter-2 finding | Fix applied? | Notes |
|---|---|---|
| P2 cursor-compiler | YES | `docs/features/INDEX.md` line 21 (tree) and line 59 (table) both correctly point to `bash docs/features/cursor-compiler/run-judge.sh (utility, not archived)` — file confirmed present at `docs/features/cursor-compiler/run-judge.sh`. |
| P3 pack-cli | YES | `docs/features/pack-cli/INDEX.md` "Verification" section now reads `bash docs/features/pack-cli/run-judge.sh (utility, retained per docs/legacy/judge-scripts/README.md exemption)` — file confirmed present. |
| Audit-discovered (10) | YES | Full audit re-run (grep pattern from spec) returned CLEAN. All referenced md playbook paths verified to exist on disk. Phase 3 sweep log in `docs/legacy/judge-scripts/README.md` covers all 12 files from `8a5ebfc` (docs/issues/92/ listed as group entry `{plan,report,research}.md`). |

## New findings

| Severity | Path | Line | Finding | Suggested fix |
|---|---|---|---|---|
| P3 | `docs/features/internet-rag/canned-answer-snippet.md` | 39–40 | `8a5ebfc` reverted the verification block to `bash docs/features/internet-rag/run-judge.sh` with the label "utility, retained per docs/legacy/judge-scripts/README.md exemption". However `docs/features/internet-rag/run-judge.sh` **does not exist at the live path** — it was archived to `docs/legacy/judge-scripts/docs/features/internet-rag/run-judge.sh` during Phase 1. An md playbook was created for this slug at `docs/plans/docs--features--internet-rag--run-judge/judge.md` (ACTIVE, confirmed on disk). The "utility exemption" claim is factually incorrect for this script; only `verify-canned-answer.sh` (not archived) qualifies. The previous text before `8a5ebfc` (pointing to the playbook) was structurally sounder; the revert introduced a new dangling reference. Severity is P3, not P2, because `canned-answer-snippet.md` files are marked DEPRECATED per `docs/features/CONVENTIONS.md` and are not part of the active workflow. | Replace line 39–40 with: `# Run-judge md playbook (script archived; use playbook):` / `docs/plans/docs--features--internet-rag--run-judge/judge.md` — or annotate that `run-judge.sh` is archived and `verify-canned-answer.sh` (utility, still live) is the only retained script for this slug. |

## Notes

- **Audit command result**: The spec grep returned no DANGLING lines; all non-exempt playbook paths referenced in active docs resolve on disk.
- **No P1 or P2 findings** introduced by the iter-2 fix commit `8a5ebfc`. The internet-rag issue is P3 (deprecated file, not in active workflow).
- **packages/**: PR #148's own commits (`8a5ebfc`, `4fd89fd`, `2abab11`, `5b24811`, `fb777b6`, `193f70d`, `8545d42`, `dc87a19`, `ab4f07e`, `a38a4e6`) touch no files under `packages/`. Diff vs `main` shows packages/ changes only from earlier merged PRs.
- **CLAUDE.md**: The diff vs `main` shows canned-answer trigger blocks were **removed** (not re-introduced). Three new learned-knowledge lines added by the compile system are normal.
- **`docs/plans/issue-82/judge.md`** references `docs/features/xsync/run-judge.sh` and `docs/features/pii-redaction/run-judge.sh` (both archived). This file was introduced in commit `a38a4e6` (merged before PR #148 scope) and is pre-existing; not introduced by this PR.
- **Overall**: iter-2's 12 fixes are correctly applied. Only one new issue surfaced (P3, deprecated file). No blocking findings.
