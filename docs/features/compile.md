```
   ┌────────────── teamagent compile ──────────────┐
   │                                               │
   │  knowledge store (DualLayerStore)             │
   │       project DB  +  user-global DB           │
   │                  │                            │
   │     filter active + tier                      │
   │                  │                            │
   │       ┌──────────┴───────────┐                │
   │       ▼                      ▼                │
   │  Skills out             CLAUDE.md out         │
   │  (default ON)           (default OFF)         │
   │  stable+                 canonical+           │
   │  ~/.claude/skills/        opt-in via          │
   │   teamagent/<id>/         --legacy-claude-md  │
   │   SKILL.md                or env              │
   │                          TEAMAGENT_LEGACY_    │
   │                          CLAUDE_MD=1          │
   │                                               │
   │  Codex target  → .codex/skills symlink        │
   │  Cursor target → <cwd>/.cursorrules           │
   └───────────────────────────────────────────────┘
```

# `teamagent compile`

## Goal

Compile the active knowledge store into the artifacts AI tools actually read at
runtime — Agent Skills under `~/.claude/skills/teamagent/`, optional Cursor
`.cursorrules`, optional Codex `.codex/skills` symlink, and (legacy opt-in)
the `<!-- TEAMAGENT:START -->...<!-- TEAMAGENT:END -->` managed block in
`CLAUDE.md`.

## Status

**Skills-default since M4 (commit `7e044b5`, 2026-05-03).** CLAUDE.md managed
block is no longer written by default; rule propagation goes through Skills +
`docs/knowledge/INDEX.md` instead. The block was actively removed in commit
`cdebe6e` (2026-05-06). Tests in `packages/cli/src/__tests__/compile.test.ts`
lock the new contract:

- L134 — `no flags: writes skills and leaves CLAUDE.md untouched` —
  `expect(nodeFs.existsSync(tmp.claudeMdPath)).toBe(false)`.
- L147 — `--legacy-claude-md restores old behavior (writes CLAUDE.md)`.
- L230 — `TEAMAGENT_LEGACY_CLAUDE_MD=1` env equivalent.

If you delete the `TEAMAGENT:START..END` block in `CLAUDE.md` and run
`pnpm teamagent compile` (no flags), the block does **not** come back. It only
regenerates with `--legacy-claude-md` (or the env var).

## How it works

Entry point: `packages/cli/src/bin.ts:612` → `packages/cli/src/commands/compile.ts:106 executeCompile`
→ `packages/core/src/pipeline/compile-pipeline.ts runCompile`.

### Default invocation (`pnpm teamagent compile`)

1. Resolve paths (`compile.ts:54 resolvePaths`):
   - project DB: `<cwd>/.teamagent/knowledge.db`
   - user-global DB: `~/.teamagent/global.db`
   - Skills dir: `~/.claude/skills/teamagent/` (override: `TEAMAGENT_SKILLS_DIR`)
2. `legacy = resolveLegacyFlag(opts)` → `false` because no flag, no env.
3. `markdownCompiler = undefined`, so `runCompile` skips the markdown branch
   (`compile-pipeline.ts:40`: `if (deps.writeMarkdown && deps.markdownCompiler && !deps.dryRun)`).
4. `skillCompiler` (`makeSkillCompiler`) writes one `SKILL.md` per qualifying
   entry — `status === 'active'` and `current_tier ∈ {stable, canonical, enforced}`.
5. Cleanup of demoted-rule skill dirs is wired through `compile.skill_should_remove`
   bus events (`SkillCompiler.cleanup` adapter unlinks `<skillsDir>/<ruleId>/`),
   but those events are emitted by `calibration-pipeline-v2` during tier
   transitions (typically inside the Stop hook), NOT inside `executeCompile`.
   `executeCompile` (`compile.ts:130-136`) does not pass `skillEvents` into
   `runCompile`, so a manual `pnpm teamagent compile` run does not unlink any
   directories on its own — it only writes Skills for currently-qualifying rules.
   Stale skill dirs from previous demotions are pruned the next time the Stop
   hook runs the calibrator and re-fires the cleanup events.
6. `renderCompileResult` prints `CLAUDE.md (disabled; no generated rule block)` +
   `Skills written: N 条` (and `Skills removed: N 条` only when the calling code
   actually fed in skill-removal events, which the manual CLI path does not).

### Legacy invocation (`--legacy-claude-md` or `TEAMAGENT_LEGACY_CLAUDE_MD=1`)

> **`--legacy-claude-md` is NOT deprecated. It is the documented opt-in that
> turns the CLAUDE.md managed-block writer back on.** Without it (or the env
> var), the writer is wired to `undefined` in `compile.ts:122-127` and the
> block is never written. With it, the block IS rewritten on every `compile`.

1. `MarkdownCompiler` is constructed pointing at `<cwd>/CLAUDE.md`.
2. `writeMarkdown = legacy && !skillsOnly && !markdownOnly` → `true`.
3. Filter is stricter: `current_tier ∈ {canonical, enforced}` (stable does NOT
   enter the markdown block).
4. Token budget enforced via `TEAMAGENT_CLAUDE_MD_TOKEN_BUDGET` (default 3000);
   over-budget rules are dropped with a footer like
   `（… 还有 N 条 canonical+ 规则因 token 预算未显示，见 teamagent compile --dry-run）`.
5. `injectBlockIntoDoc` (`packages/core/src/compiler/markdown.ts:233`) replaces
   the existing `<!-- TEAMAGENT:START - 自动管理，请勿手动编辑 -->` /
   `<!-- TEAMAGENT:END -->` region, or appends one if absent. Atomic write
   (temp + rename, with Windows EPERM fallback).

### Targets (`--target` / shorthand `--codex` / `--cursor` / `--both`)

| target           | extra effect                                                                 |
|------------------|------------------------------------------------------------------------------|
| `claude` (default)| Skills only (and CLAUDE.md if legacy).                                       |
| `codex`          | symlink `<cwd>/.codex/skills` → `~/.claude/skills/teamagent/`. Legacy mode also symlinks `<cwd>/AGENTS.md` → `<cwd>/CLAUDE.md`. |
| `both`           | Claude + Codex symlink behavior.                                             |
| `cursor`         | `CursorRulesCompiler` writes `<cwd>/.cursorrules` (or `--cursor-out <path>`).|

## Flags

| Flag                   | Effect                                                                  |
|------------------------|-------------------------------------------------------------------------|
| `--dry-run`            | preview only, no writes; output paths show `(dry-run)` / `(skipped)`.   |
| `--skills-only`        | skip CLAUDE.md (already the default when not legacy).                   |
| `--markdown-only`      | skip Skills; CLAUDE.md only writes when legacy is also on, otherwise no-op. |
| `--legacy-claude-md`   | turn the CLAUDE.md managed-block writer back on.                        |
| `--no-legacy-claude-md`| force off (overrides `TEAMAGENT_LEGACY_CLAUDE_MD`).                     |
| `--codex` / `--claude` / `--both` / `--cursor` | shorthand for `--target=...`.                   |
| `--target <t>`         | `claude|codex|both|cursor`, default `claude`.                           |
| `--cursor-out <path>`  | output for `--target cursor`, default `<cwd>/.cursorrules`.             |
| `--preset-only`        | legacy markdown filter (preset-sourced rules only).                     |
| `--force`              | reserved; current implementation is already idempotent.                 |

## Env vars

- `TEAMAGENT_LEGACY_CLAUDE_MD={1|true|yes}` — equivalent to `--legacy-claude-md`.
- `TEAMAGENT_SKILLS_DIR` — override the Skills output dir.
- `TEAMAGENT_RULES_DIR` — override nested rule store (`~/.claude/teamagent/rules`).
- `TEAMAGENT_CLAUDE_MD_TOKEN_BUDGET` / `TEAMAGENT_CLAUDE_MD_LIMIT` /
  `TEAMAGENT_CLAUDE_MD_DIVERSITY` — markdown budget knobs (legacy mode only).

## How to verify

```bash
# Default — CLAUDE.md NOT touched
shasum CLAUDE.md
sed -i.bak '/<!-- TEAMAGENT:START/,/<!-- TEAMAGENT:END/d' CLAUDE.md
pnpm teamagent compile
grep -c "TEAMAGENT:START" CLAUDE.md   # => 0  (block does not regenerate)
mv CLAUDE.md.bak CLAUDE.md

# Legacy — CLAUDE.md block IS rewritten
sed -i.bak '/<!-- TEAMAGENT:START/,/<!-- TEAMAGENT:END/d' CLAUDE.md
pnpm teamagent compile --legacy-claude-md
grep -c "TEAMAGENT:START" CLAUDE.md   # => 1
mv CLAUDE.md.bak CLAUDE.md
```

Unit tests: `packages/cli/src/__tests__/compile.test.ts`
(`no flags: writes skills and leaves CLAUDE.md untouched`,
`--legacy-claude-md restores old behavior`,
`env TEAMAGENT_LEGACY_CLAUDE_MD=1 forces legacy mode`).

E2E audit harness: `audit/runners/feature-06-compile.ts` —
`CLAUDE.md preserves user content and replaces old managed block`.

## Source

- CLI dispatch: `packages/cli/src/bin.ts:612`
- Command handler: `packages/cli/src/commands/compile.ts`
- Pipeline orchestrator: `packages/core/src/pipeline/compile-pipeline.ts`
- Markdown adapter: `packages/adapters/src/compiler/markdown-compiler.ts`
- Block markers + injection: `packages/core/src/compiler/markdown.ts:8-9, 233`
- Skill compiler: `packages/adapters/src/compiler/skill-compiler.ts`
- Cursor compiler: `packages/adapters/src/compiler/cursor-rules-compiler.ts`

## History

- M2.4 (2026-04-16) — `docs/superpowers/plans/2026-04-16-m2.4-dual-output-compile.md`
  introduced the dual-output design with CLAUDE.md still on by default.
- M4 (2026-05-03, commit `7e044b5` "feat(m4): replace CLAUDE rule dump with docs
  propagation") flipped the default to Skills-only; CLAUDE.md output became
  legacy opt-in.
- 2026-05-06, commit `cdebe6e` "docs(claude-md): drop auto-managed TEAMAGENT
  block" — removed the residual empty placeholder block; project knowledge now
  flows through `docs/knowledge/INDEX.md` + Skills.
