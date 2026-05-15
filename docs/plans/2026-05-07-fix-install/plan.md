```
   ╔══════════════════════════════════════════════════════════╗
   ║         install ≤ 30s · npm 10 tarball quirk fix         ║
   ╠══════════════════════════════════════════════════════════╣
   ║  Default:  npm install -g <tarball>                      ║
   ║      └─ teamagent + 8 transitive deps  ~3s ✅            ║
   ║      └─ postinstall.mjs                                  ║
   ║          ├─ Stage 1 doctor + hook        ~150ms          ║
   ║          ├─ Stage 2 vector-deps-absent   <5ms (skipped)  ║
   ║          └─ Stage 3 update-state          <10ms          ║
   ║                                                          ║
   ║  Opt-in: TEAMAGENT_INCLUDE_OPTIONAL=1 sh -c "..."        ║
   ║      └─ npm install -g <tarball> @xenova onnxruntime     ║
   ║      └─ Stage 2 spawnDetachedWarmup → ~10min background  ║
   ╚══════════════════════════════════════════════════════════╝
```

# plan — fix-install · postinstall + npm install ≤ 30s

## Recap of the failed v1 approach

Original PR aimed for `optionalDependencies` + `--omit=optional`. **Measured directly: npm 10.9.4 ignores the flag for tarball installs**: 51s wall-clock with `--omit=optional`, both `@xenova/transformers` (~30 MB compressed) and `onnxruntime-node` (~30 MB) installed anyway. This is the npm-side root cause; we cannot work around it with flags.

## Working v2 architecture

1. **`packages/teamagent/package.json`** — REMOVE `@xenova/transformers` + `onnxruntime-node` from any deps section. They are not in `dependencies`, not in `optionalDependencies`. Default install pulls only `sqlite-vec`, `tree-sitter-python`, `tree-sitter-typescript`, `web-tree-sitter` (and their small transitives).
2. **`release/install.sh`** — accept `TEAMAGENT_INCLUDE_OPTIONAL=1` env. When set, run `npm install -g "${TARBALL_URL}" "@xenova/transformers@^2.17.0" "onnxruntime-node@1.14.0"` so vector deps land in the same global prefix. When unset (default), run plain `npm install -g "${TARBALL_URL}"` — fits well under 30s.
3. **`postinstall.mjs` & `init.ts`** — bounded `fs.existsSync` check for `<pkgDir>/{node_modules,..}/@xenova/transformers/package.json`. When absent, skip Stage 2 entirely (do NOT write a placeholder state file; that would stick at `status="downloading" pid=0` forever and confuse `bin-pre-tool-use`). When present, run the existing detached-warmup path with the placeholder schema.
4. **Banner** — print the `vector-deps-absent` opt-in hint when the optionals are missing.
5. **Future** — `teamagent install-vector` runtime command is V2; out of scope.

## task description

Done.

- Remove `@xenova/transformers` + `onnxruntime-node` from `packages/teamagent/package.json` (already in `dependencies`/`optionalDependencies` of v1 — fully removed in v2).
- Add `TEAMAGENT_INCLUDE_OPTIONAL=1` branch to `release/install.sh` that explicitly lists vector deps alongside the tarball.
- Add bounded `vectorOptionalsInstalled(pkgDir)` to `postinstall.mjs` and the equivalent inline check in `init.ts` (since `init.ts` also calls `spawnDetachedWarmup`).
- Banner copy.

Not doing:
- `teamagent install-vector` runtime opt-in (V2).
- `release/install.sh` Bash refactor (the `INCLUDE_VECTOR` branch is intentionally minimal).
- Worktree migration `.claude/worktrees/fix-install` → `.codex/worktrees/`.
- Updating other package.json entries for the deleted optionals (`@mozilla/readability`, `jsdom`, `rss-parser`, `sharp` are also confirmed dead — they were optionalDependencies and are removed alongside).

## expected outputs

- `packages/teamagent/package.json` — only 4 dependencies; no optional or peer.
- `release/install.sh` — `INCLUDE_VECTOR` branch with explicit multi-package install.
- `packages/teamagent/postinstall.mjs` — `vectorOptionalsInstalled(pkgDir)` + Stage 2 gating + `vector-deps-absent` banner.
- `packages/cli/src/commands/init.ts` — same detection inlined ahead of the `spawnDetachedWarmup` call.
- `docs/adr/0001-two-stage-install.md` — Status `accepted`, Revised note explaining the npm 10 tarball-flag quirk.
- `docs/plans/2026-05-07-fix-install/{plan,research,report,judge}.md` — trio + judge playbook.
- `scripts/verify-postinstall-detached.sh` — hermetic postinstall harness (stub `dist/bin.js`).
- `scripts/verify-real-install-30s.sh` — end-to-end real install harness (`npm install -g`).
- `pnpm typecheck` green.
- atomic commit.

## how-to-eval-from-3rd-party-harness (judge.md playbook)

`docs/plans/2026-05-07-fix-install/judge.md` is the canonical entry: MAIN agent dispatches `claudefast -p` probes (or subagents) reading raw `.judge/<run_id>/*.json` + evidence files written by the two collector scripts. The probes never see the source or this plan. PASS condition is the AND of:

- default-path Probe A: both `01-skip` and `02-detached` wall-clock ≤ 30s.
- vector-deps-absent Probe B: banner anchor present, no `~/.teamagent/.warmup-state.json` written, opt-in hint present.
- opt-in Probe C (only when `TEAMAGENT_INCLUDE_OPTIONAL=1` rerun): xenova on disk, state file `status="downloading"`, wall-clock noted.

Synthesis lands under `## Judge result <run_id>` in `report.md`.

## measured outcome

```
$ for i in 1 2 3; do bash scripts/verify-real-install-30s.sh ... ; done
run 1: wall=3.32s | added 9 packages | xenova=no onnx=no state=absent
run 2: wall=3.44s | added 9 packages | xenova=no onnx=no state=absent
run 3: wall=2.76s | added 9 packages | xenova=no onnx=no state=absent
```

Median **3.32 s** real install; 9 packages added; vector deps absent; `~/.teamagent/.warmup-state.json` absent; banner shows the opt-in hint. Beats 30s budget by ~10×.
