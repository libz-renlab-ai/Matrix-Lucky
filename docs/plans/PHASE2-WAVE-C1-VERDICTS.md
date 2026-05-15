# Phase 2 Wave C-1 — scripts/* ACTIVE Verdict Scoreboard

> 9 ACTIVE playbooks for archived scripts/* judge harnesses, tested
> §V1 RUN → §V2 DUMP → §V3 READ. Env note: claudefast API
> unreachable, so claudefast-dependent steps SKIP-INFRA.

| # | Playbook | Steps PASS | Steps SKIP-* | Overall verdict |
|---|----------|------------|--------------|-----------------|
| 1 | scripts--verify-l0 | tests✓ typecheck✓ bundle✓ hook-exit✓ stats✓ | none | FAIL — hook keyword "先检查下载目录" NOT found |
| 2 | scripts--verify-l3-sim | bundle✓ t2(trace)✓ | events.jsonl absent | FAIL — t1 keyword miss, t3 keyword miss, 0 new events |
| 3 | scripts--verify-issue85-pr1 | infra-check✓ (scripts/install-from-md.ts, INSTALL.md, skill exist) | T1–T6 SKIP-INFRA (all claudefast) | SKIP |
| 4 | scripts--verify-hyperframes-fixes | prereqs✓ wav-exists✓ duration-in-range✓ dirs✓ | lint SKIP-UNSAFE (npx network) | MIXED — WAV/duration pass; backup absent; lint unverified |
| 5 | scripts--hook-prompt-verify | none | none | FAIL — both test files missing: format-snapshot.test.ts and keyword-matcher-meta-cmd.test.ts not in repo |
| 6 | scripts--verify-vendored-skills | skill-mirrors-exist✓ | Phase 1+2 SKIP-INFRA (claudefast); Phase 4 SKIP-INFRA (tmux) | FAIL — hard diff non-empty: 3-line preamble bin-lookup divergence in both skills |
| 7 | scripts--judge-first-run | J1 typecheck✓ J2 vitest 6/6✓ J3 postinstall-exit✓ | J4/J5 SKIP-INFRA (expect/TTY) | FAIL — J3 anchors 5/6; J6 help baseline mismatch (+4 pack subcommand lines) |
| 8 | scripts--user-collect--run-v4-judge | pre-flight all 8 files✓; prior judge.json verdict=PASS✓ | Step 4 SKIP-INFRA (claudefast), using prior run evidence | PASS (prior run evidence confirms inner verdict PASS) |
| 9 | scripts--duck-mode-verify | stats-exits✓ postinstall-exits✓ | V5 SKIP (canned answers removed d341da8) | FAIL — duck_lines_emitted=0 (no 呷呷/鸭鸭/>ω< in stats or postinstall output) |

## Summary

- PASS: 1 / 9
- FAIL: 5 / 9
- MIXED: 1 / 9
- SKIP: 1 / 9
- (MIXED counted for PB4 where blocking criteria partially verified, partially unverifiable)

## Notes

**Infrastructure gaps:**

1. **claudefast API unreachable** — affects PB3 (all steps), PB6 (phases 1+2+4), PB8 (step 4). PB8 recovered by reading a prior judge.json from 2026-05-06 run.
2. **Worktree has no built dist/** — `packages/cli/dist/bin-pre-tool-use.cjs` absent in worktree; all hook tests ran against main repo's built binary. Hook bundle must be rebuilt in worktree or shared via symlink for fully standalone runs.
3. **node_modules absent in worktree** — all pnpm commands forwarded to main repo at `/Users/m1/projects/TeamBrain`.

**Regressions / surprises:**

- **PB1 + PB2**: The `wget` Bash hook invocation returns `allow` without emitting the Chinese phrase `先检查下载目录`. Either (a) the download-directory rule is not in the live knowledge store, or (b) the rule's trigger pattern doesn't match the synthetic payload format. This caused both the L0 and L3-sim keyword assertions to fail.
- **PB5**: Two test files hardcoded in the playbook (`format-snapshot.test.ts`, `keyword-matcher-meta-cmd.test.ts`) do not exist. Playbook references stale paths — likely moved or renamed during M5 refactor.
- **PB6**: The `.claude` and `.codex` skill mirrors diverge by 3 lines in the preamble bin-lookup section (different priority order). YAML frontmatter is identical. This is a known divergence from the project-level vs user-level bin-path resolution strategy.
- **PB7 J6**: Help baseline file (`docs/baselines/help-output.txt`) is 99 lines; current help output is 103 lines. Four new `teamagent pack` subcommand lines were added after the baseline was captured — baseline needs update.
- **PB9**: `TEAMAGENT_EXPLAIN_LIKE_CEO_DUCK=1` does not produce any duck-style characters (`呷呷`/`鸭鸭`/`>ω<`) in either `teamagent stats` or `postinstall` output. The duck-mode feature exists in `packages/core/src/duck-mode/` but is not wired into `stats` or `postinstall` output paths in the current build.
