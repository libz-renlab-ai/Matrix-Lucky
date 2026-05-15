```text
   PR #255 (closed)             →    PR-256 (this PR)
   "do alignment, leave         →    "tidy 5 residual classes,
   residuals as out-of-scope"        let probe stop surfacing them"
        │                                  │
        │                                  ▼
        ▼                            5 surface classes cleaned:
   .claude/settings.json (SoT)      ① bin.ts help
   DEFAULT_PLUGINS aligned          ② init.ts banner / docstring
                                    ③ packages/teamagent/CLAUDE.md AI learnings
                                    ④ scripts/evidence-phase-gaps-ab.ts
                                    ⑤ 7 test fixture files (placeholders)
```

# Research — Issue #256: 清理 PR #255 排除的 superpowers/sales 残留字面值

## What changed in PR #255 vs what was deliberately left

PR #255 (squash `0b3e9c1`) aligned the active surface — `packages/core/src/init/default-plugins.ts:DEFAULT_PLUGINS` and `DEFAULT_MARKETPLACES` — with the project-level source of truth `.claude/settings.json:enabledPlugins` (6 plugins, 1 marketplace `claude-plugins-official`). Two install-plugins tests with hardcoded `sales` literals were fixed in the same PR (`/review` iter-1).

PR #255's grill explicitly listed five "out-of-scope" residual classes:

| # | class | files / lines |
|---|-------|---------------|
| 1 | bin.ts help text | `packages/cli/src/bin.ts:480,1230` |
| 2 | init.ts opt-in banner / docstring | `packages/cli/src/commands/init.ts:91,1546` |
| 3 | packages/teamagent/CLAUDE.md AI learnings | L20 + L21 in the auto-managed block |
| 4 | evidence script | `scripts/evidence-phase-gaps-ab.ts:224` (`targetPlugins`) |
| 5 | test fixtures (placeholder strings) | bootstrap-diff / manifest / m5-cli / fs-bootstrap / install-plugins (CSV parser) / sandbox-all-features (CSV parser) / claude-plugin-installer |

This PR (#256) closes all 5 classes so that `claudefast -p "in THIS project, what files we have related to superpowers ?"` no longer surfaces them.

## What is intentionally left untouched

Real, non-residual references to the literal string `superpowers` that MUST stay:

- `docs/superpowers/specs/...` and `docs/superpowers/plans/...` — actual milestone directory names (Phase 2/3/4 design + impl plans).
- `packages/types/src/m5.ts:3`, `packages/core/src/validator/l0.ts:44` — JSDoc comments pointing to `docs/superpowers/specs/...` design docs.
- `docs/CONTEXT.md`, `docs/FASTPROBE.md`, `docs/README.md`, `docs/SELF-UPDATE.md` — text references to `docs/superpowers/...` doc paths.
- `scripts/evidence-phase-gaps-ab.ts:219,256` — `readIfExists(... "docs/superpowers/specs/2026-04-22-product-roadmap-v3.md")` reads a real archived roadmap; the path is content addressable, not a plugin name.
- `.claude/skills/office-hours/SKILL.md`, `.codex/skills/office-hours/SKILL.md` — English phrase `"sales skills"` (selling skills, not the plugin).

The probe is allowed to surface these — they're part of the project's history and prose, not user-facing plugin defaults.

## Substitution choices

For test fixtures and CSV parser tests, opaque placeholder strings were swapped for current-bundle plugin names (per `.claude/settings.json:enabledPlugins`):

| placeholder before | placeholder after |
|--------------------|-------------------|
| `superpowers` | `playground` |
| `caveman` | `code-review` |
| `sales` | `code-review` (or `frontend-design` where set-cardinality matters) |

Test invariants (set difference, parser CSV split, render shape) are independent of the literal value, so the swap is mechanical. Verified by green test runs (209/209).

`claude-plugin-installer.test.ts` "returns failed on ✘" case used `ghost@knowledge-work-plugins` (a deliberately invalid plugin in a real marketplace). After the swap, `knowledge-work-plugins` is no longer in DEFAULT, so the literal becomes a stale reference. Replaced with `ghost@nonexistent-marketplace` — same semantics (test that adapter surfaces ✘ as `failed`), but no stale plugin/marketplace name.

`packages/teamagent/CLAUDE.md` is fully wrapped in `<!-- TEAMAGENT:START - 自动管理，请勿手动编辑 -->` … `<!-- TEAMAGENT:END -->`. Per project `local-install/CLAUDE.md`: default `pnpm teamagent compile` does NOT regenerate the CLAUDE.md block (writes only to Skills); only `--legacy-claude-md` flag re-emits it. Manual edits stick under default behavior. Two stale plugin-bundle learnings removed; remaining lines preserved.

## Verification matrix

| step | tool | criterion |
|------|------|-----------|
| V1.1 surface scan (bin.ts, init.ts, teamagent CLAUDE.md, evidence script) | `grep -nE "(superpowers\|caveman\|sales)"` | 0 hits (excluding `docs/superpowers/` paths in evidence script) |
| V1.2 fixture scan (7 test files) | same | 0 hits |
| V1.3 unit tests | `vitest` on touched files | all pass |
| V1.4 root typecheck | `pnpm typecheck` (root, `tsconfig.base.json`) | exit 0 |
| V1.5 `claudefast` probe (post-merge) | `claudefast -p "in THIS project, what files we have related to superpowers ?"` | does NOT list bin.ts / init.ts / packages/teamagent/CLAUDE.md / m5 fixtures / evidence-phase-gaps-ab.ts as related-to-plugin-superpowers |

V1.5 is the user's gate condition; it runs after merge and may require iteration on `docs/` (probe could still mention legitimate `docs/superpowers/` — that's allowed; the test is whether the 5 above-classed files surface).

## Out-of-scope (intentional)

- 不改 `.claude/settings.json`（保留 SoT 角色，PR #255 已成立）。
- 不动 `docs/superpowers/` 任何内容（合法 milestone 目录）。
- 不动 root `CLAUDE.md` / `AGENTS.md` 任何 canned-answer 段落。
- 不开 follow-up issue（PR-PLAN：同 PR 修；这本身就是单 PR）。
- 不引入 `knowledge-work-plugins` / `sales` / `superpowers` 回任何 default。
- 预先存在于 `origin/main` 的 `@teamagent/core` 包级 `tsc -p packages/core` rootDir TS6059（fixtures/scenarios/）与本 PR 无关。
