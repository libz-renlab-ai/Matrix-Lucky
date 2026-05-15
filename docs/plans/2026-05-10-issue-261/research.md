```text
   audit/feature-10               PR #255 changed bundle:
   ────────────────              ──────────────────────────
   was hardcoded against         3 mkts + 4 plugins  →  1 mkt + 6 plugins
   OLD 3-plugin bundle           (caveman + knowledge-work-plugins gone)
   (superpowers / sales /             │
   caveman) — now broken              ▼
        │                        SCENARIOS array + 484-line plan.md
        ▼                        rewrite to match new bundle
   non-CI invocation, silent     audit runner verified PASSING locally
   breakage since #255 merged
```

# Research — Issue #261: audit/feature-10 rewrite to PR #255 6-plugin bundle

## Why this exists

`audit/runners/feature-10-install-plugins.ts` and `audit/plans/feature-10-install-plugins.md` are an "non-self-evidencing audit" harness for `teamagent install-plugins`. They predate PR #255 and hardcoded the OLD 3-plugin / 3-marketplace bundle (`superpowers + sales + caveman` across `claude-plugins-official + knowledge-work-plugins + JuliusBrussee/caveman`). After PR #255 collapsed `DEFAULT_PLUGINS` to 6-plugin / 1-marketplace (all from `claude-plugins-official`, mirroring `.claude/settings.json:enabledPlugins`), this audit was silently broken — running `tsx audit/runners/feature-10-install-plugins.ts` would fail because the `default` scenario expects 5 argv calls but the actual code now produces 7.

`feature-10` is **not invoked from CI** (verified by `grep -rn "feature-10" .github/ scripts/ Makefile package.json`) so the breakage was never surfaced. It would only fail when a maintainer ran the audit on demand.

## What changed

### `audit/runners/feature-10-install-plugins.ts`

`SCENARIOS` array (the only data structure that referenced specific plugin names) rewritten:

| scenario | before | after |
|---|---|---|
| `default` | 2 mkts + 3 plugins (5 calls), `5 新装` | 1 mkt + 6 plugins (7 calls), `7 新装` |
| `dry-run-project-scope` | `5 将执行` | `7 将执行` |
| `only-sales-local-scope` | `--only=sales`, `sales@knowledge-work-plugins`, excludes superpowers/playground | renamed `only-code-review-local-scope`, `--only=code-review`, `code-review@claude-plugins-official`, excludes playground/frontend-design |
| `unknown-plugin` | unchanged | unchanged |

`fakeClaudeScript()`, `validatorScript()`, `cliCommand()`, IO framework, `summary` string for the `passed` branch — all remain (only the `only=sales` mention in the summary string was updated to `only=code-review`).

### `audit/plans/feature-10-install-plugins.md`

484-line audit design doc fully rewritten to match the new bundle:

- Default bundle JSON (L37-49 region): 3 mkts + 4 plugins → 1 mkt + 6 plugins
- JSONL example (was 7 lines, now 7 lines but with 1 mkt + 6 plugins instead of 3 mkts + 4 plugins)
- Section A "默认行为" header: "3 个 marketplace + 4 个 plugin" → "1 个 marketplace + 6 个 plugin"
- Section A NODE assertion's `expected` array: 3+4 → 1+6
- Section B (`--scope=project`): `marketplaceRows.length !== 3 || pluginRows.length !== 4` → `!== 1 || !== 6`
- Section C: `--only=caveman` → `--only=code-review`; expected argv updated
- Section D: `--only=superpowers,playground` → `--only=playground,code-review`; expected argv updated
- Section E (`--dry-run`): unchanged (no plugin name dependency); kept "7 将执行"
- Section F (unknown): unchanged
- Section G: `--only=caveman,ghost` → `--only=code-review,ghost`; expected argv updated
- 判定标准汇总: "3 marketplace add 后 4 plugin install" → "1 marketplace add 后 6 plugin install"
- Added new bullet: "默认 bundle 与项目级 .claude/settings.json:enabledPlugins 保持一致（PR #255 起）"

Production code (`packages/cli/src/commands/install-plugins.ts`, `packages/adapters/src/plugins/claude-plugin-installer.ts`, `packages/core/src/init/default-plugins.ts`) NOT modified — audit follows the source, not the other way around.

## Verification (run during driver step 4)

| step | result |
|------|--------|
| `grep -nE "(superpowers\|caveman\|sales\|knowledge-work-plugins\|JuliusBrussee)"` on both files | empty |
| `pnpm typecheck` (root) | exit 0 |
| `pnpm exec tsx audit/runners/feature-10-install-plugins.ts` | `PASSED feature-10-install-plugins` |

## Out of scope

- 不动其他 14 个 audit feature（feature-01 / 02 / ... / 20）
- 不动 `audit/runners/lib.ts`、`audit/runners/run-all.ts`、`fakeClaudeScript()`、`validatorScript()`
- 不引入 `knowledge-work-plugins` / `sales` / `superpowers` / `caveman` 回任何地方
- 不开 follow-up issue（PR-PLAN）
