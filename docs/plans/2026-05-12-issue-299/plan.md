# Plan — issue #299: `bin-digital-twin-tap.cjs` missing from 0.11.0 dist

## Task description

The 0.11.0 release tarball references `dist/bin-digital-twin-tap.cjs` as a user-level Stop hook in its install table and CHANGELOG, but the file is never built into `dist/`. `applyChannelOps` silently `continue`s past missing bundles, so the install reports success while the user-level digital-twin Stop tap never registers. Root cause: `packages/teamagent/tsup.config.ts` `ENTRIES` dict (and the second tsup block's `entry` list) omits `bin-digital-twin-tap`. Fix the build entry, add defense-in-depth in both the install path (`applyChannelOps`: warn-and-continue instead of silent skip) and the diagnostic path (`teamagent doctor`: walk every install-table-referenced bundle, fail-loud with exit non-zero on missing files), and correct the 0.11.0 CHANGELOG claim via a new Unreleased entry. Scope: a single squash-merged PR confined to `packages/teamagent/tsup.config.ts`, `packages/cli/src/**`, `scripts/judge/issue-299.mjs`, `docs/plans/2026-05-12-issue-299/`, and `CHANGELOG.md` (Unreleased section only — the 0.11.0 historical entry stays untouched).

## Expected outputs

1. **Build entry**: `packages/teamagent/tsup.config.ts` `ENTRIES` dict and the second tsup block's `entry` list both list `bin-digital-twin-tap` → after `pnpm --filter teamagent build`, `packages/teamagent/dist/bin-digital-twin-tap.cjs` exists.
2. **`@teamagent/digital-twin` bundled**: since the new bin imports from `@teamagent/digital-twin`, that workspace package is added to the cjs block's `noExternal` list so the produced cjs file is self-contained (mirrors how `@teamagent/cli`/`@teamagent/core` are bundled).
3. **applyChannelOps soft-warn** (`packages/cli/src/commands/install-hook.ts`): when `resolveBundle(filename)` returns falsy or `!fs.existsSync(bundlePath)`, write one stderr line `teamagent: skipping channel <channel-name> — bundle <bundle-filename> not found\n`, then continue. Warning is NOT silenced in CI. Install proceeds with whatever bundles exist.
4. **Doctor strict universal check** (`packages/cli/src/commands/doctor.ts`): new check function (e.g. `checkInstallTableBundles`) iterates every `ChannelDef` in `ALL_CHANNELS`, resolves each `bundleFilename` to `<cliRoot>/dist/<filename>`, calls `fs.existsSync`. Status `"fail"` with the missing filenames listed when any are absent. `executeDoctor` adds this check to its `checks` array. `doctor` already exits non-zero when `!allPassed` — verify and lock with a unit test.
5. **CHANGELOG**: a `## Unreleased` → `### Fixed` bullet under the existing accumulating entries naming `bin-digital-twin-tap.cjs` and noting that 0.11.0's "net 1 spawn per Stop" claim was effectively a no-op for downstream users until this fix. The 0.11.0 section itself is not modified.
6. **Unit tests** added next to each source change:
   - `packages/teamagent/__tests__/tsup-entries.test.ts` (or similar location next to the tsup config): asserts every `ChannelDef.bundleFilename` in `ALL_CHANNELS` has a corresponding key in tsup `ENTRIES`.
   - `packages/cli/src/__tests__/doctor.test.ts` extended: missing-bundle case → status `"fail"`, exit non-zero from `executeDoctor`.
   - `packages/cli/src/__tests__/install-hook.test.ts` extended: missing-bundle on user-level → stderr contains exact warn line, exit code 0, other channels still installed.
7. **Judge harness** at `scripts/judge/issue-299.mjs` emits `docs/plans/2026-05-12-issue-299/evidence/<run_id>/judge.json` (see §how-to-eval below).
8. **Plan/research/report docs** at `docs/plans/2026-05-12-issue-299/{plan,research,report}.md` (this file, research.md, and a post-merge report.md).

## How to eval — third-party harness emits JSON for LLM-judge

Harness: `scripts/judge/issue-299.mjs` (Node ESM, no dependencies beyond Node stdlib + workspace-installed `gh`/`pnpm`/`npm`). Layout mirrors `scripts/judge/issue-280.mjs`.

Steps the harness executes:

1. **Setup** — `mkdtemp` a sandbox HOME at `os.tmpdir()/teamagent-issue-299-<ulid>/`. Capture run_id = ulid.
2. **Build** — `pnpm --filter teamagent build` from repo root. Assert exit 0.
3. **Bundle presence (positive case)** — assert `fs.existsSync(packages/teamagent/dist/bin-digital-twin-tap.cjs)`. Emit `dist_has_tap_cjs`.
4. **Install pipeline (positive case)** — pack via `cd packages/teamagent && npm pack`, then `npm install --prefix <sandbox> <tgz>`. Inside sandbox, run `node <sandbox>/node_modules/teamagent/dist/bin.js install-hook --cwd <sandbox-project>` with `HOME=<sandbox>`. Assert exit 0.
5. **Settings inspection** — read `<sandbox>/.claude/settings.json`. Assert presence of a `Stop` hook entry with `_teamagentTag === "teamagent-digital-twin-tap"` whose `command` ends in `bin-digital-twin-tap.cjs`. Emit `settings_has_tap_entry`.
6. **Doctor strict — negative case A** — delete the freshly-installed `<sandbox>/node_modules/teamagent/dist/bin-digital-twin-tap.cjs`, run `node <sandbox>/node_modules/teamagent/dist/bin.js doctor --json` with `HOME=<sandbox>`. Capture exit code + stderr. Assert exit code ≠ 0 AND combined stdout+stderr contains the bundle filename. Emit `doctor_exit_code_when_missing` (numeric) + `doctor_stderr_names_file` (bool).
7. **applyChannelOps soft-warn — negative case B** — with the file still deleted, re-run `install-hook` against a fresh `<sandbox>/proj2/`. Assert exit 0, stderr contains `teamagent: skipping channel Stop — bundle bin-digital-twin-tap.cjs not found`, AND `<sandbox>/.claude/settings.json` still contains the non-digital-twin Stop entry (`bin-stop.cjs`). Emit `install_exit_code_when_missing` + `install_stderr_warn_line_present` + `other_hooks_still_installed_when_missing`.
8. **Emit JSON** — write `docs/plans/2026-05-12-issue-299/evidence/<run_id>/judge.json` with all six bool/numeric fields, plus a `verdict` field computed by these rules (all must be true):
   - `dist_has_tap_cjs === true`
   - `settings_has_tap_entry === true`
   - `doctor_exit_code_when_missing !== 0`
   - `doctor_stderr_names_file === true`
   - `install_exit_code_when_missing === 0`
   - `install_stderr_warn_line_present === true`
   - `other_hooks_still_installed_when_missing === true`
9. **Print summary** — last line of stdout: `JUDGE: <PASS|FAIL> run_id=<ulid>`.

LLM-judge (downstream, not invoked by harness) reads `judge.json` and confirms verdict. The harness itself is **byte/numeric** — no LLM in the loop. PASS = all 7 conditions above. Platform: runs on ubuntu + windows via the existing CI matrix (`.github/workflows/ci.yml` + the inner-loop `wip/**` workflow); macOS manual smoke by maintainer.
