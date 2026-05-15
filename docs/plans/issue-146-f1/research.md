```text
   ┌─────────────────────────┐       ┌─────────────────────────┐
   │ Stop hook tick fires    │       │ daemon (bin-uploader)    │
   │ bin-digital-twin-tap.cjs │  ──►  │ scans pending/, uploads,│
   │ → tapSession() lands     │       │ idle 15min self-exits   │
   │   payload+meta into      │       │                         │
   │   ~/.teamagent/digital-  │       │  ❌ never starts because│
   │   twin/queue/pending/    │       │     bin-uploader.cjs    │
   └─────────────────────────┘       │     does not exist on    │
              │                       │     disk anywhere        │
              ▼                       └─────────────────────────┘
   spawn(detached, unref)
   if (deps.daemonBin && exists)
        ──────────────────────► always undefined
                                 (resolveDaemonBin returns null)
```

# Research: F1 — bin-uploader.cjs not built / not installed

## 已知事实 (Hard facts)

### Build pipeline state (origin/main @ f94de53)

- `packages/digital-twin/package.json:14` `build` script:
  ```
  tsup src/index.ts src/mock-server.ts --format esm --dts
  && tsup src/bin-prod-server.ts --format cjs --target node16 --out-dir dist
  ```
  → produces `dist/index.js`, `dist/mock-server.js`, `dist/bin-prod-server.cjs`. **`bin-uploader` is not an entry**.
- `packages/cli/tsup.hook.config.ts` builds 10 hook `.cjs` (incl. `bin-digital-twin-tap.cjs`) with `noExternal: ["@teamagent/digital-twin", ...]`. Does NOT build `bin-uploader`.
- Verified: parent checkout `packages/digital-twin/dist/` contains only `index.{js,d.ts}`, `mock-server.{js,d.ts}`, `chunk-*.js`. No `bin-uploader.cjs`. `find ~ -name 'bin-uploader.cjs'` returns 0 results.

### Spawn site (where daemon ought to be invoked)

- `packages/cli/src/bin-digital-twin-tap.ts:48-53`:
  ```ts
  export function resolveDaemonBin(home: string): string | null {
    const paths = digitalTwinPaths(home);
    const prod = path.join(paths.digitalTwinDir, 'bin-uploader.cjs');
    if (existsSync(prod)) return prod;
    return null;  // <— always taken
  }
  ```
- `paths.digitalTwinDir = ~/.teamagent/digital-twin/`. No code anywhere copies/installs the daemon binary into this directory.
- `packages/digital-twin/src/hooks/tap-session.ts:115` only spawns when `deps.daemonBin && existsSync(deps.daemonBin)` is truthy → spawn branch is dead code in current production.

### Install pipeline (template for daemon install)

- `packages/cli/src/commands/install-hook.ts:459 installHook()`:
  - Copies `dist/*.cjs` hook bundles, references via absolute path in `.claude/settings.local.json`.
  - Pattern: `if (!fs.existsSync(hookEntry)) throw "请先运行 pnpm --filter @teamagent/cli build:hook"`.
- Installed Stop hook entry: `dist/bin-digital-twin-tap.cjs` registered in `.claude/settings.json` via `bash .claude/hooks/digital-twin-tap.sh` shim (PR #205).

### CLI subcommand surface (PR #198)

- `packages/cli/src/commands/digital-twin.ts` defines: `login | logout | status | pause | resume | inject-mock`. No `install-daemon` / no `daemon-start`.

### Bundling constraints

- `bin-uploader.ts` imports from `./index.js` (single-package internal) → already part of `digital-twin/`, no `noExternal` needed at digital-twin level.
- `process-manager.ts` uses `'node:fs'`, `'node:os'`, `'node:path'` only. No native deps. Safe to bundle as single CJS.
- `cc-session.ts` uses `'node:zlib'` (gzip). No native.

### Existing daemon contract (already in code, untouched by F1 fix)

- `runDaemon` (bin-uploader.ts:29) acquires PID lock via `acquirePidLock` + runs `mainLoop`. Loop polls every 60s, exits idle after 15min. Auth-failed → exit 1; idle → exit 0. ✓ Working as designed.

### Tests

- `packages/digital-twin/src/hooks/__tests__/tap-session.test.ts:103-160`:
  - `'does not spawn daemon when daemonBin is missing/undefined'` ✓
  - `'spawns daemon detached when daemonBin exists, ignoring stdio'` ✓ (uses fake daemonBin path)
- `packages/cli/src/__tests__/bin-digital-twin-tap.test.ts`: mocks `resolveDaemonBin` indirectly via `tapSession` injection. **No assertion that real-life resolveDaemonBin returns non-null.**

## 约束 / Hard constraints

- Hook contract: `bin-digital-twin-tap.ts` MUST NEVER throw / exit non-zero (Stop hook must not block session close).
- Single-package change preferred: avoid editing `packages/cli/` if possible (PR-1..5 owners are different; minimize blast radius).
- Daemon binary location MUST be `~/.teamagent/digital-twin/bin-uploader.cjs` (already hardcoded in `bin-digital-twin-tap.ts:50` and documented in spec) OR fallback to monorepo `packages/digital-twin/dist/bin-uploader.cjs` (for dev/fresh worktrees).
- Cross-platform (Windows + macOS + Linux) — same as existing hook bundles.
- PR #221 introduced `ensureDefaultConfig` zero-touch onboarding which auto-creates config on first Stop hook fire. This means F1 fix takes effect for all installed users automatically (no separate "run install" step required).

## 不可改的边界

- DO NOT change `tap-session.ts:tapSession()` API surface (other PRs depend on it).
- DO NOT change `daemonPidFile` location (process-manager.ts asserts it).
- DO NOT touch `runDaemon` / `mainLoop` / queue / uploader / classify logic — F1 is build/install only.
- DO NOT modify `.claude/settings.json` Stop hook entries — already correct, just need binary to exist.

## 引用

- Issue #146 §0.4 row 2: spec says "Stop hook 接线…新建 bin-stop.cjs". Implemented in PR #197 as separate `bin-digital-twin-tap.cjs` (different name but same role).
- Spec §1.3 "唤醒 Daemon" says `spawn(process.execPath, [<path>/bin-uploader.cjs], {detached, stdio:'ignore'}).unref()`. ✓ implemented in tap-session.ts:118-128.
- Spec missing: how `<path>/bin-uploader.cjs` ends up on disk. Plan PR #153 §1.3 just said "PR-3 will provide the binary" but PR-3 (#167) only added source files, no build/install pipeline. **This is the gap F1 closes.**
- user-memory `feedback_judge_harness_md_playbook.md`: judge harness must be MD playbook + dispatched subagents/probes, not a single bash script. judge.md follows that.
