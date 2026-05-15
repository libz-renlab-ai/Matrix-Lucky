```text
   PR #257 V1.5 probe                  ⮕    PR #258 (this PR)
   surfaced 1 file in the 5-class gate       3 surgical edits clean
   + 2 newly discovered residuals             everything left
   ────────────────────────────────          ────────────────────────────────
   ❌ scripts/evidence-phase-gaps-ab.ts  →   ✅ doc-path repointed to
      (dead path docs/superpowers/                docs/backup/phase2-superseded/
       specs/...-v3.md, file moved)              (real current location)
   + README.md:282 stale plugin-bundle   →   ✅ swapped for "与 .claude/
     user-facing copy line                       settings.json:enabledPlugins
                                                同步" wording
   + root CLAUDE.md:8-9 dead doc-paths   →   ✅ -v2 suffix applied (real
                                                current files)
```

# Research — Issue #258: PR #257 后剩余 3 处 superpowers 残留

## V1.5 probe state at session start (run from neutral cwd post PR #257 merge)

`claudefast -p "in THIS project, what files we have related to superpowers ?"` from `/tmp` returned a list of ~50 main-project files plus ~1980 worktree clones. Per the 5-class gate from PR #256:

| class | file | state after PR #257 |
|-------|------|---------------------|
| 1 | `packages/cli/src/bin.ts` | ✅ clean |
| 2 | `packages/cli/src/commands/init.ts` | ✅ clean |
| 3 | `packages/teamagent/CLAUDE.md` | ✅ clean |
| 4 | m5 fixtures (4 files) | ✅ clean |
| 5 | `scripts/evidence-phase-gaps-ab.ts` | ❌ still surfaces (2 doc-path strings) |

Plus 2 newly discovered residuals not in the original 5-class list but matching the user's "above details" intent:

- `README.md:282`: `teamagent install-plugins    # 装 superpowers / sales / playground 等团队标配 skill` — user-facing CLI cheatsheet line, stale.
- `CLAUDE.md:8-9` (root): `Phase 2+ 产品 roadmap：docs/superpowers/specs/2026-04-15-product-roadmap.md` and `Phase 2 设计：docs/superpowers/specs/2026-04-15-phase2-design.md`. Both paths are dead; the actual files are `-v2.md` (verified by `ls`).

## Why these specific paths

- `docs/superpowers/specs/2026-04-22-product-roadmap-v3.md` — referenced in `evidence-phase-gaps-ab.ts:219` (`readIfExists`) and L257 (`oldEvidence` array). The file was moved to `docs/backup/phase2-superseded/2026-04-22-product-roadmap-v3.md` (verified by `find docs -name '2026-04-22-product-roadmap-v3.md'`). The `readIfExists` was returning empty string the whole time; the comparison `roadmapText.includes("双向同步规则")` was always false → the script's `id: 15` "团队共享/跨机器同步" status branch was always landing in `blocked-by-environment`. Repointing to the real archive path restores the original semantic.
- `docs/superpowers/specs/2026-04-15-product-roadmap.md` — root `CLAUDE.md:8` link. The current file is `2026-04-15-product-roadmap-v2.md` (with `-v2` suffix). Same for `2026-04-15-phase2-design.md` → `-v2.md`.
- `README.md:282` — user-facing install hint. Replacing the old plugin-bundle name list with a pointer to `.claude/settings.json:enabledPlugins` keeps the cheatsheet self-updating.

## What is intentionally left

- Existing cross-links to `docs/superpowers/` from many docs (`docs/CONTEXT.md`, `docs/FASTPROBE.md`, `docs/README.md`, `docs/SELF-UPDATE.md`, `docs/PRODUCT-FEATURES.md`, etc.) — these point to the real folder name; they're allowed to surface in the probe per V1.5 gate definition.
- `docs/plans/2026-05-10-issue-{253,256,258}/` — this PR's and prior PRs' Boris-workflow docs that discuss the cleanup work; allowed (historical record).
- `packages/types/src/m5.ts:3`, `packages/core/src/validator/l0.ts:44` JSDoc cross-links — pointing at real `docs/superpowers/specs/...` files.
- `.claude/skills/office-hours/SKILL.md` and `.codex/skills/office-hours/SKILL.md` `"sales skills"` — English phrase, not plugin name.
- `docs/backup/phase2-superseded/...` and `docs/backup/phase1/...` — archived phase docs.

## Verification matrix

| step | tool | criterion |
|------|------|-----------|
| V1.1 evidence-phase-gaps-ab.ts | `grep "docs/superpowers/"` | 0 hits |
| V1.2 README.md | `grep "superpowers"` | 0 hits |
| V1.3 root CLAUDE.md links alive | `ls <-v2 doc paths>` | both files exist |
| V1.4 typecheck | `pnpm typecheck` (root) | exit 0 |
| V1.5 claudefast probe (post-merge) | per probe prompt | 5-class clean |

## Out-of-scope (intentional)

- 不删 `scripts/evidence-phase-gaps-ab.ts` 整文件（仍是 audit 入口）。
- 不重命名 `docs/superpowers/` 目录（合法 milestone 名，全项目跨链）。
- 不动 `docs/PLAN-RESEARCH-REPORT.md` / `docs/HOWTO-PLAN-PR.md` / `docs/CONTEXT.md` 等里的 cross-link 句子（probe 允许 surface）。
- 不开 follow-up issue（PR-PLAN）。
