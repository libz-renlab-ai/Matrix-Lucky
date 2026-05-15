# Phase 2 Wave A — DEPRECATED Verdict Scoreboard

> 14 playbooks for canned-answer graders whose target rules were
> removed from CLAUDE.md at commit `d341da8`. PASS path for DEPRECATED
> playbooks = §V3 emits SKIP. Any FAIL means a deleted canned answer
> regressed back.

| # | Playbook | Trigger phrase (truncated) | CLAUDE.md hits | Verdict |
|---|----------|---------------------------|----------------|---------|
| 1 | docs--bugreport--verify-canned-answer | what would happen when user find a bug | 0 | SKIP ✅ |
| 2 | docs--dogfood--verify-canned-answer | explain what would happen when we say DOGFOOD | 0 | SKIP ✅ |
| 3 | docs--fastprobe--verify-canned-answer | what would happen if we say word 'FASTPROBE' ? | 0 | SKIP ✅ |
| 4 | docs--features--canned-answers--run-judge | DOGFOOD / DUCKPLAN / POSTPR (multi-trigger) | 0 | SKIP ✅ |
| 5 | docs--features--canned-answers--verify-canned-answer | keyword gate: DOGFOOD/POSTPR/BUGREPORT/FASTPROBE/PRESHIP/DUCKPLAN as canned-answer sections | 0 | SKIP ✅ |
| 6 | docs--features--teamwork--verify | what would happen when we say TEAMWORK | 0 | SKIP ✅ |
| 7 | docs--github-account--verify-canned-answer | what accounts we use for github ? | 0 | SKIP ✅ |
| 8 | docs--gstack-bin--verify-canned-answer | gstack skills and brain sync bin - project level or user level ? | 0 | SKIP ✅ |
| 9 | docs--postpr--verify-canned-answer | what we shall do after each PR? | 0 | SKIP ✅ |
| 10 | docs--product-features--verify-canned-answer | list all the features we clamined please. list product feature not tech feature | 0 | SKIP ✅ |
| 11 | docs--project-tools--verify-canned-answer | what project tools we have ? | 0 | SKIP ✅ |
| 12 | docs--response-language--verify-canned-answer | based on this project rule, what language agent uses when talk with users and asked in english | 0 | SKIP ✅ |
| 13 | scripts--verify-all-rules | (orchestrator; checks for verify-canned-answer.sh child scripts) | 0 | SKIP ✅ |
| 14 | scripts--verify-codex-raw-chat | TEAMAGENT:START managed block in CLAUDE.md | 3 | FAIL ❌ |

## Summary

- SKIP (expected): 13 / 14
- FAIL (regression): 1 / 14

## Notes

### Playbook #3 — fastprobe (keyword noise, trigger still absent)

`grep -nF "FASTPROBE" CLAUDE.md` returns 1 hit (line 11), but it is a
prose documentation link to `docs/FASTPROBE.md`, not the canned-answer
trigger section. The primary trigger phrase
`"what would happen if we say word 'FASTPROBE' ?"` returns 0 hits.
Verdict is SKIP (trigger absent); keyword noise noted.

### Playbooks #4 and #5 — canned-answers (keyword noise, triggers absent)

`grep -nF "POSTPR" CLAUDE.md` returns 2 hits (lines 11-12), and
`grep -nF "DUCKPLAN" CLAUDE.md` returns 1 hit (line 11). All are prose
references to documentation files (`docs/POSTPR.md`, `docs/HOWTO-PLAN-PR.md`)
in the "Reference Documents" header block — not canned-answer rule sections.
The individual trigger phrases return 0 hits. Verdict is SKIP for both #4
and #5; keyword noise noted.

### Playbook #14 — verify-codex-raw-chat (FAIL: managed block regressed)

`grep -nF "TEAMAGENT:START" CLAUDE.md` returns 3 hits:
- Line 67: prose explanation of the marker name in the compile section
- Line 69: prose safety note about the marker in the compile section
- Line 146: **actual `<!-- TEAMAGENT:START -->` managed block comment**

The managed block IS present in CLAUDE.md (line 146). The playbook's §V3
states SKIP only when `managed_block_present == false`. Since the block is
present, §V3 logic produces PASS or FAIL (not SKIP), which means the
expected DEPRECATED SKIP path is unreachable. This constitutes a regression:
the managed block was expected to be absent by default since commit d341da8
(which mandates `--legacy-claude-md` opt-in). The block appears to have been
written back via `pnpm teamagent compile --legacy-claude-md` or equivalent.

**Action required**: confirm whether the managed block at line 146 was
intentionally regenerated. If not, remove it to restore the expected
deprecated state for this playbook.
