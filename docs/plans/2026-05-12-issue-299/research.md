# Research — issue #299

Pre-implementation reconnaissance. Cited line numbers reference `feat/issue-299` at worktree creation time.

## Root cause — confirmed by reading source

- **Source file exists**: `packages/cli/src/bin-digital-twin-tap.ts` (full hook entry, imports `@teamagent/digital-twin`).
- **Locally built (cli package)**: `packages/cli/dist/bin-digital-twin-tap.cjs` is present — the cli package's own tsup config (not the one consulted here) bundles it for source-mode runs.
- **Release tsup omits it**: `packages/teamagent/tsup.config.ts` (the release-tarball builder) has two blocks:
  - First block (`format: ["esm"]`, the main `bin` ESM entry): only `bin: ENTRIES.bin`. Not relevant.
  - Second block (`format: ["cjs"]`, the eight hook bundles): `entry` lists 8 keys — `bin-pre-tool-use`, `bin-post-tool-use`, `bin-stop`, `bin-session-end`, `bin-session-start`, `bin-pre-compact`, `bin-user-prompt-submit`, `bin-updater`. **`bin-digital-twin-tap` is absent**.
  - `ENTRIES` dict at the top of the file (`const ENTRIES = { ... }`) — same 9 keys total, also missing `bin-digital-twin-tap`.
- **Install-table reference**: `packages/cli/src/commands/install-hook.ts:401-414` `ALL_CHANNELS` includes `{ channel: "Stop", tag: DIGITAL_TWIN_TAG, bundleFilename: "bin-digital-twin-tap.cjs", ..., scopes: ["user"] }`.
- **Silent-skip line**: `packages/cli/src/commands/install-hook.ts:496-497`:

  ```ts
  const bundlePath = resolveBundle(def.bundleFilename);
  if (!bundlePath || !fs.existsSync(bundlePath)) continue;
  ```

  This is the exact codepath that swallows the missing file. Below it (lines 500–512), the user-level path stages via `stageBundleToUserTeamagent`; absence means the channel is silently dropped from the in-memory settings before `writeSettings`.

## Adjacent finding — corrects issue body's #305 implication

- `dist/teamagent-statusline.cjs` IS in the release tarball — it is copied via the second tsup block's `onSuccess` hook (`tsup.config.ts:123-127`). Therefore #305's "statusline `TeamAgent | 规则:2 ...` line missing" symptom is NOT caused by this bug. #305 was correctly closed as duplicate of #313 (auto-update rate limit), and fixing #299 does not restore that user's statusline.

## `@teamagent/digital-twin` is not in `noExternal`

`packages/teamagent/tsup.config.ts:110-118` lists `@teamagent/types`, `@teamagent/ports`, `@teamagent/core`, `@teamagent/adapters`, `@teamagent/cli`, `zod`, `@xenova/transformers` in the cjs block's `noExternal`. **`@teamagent/digital-twin` is absent**. Because `bin-digital-twin-tap.ts` imports from it, simply adding `bin-digital-twin-tap` to `ENTRIES` would produce a cjs bundle that still has `require("@teamagent/digital-twin")` at runtime, which fails after global install (no sibling install in the npm package layout). Fix: add `@teamagent/digital-twin` to the cjs block's `noExternal`.

This is an obvious extension of the grilled scope: without it, the build entry fix is non-functional, so it sits inside step 1 of the 4-step plan rather than being a new step.

## Doctor entry point

`packages/cli/src/commands/doctor.ts:227 executeDoctor()` is the dispatch — pushes `DoctorCheckResult`s to a `checks` array. Existing checks include `checkHookRegistered`, `checkHookScript`, `checkHookSpawn`, `checkStaticUserSkillsPropagated`, `checkPluginSync`, `checkCodexBin`, `checkMcpReachability`, `checkClaudeMd`, etc. Pattern is consistent: each check is an exported function returning `{ name, status, detail }`.

To add the install-table-bundles check, we need to:

1. Export `ALL_CHANNELS` (and possibly a helper `enumerateInstallTableBundlePaths(homeDir?: string)`) from `packages/cli/src/commands/install-hook.ts` so doctor can iterate without duplicating the install-table definition. Currently `cliRoot()` and `ALL_CHANNELS` are module-private.
2. Add a new exported function in doctor.ts (e.g. `checkInstallTableBundles()`) that calls `enumerateInstallTableBundlePaths`, runs `existsSync` on each `bundlePath`, returns `status: "fail"` listing the missing `bundleFilename`s when any are absent.
3. Push it into `executeDoctor`'s `checks` array.

Exit-non-zero on `failed > 0` is the existing contract — `executeDoctor` already computes `failed` and the CLI dispatcher uses `allPassed` to set process.exit. No change needed there; will verify via unit test.

## CHANGELOG state

`CHANGELOG.md` already has an `## Unreleased` section with one entry (the nested-init-guard fix). New fix slots in alongside it under `### Fixed`. The 0.11.0 section starts immediately after Unreleased and is not touched.

## Test patterns to mirror

- For static-tsup-entries assertion: any new test under `packages/teamagent/__tests__/` will be its first sibling — the package doesn't currently have a tests dir alongside its dist. Likely cleaner to put the assertion under `packages/cli/src/__tests__/install-hook-tsup-parity.test.ts` instead, importing both `ALL_CHANNELS` from install-hook.ts and the tsup config (or its ENTRIES dict). Tsup configs are TS, so importing them in tests is fine; the relative path is `../../../teamagent/tsup.config.ts`. Test asserts every `bundleFilename` minus `.cjs` extension appears as a key in the imported `ENTRIES` dict.
- For doctor.test.ts extension: existing `packages/cli/src/__tests__/doctor.test.ts` (1 of the 2 doctor-related test files; the other is `doctor-diff.test.ts`) is the natural home — add a describe block `"checkInstallTableBundles"` with positive (all present) and negative (one missing) cases plus an `executeDoctor` integration case asserting exit-non-zero behavior via the returned `allPassed: false`.
- For install-hook.test.ts extension: mirror the existing pattern (sandbox tmpdir, fixture settings.json). New case spies on `process.stderr.write` (or captures via `node:stream`'s `Writable`) and asserts the exact warn line.

## Risk register

- **Risk**: noExternal expansion to `@teamagent/digital-twin` could surface a previously-shimmed native dep (sqlite, sqlite-vec, sharp). Mitigation: `NATIVE_EXTERNAL` already covers `better-sqlite3`/`sqlite-vec`/etc. globally — verify the digital-twin tap's transitive imports stay in that list. If new natives surface, externalize them too. Will validate during local build.
- **Risk**: Importing tsup.config.ts in a test file may execute its `defineConfig` callbacks. Mitigation: tsup configs are pure data + onSuccess closures; calling `defineConfig(arr)` just returns the array. The test reads `ENTRIES` directly via the exported binding, not by invoking the config. If `ENTRIES` is not currently exported, the test commit moves it to an `export const ENTRIES`.
- **Risk**: Windows path separators in stderr warn line — `bundleFilename` is hardcoded basename only (no path), so no separator concerns.
- **Risk**: `doctor --json` already exists (line 90 parseDoctorArgs). The new check appends to the JSON output naturally.

## What is explicitly NOT being touched

- `0.11.0` CHANGELOG section
- `#305` / `#313` (auto-update rate limit) — out of scope
- Any non-Stop hook channel's install-table semantics
- The cli package's own (working) tsup config — the bug is in the teamagent package's config
- The user-level digital-twin daemon binary (`bin-uploader.cjs`) — that's already handled by `stageDaemonBinaryToUser`, separate from this bug
