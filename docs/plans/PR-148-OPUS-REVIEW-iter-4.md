# PR #148 — Independent /review Iteration 4

- Reviewed commit: `9376a1d` (HEAD before iter-4)
- Reviewer: opus 4.7 (1M context, main thread — opus subagent quota hit)
- Date: 2026-05-08
- Skill path: gstack `/review` (preamble + Codex passes skipped per user instruction "NEVER use codex review"; specialist-army subagents skipped per opus-quota constraint; core review work done directly)
- Branch: `worktree-mdplaybook` (43 commits ahead of `origin/main`, 0 behind)
- Diff: +8418 / -8419 across 203 files

## Iter-3 follow-up confirmation

| iter-3 finding | Fix applied? | Notes |
|---|---|---|
| P3 `docs/features/internet-rag/canned-answer-snippet.md` (run-judge.sh wrong "utility" label) | YES (iter-4 fix) | Replaced lines 39–40: run-judge entry now points at `docs/plans/docs--features--internet-rag--run-judge/judge.md` md playbook with note "script archived to docs/legacy/judge-scripts/...; use playbook"; verify-canned-answer.sh entry retained as utility (correct, in DO NOT MOVE list). Fix landed in this iteration's review commit. |

## Verdict

- [ ] PASS — no P1 / P2 findings; ready to merge
- [x] CHANGES REQUESTED — see findings below

## New findings (iter-4)

| Severity | Path | Line | Finding | Suggested fix |
|---|---|---|---|---|
| **P2** | `docs/plans/issue-82/judge.md` | 25, 75, 76 | Active md playbook §V1 RUN references **archived** `docs/features/xsync/run-judge.sh` and `docs/features/pii-redaction/run-judge.sh`. Both were moved to `docs/legacy/judge-scripts/...` during PR-148's archival sweep. Playbook §V1 is supposed to be runnable; an operator following these steps gets `No such file or directory` (exit 127). Originally added by `a38a4e6` (#143, "ADR-0006 + plans for #81 #82 #83 #89") and merged into PR-148 via `70d8568` — became this PR's responsibility once merged. Severity P2 not P3 because playbook §V1 is the canonical execution path; broken commands here mean the playbook does not actually grade the feature. | Update §V1 RUN steps 1+2 to dispatch the corresponding md playbooks instead: `docs/plans/docs--features--xsync--run-judge/judge.md` and `docs/plans/docs--features--pii-redaction--run-judge/judge.md`. Update line 25 dependency note similarly. Also update `scripts/m5-auto-demo.sh` reference if it's also archived (verify on disk first). |
| P3 | `docs/features/trae-adapter/canned-answer-snippet.md` | 13, 20 | References `bash docs/features/mcp-server/run-judge.sh (utility; or dispatch ...)`. `mcp-server/run-judge.sh` was archived (Worker B's batch 5 MOVE list, not in DO NOT MOVE exemption). The "utility" claim is factually wrong; only `verify-canned-answer.sh` for trae-adapter qualifies as utility. P3 not P2 because `canned-answer-snippet.md` files are documented as deprecated per the project's snippet convention (also flagged in iter-3 for internet-rag's same file class). | Replace both lines: lead clause → `dispatch the md playbook docs/plans/docs--features--mcp-server--run-judge/judge.md (script archived)`. Remove "utility" claim. |
| P3 | `docs/issues/92/plan.md` | 40 | Citation reads `(mirrors docs/features/doctor-install/run-judge.sh:280-321)`. `doctor-install/run-judge.sh` was archived (Worker B's batch 5 MOVE list). Citation path is broken; future readers cannot reach the cited line range. Issue #92 was closed by `a38a4e6` (close 5 unassigned feature issues), so this is a historical citation in a closed-issue plan; severity P3. | Update path to `docs/legacy/judge-scripts/docs/features/doctor-install/run-judge.sh:280-321` so the citation resolves on disk. |
| P3 | 3 Wave A DEPRECATED playbooks | §V3 | The three "always SKIP" Wave A playbooks — `docs/plans/docs--features--canned-answers--{run-judge,verify-canned-answer}/judge.md`, `docs/plans/docs--features--teamwork--verify/judge.md` — emit SKIP unconditionally. This loses regression-catch power: if a future change re-introduces the deleted canned answer (e.g. `TEAMWORK`, `DOGFOOD`, `DUCKPLAN`, `POSTPR`) into CLAUDE.md, the playbook still SKIPs and never catches the regression. The sibling `scripts--verify-codex-raw-chat` playbook was already tightened to "SKIP if `TEAMAGENT:START` absent; FAIL if trigger phrase regressed back" (commit `fee007b`). The same pattern should propagate. P3 because no current regression — the canned answers remain deleted. | Apply the verify-codex-raw-chat §V3 pattern to all three: SKIP iff the deleted trigger phrase (`TEAMWORK` / `DOGFOOD` / `DUCKPLAN` / `POSTPR` / `canned-answer` block markers) is absent from CLAUDE.md; FAIL if any regressed back. The §V1 RUN step becomes a single grep against CLAUDE.md instead of always-skip. |

## Audit signals (positive — Worker S sweep + iter-1/2/3 fixes confirmed)

These earlier-flagged hits are **NOT findings** — they are correctly handled:

- `docs/canary-verify/README.md:59-61` — bash commands inside `text` block prefixed `Historical command reference (archived; no longer at these paths):`. ✓
- `docs/teambrain/USAGE_EXAMPLES.md:40` — bash command inside `text` block prefixed `Historical command reference (archived — do not run directly):`. ✓
- `docs/teambrain/ONBOARDING.md:96` — same pattern. ✓
- `docs/vendored-skills-verification/README.md:31-33` — same pattern. ✓
- `docs/feature-inventory/2026-05-06-opus-review.md` — historical 2026-05-06 audit report, pre-PR-148; references reflect state at that time. ✓
- `docs/features/INDEX.md:59` (cursor-compiler) — `cursor-compiler/run-judge.sh` is in Worker B's DO NOT MOVE list (utility). Verified present on disk. ✓
- `docs/features/team-sharing-probe/README.md:59` — sweep note crediting PR-148; references archive path explicitly. ✓
- `docs/rule-verify/INDEX.md:67` — explicit attribution `archived bash orchestrator preserved at docs/legacy/judge-scripts/...`. ✓
- `docs/issues/92/report.md:50` (install-sh/run-judge.sh) — `install-sh/run-judge.sh` is in Worker B's DO NOT MOVE list (utility, kept on live path); only the citation in `plan.md` to `doctor-install/run-judge.sh` is dangling (P3 above).

## Audit summary

- **AUDIT 1 — Dangling .sh refs in active prose**: 4 real findings (1 P2 + 3 P3 above); 9 false-positive matches all in `text` blocks or correctly attributed.
- **AUDIT 2 — Trivial-pass §V3**: 3 Wave A playbooks have always-SKIP pattern (P3 finding above). All other DEPRECATED playbooks (9 of 12 in Wave A) use the tighter `TEAMAGENT:START` / `canned answer absent` check pattern.
- **AUDIT 3 — New `.sh` introduced**: 0. Worker M merge round (`70d8568`+`dc87a19`) and all subsequent commits introduced no `.sh` files outside `docs/legacy/judge-scripts/`. ✓
- **AUDIT 4 — CLAUDE.md canned-answer regression**: 0. All 14 canned answers from `d341da8` purge remain deleted; no triggers regressed back through Worker M's merge. ✓
- **AUDIT 5 — packages/ touched by PR-148 own commits**: 0. PR-148's commits are docs-only; any `packages/` diff vs main is from earlier merged PRs (#142, #145, #140, etc). ✓
- **AUDIT 6 — Pre-existing broken refs surfaced by merge**: `docs/plans/issue-82/judge.md` (P2 above) — pre-existing in `a38a4e6` but became PR-148's responsibility post-merge.

## Notes

- **Skill path**: gstack `/review` skill was invoked, but most of its preamble (telemetry / first-time onboarding / skill-prefix detection) and Codex passes (per user "NEVER use codex review") were skipped. Specialist-army subagents (testing/maintainability/security/etc.) were skipped because the opus subagent quota was hit; review work performed on the main thread (which is opus 4.7 1M context). Plan-completion audit skipped — this PR's plan is `docs/plans/2026-05-08-pr-148-fix-plan.md` and was already audited in iters 1-3.
- **Confidence**: Each finding has a path:line citation and a verifiable disk fact. P2 issue-82 finding is highest confidence — file `docs/features/xsync/run-judge.sh` confirmed ABSENT on disk; the playbook §V1 is unambiguously broken.
- **Cumulative score across iters**: iter-1 found 5 (3 P2 + 2 P3), all fixed. iter-2 found ~12 audit items, all fixed in `8a5ebfc`. iter-3 found 1 P3 (internet-rag), fixed at start of iter-4. iter-4 finds 4 (1 P2 + 3 P3). Trend: P2/P3 count is bounded and converging.
- **Recommendation**: fix P2 in this iter; P3 #2 + #3 are 2-line edits each (also fix); P3 #4 (always-SKIP tightening) is a 3-playbook coordinated change worth doing now while Wave A semantics are fresh.
