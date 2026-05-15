# PR #148 — Independent /review Iteration 2

- Reviewed commit: `2abab1153b78d5afba0581fdd6276c2e02c621ca`
- Reviewer: sonnet (claude-sonnet-4-6) via subagent (opus 1M quota capped)
- Date: 2026-05-08
- Skill path: manual

## Verdict

- [ ] PASS — no P1 / P2 findings; ready to merge
- [x] CHANGES REQUESTED — see findings below

## Iter-1 follow-up confirmation

| iter-1 finding | Fix applied? | Notes |
|---|---|---|
| P2-1 INDEX.md | YES | Tree diagram and VERIFIED table columns fully replaced with `docs/plans/docs--features--<slug>/judge.md` pointers; prose at lines 39–40 updated to say "md playbook"; `"Verify Script"` column renamed `"MD Playbook"`. All replacement paths verified to exist — except cursor-compiler (see New Findings P2-1). |
| P2-2 pii-redaction GOAL.md | YES | `related_docs:` YAML replaced with two playbook paths; verifier prose replaced; `last-verified.md` line 48 updated. Archive note added. |
| P2-3 feature-verify-kit README | YES | "回归守护" sentence no longer claims wiring into `run-all.sh`; points to `docs/plans/docs--feature-verify-kit--run-all/judge.md §V1 Step 6` as the active gate. |
| P3-1 canned-answers playbook | YES | Line 39 now says "dispatch via `claudefast -p` probe (see that file's registry table). Do not run `scripts/verify-all-rules.sh`; it is archived…". |
| P3-2 CLAUDE.md gstack | YES | Comment `# utility mirror-checker (not a judge harness; retained per docs/legacy/judge-scripts/README.md exemption)` appended to the `verify-gstack-skill-mirrors.sh` line. |

## New findings

| Severity | Path | Line | Finding | Suggested fix |
|---|---|---|---|---|
| P2 | `docs/features/INDEX.md` | 21 (tree), 59 (table) | The iter-1 fix (`2abab11`) correctly replaced the old `cursor-compiler/run-judge.sh` reference with `docs/plans/docs--features--cursor-compiler--run-judge/judge.md`. However, that playbook **does not exist** (`ls docs/plans/docs--features--cursor-compiler--run-judge/` → no such directory). `docs/features/cursor-compiler/run-judge.sh` still lives at its original path and was never archived to `docs/legacy/judge-scripts/` (not in the 14-entry `run-judge.sh` archive). A verifier following the INDEX.md pointer will hit a 404. This is introduced by the iter-1 fix: before `2abab11`, the entry read `cursor-compiler/run-judge.sh` (live file, runnable); after the fix, it reads a nonexistent playbook path. | Either (a) create `docs/plans/docs--features--cursor-compiler--run-judge/judge.md` with §V1/§V2/§V3 structure and archive `docs/features/cursor-compiler/run-judge.sh` to `docs/legacy/judge-scripts/`; or (b) if cursor-compiler is out of scope for the 61-script migration, revert the INDEX.md entry to `cursor-compiler/run-judge.sh` (live path) with a note that it is a retained utility harness per legacy README exemption. |
| P3 | `docs/features/pack-cli/INDEX.md` | "Verification" section | Pre-existing (not introduced by iter-1 fix): `pack-cli/INDEX.md` (updated in the original `ab4f07e` sweep) declares the judge harness at `docs/plans/docs--features--pack-cli--run-judge/judge.md`, but that playbook does not exist. `docs/features/pack-cli/run-judge.sh` still lives at the original path and is not in the archive. The original sweep updated this file's `INDEX.md` but created no corresponding playbook. The `packages/core/src/packs/index.ts` JSDoc at line 118 still references the `.sh` path as well. Severity is P3 (not P2) because this is a pre-existing condition that predates and is independent of the iter-1 fix: the path was already broken before `2abab11`. | Same options as P2-1 above: create the playbook + archive the script, or clarify that pack-cli is a retained utility and update its INDEX.md accordingly. |

## Notes

**All 5 iter-1 findings correctly resolved.** The diffs for each file confirm
the exact changes requested were applied.

**P2-1 cursor-compiler is the only blocker introduced by the iter-1 fix.** The
iter-1 fix's INDEX.md edit propagated the correct pattern (md playbook pointer)
but accidentally targeted a slug (`cursor-compiler`) whose playbook was never
created and whose script was never archived. The fix needs one of the two
remediation paths above before merge.

**P3-1 pack-cli** is a pre-existing stale reference in `pack-cli/INDEX.md` that
the `ab4f07e` sweep produced but left dangling. It is not blocking (the primary
INDEX.md at `docs/features/INDEX.md` never listed pack-cli in its VERIFIED
table), but should be cleaned up in the same commit as P2-1 since the pattern
is identical.

**No code changes** were introduced in `packages/` by `2abab11`; no test
coverage gap.

**No new `.sh` files** were introduced.

**CLAUDE.md** remains clean at 185 lines with no canned-answer trigger
re-introductions.
