```text
                ┌──────────────────────────────────────────────────────┐
                │  ISSUE-164 PLAN — vector matcher default + daemon    │
                │  4-section per docs/HOWTO-PLAN-PR.md                 │
                └─────────────────┬────────────────────────────────────┘
                                  │
   ┌──────────────────────────────┼──────────────────────────────┐
   │                              │                              │
①  task                       ②  outputs                    ③  how-to-verify
deps + daemon +              12 files + tests +              md playbook
4 hook wires +                state schema +                 (judge.md)
ADR + install.sh             new dist .cjs                   §V1 RUN / V2 DUMP / V3 READ
   │                              │                              │
   └──────────────────────────────┼──────────────────────────────┘
                                  │
                          ④  claudefast probes
                          help / parallel -p ≤ 8 /
                          stream-json audit
```

# Issue #164 — Plan

> **Historical**: this plan describes the **bailed parallel branch's** design —
> endpoint name `/join`, files `bin-embedder.test.ts` /
> `spawnOrJoinEmbedderDaemon()` / `notifyEmbedderShutdown()`, the 11-commit phase
> plan A1–C2. PR #227's actually-merged implementation uses a different layout
> (`/register` endpoint, `daemon-first-embedder.ts` wrapper, no separate
> `bin-embedder.test.ts`). This plan is kept verbatim because it captures the
> shape the locked grill spec was being mapped onto by an independent
> implementer and is useful as a "what other reasonable shapes were
> considered" reference. Do not treat the file map below as accurate
> against main HEAD.

Format: 4-section per `docs/HOWTO-PLAN-PR.md`.
Spec source: locked v1 grill comment in `research.md` § 1.

## ① Task description

### What we are doing

1. Move the vector-matcher dependencies (`@xenova/transformers@^2.17.0`,
   `onnxruntime-node@1.14.0`) from "opt-in via env var" back into
   `packages/teamagent/package.json` `dependencies`, so semantic matching ships
   on by default.
2. Add a long-running **embedder daemon** (`bin-embedder.cjs`) that loads
   the model **once** per session and serves all hook embed requests over
   `http://127.0.0.1:<random-port>`.
3. Wire `bin-pre-tool-use.ts`, `bin-stop.ts` to call the daemon first
   (200 ms timeout) and fall back to in-process embedder + async daemon
   respawn on failure.
4. Wire `bin-session-start.ts` to spawn-or-join the daemon (refcount++).
   Wire `bin-session-end.ts` to POST `/shutdown` (refcount--).
5. Drop `TEAMAGENT_INCLUDE_OPTIONAL` opt-in gate from
   `postinstall.mjs` and remove its mention from `release/install.sh`.
6. Reword `docs/adr/0001-two-stage-install.md` to describe the new shape:
   30 s = CLI installed; model 5 min in background (no behavior change).

### How

Implementation phases (one atomic commit per concept):

| Phase | Commit | Files |
|-------|--------|-------|
| A1 | `feat(issue-164): pin vector deps in package.json` | `packages/teamagent/package.json` |
| A2 | `feat(issue-164): add embedder-state schema + atomic R/W` | `packages/cli/src/embedder-state.ts` (new) + test |
| A3 | `feat(issue-164): add embedder-client (200 ms HTTP)` | `packages/cli/src/embedder-client.ts` (new) + test |
| A4 | `feat(issue-164): add bin-embedder daemon (HTTP + refcount + idle-exit)` | `packages/cli/src/bin-embedder.ts` (new) + test |
| A5 | `feat(issue-164): emit dist/bin-embedder.cjs from tsup` | `packages/cli/tsup.hook.config.ts` |
| B1 | `feat(issue-164): wire PreToolUse to daemon-first` | `packages/cli/src/bin-pre-tool-use.ts` |
| B2 | `feat(issue-164): wire Stop to daemon-first` | `packages/cli/src/bin-stop.ts` |
| B3 | `feat(issue-164): SessionStart spawn-or-join daemon` | `packages/cli/src/bin-session-start.ts` |
| B4 | `feat(issue-164): SessionEnd refcount-shutdown daemon` | `packages/cli/src/bin-session-end.ts` |
| C1 | `feat(issue-164): drop TEAMAGENT_INCLUDE_OPTIONAL gate` | `packages/teamagent/postinstall.mjs`, `release/install.sh` |
| C2 | `docs(issue-164): ADR-0001 reworded for daemon path` | `docs/adr/0001-two-stage-install.md` |

### What we are NOT doing

- Not touching quantization / smaller model (v2 scope).
- Not adding auth/rate-limit to localhost HTTP (YAGNI per locked spec).
- Not adding model cache cleanup (v2 scope).
- Not implementing original issue's Plan B/C/D — locked spec chose the daemon path.
- Not removing `XenovaRuleEmbedder` (`packages/adapters/`) — daemon imports it.
- Not changing `warmup-state.ts` — daemon path is parallel to it.

## ② Expected outputs

Deliverables a reviewer can check off:

- [ ] `packages/teamagent/package.json` `dependencies` contains both vector packages (NOT `optionalDependencies`).
- [ ] 3 new files exist:
  - `packages/cli/src/embedder-state.ts`
  - `packages/cli/src/embedder-client.ts`
  - `packages/cli/src/bin-embedder.ts`
- [ ] 3 new test files exist:
  - `packages/cli/src/__tests__/embedder-state.test.ts`
  - `packages/cli/src/__tests__/embedder-client.test.ts`
  - `packages/cli/src/__tests__/bin-embedder.test.ts`
- [ ] After `pnpm -F @teamagent/cli build`, `packages/cli/dist/bin-embedder.cjs` exists.
- [ ] `bin-pre-tool-use.ts` `getEmbedder()` tries daemon first, falls back to in-process on any failure.
- [ ] `bin-stop.ts` `getStopEmbedder()` tries daemon first, falls back the same way.
- [ ] `bin-session-start.ts` calls `spawnOrJoinEmbedderDaemon()` (or equivalent).
- [ ] `bin-session-end.ts` calls `notifyEmbedderShutdown()` (POSTs `/shutdown`).
- [ ] `~/.teamagent/.embedder-state.json` schema matches the locked spec (status / pid / port / model / members).
- [ ] `postinstall.mjs` no longer references `TEAMAGENT_INCLUDE_OPTIONAL` (the env-var gate path is gone; warmup spawn is unconditional given the deps are now always installed).
- [ ] `release/install.sh` no longer references `TEAMAGENT_INCLUDE_OPTIONAL`.
- [ ] `docs/adr/0001-two-stage-install.md` reworded to reflect 30 s CLI / 5 min model — without changing the actual install behavior (warmup is still detached background spawn).
- [ ] `pnpm test` PASS (all packages).
- [ ] `pnpm typecheck` PASS.
- [ ] `pnpm -F @teamagent/cli build` PASS.

## ③ How-to-verify (md playbook)

Per `docs/HOWTO-PLAN-PR.md` § 3b: judge harness lives in `judge.md`, **not**
a fixed bash script. The MAIN agent dispatches the playbook through subagents
or `claudefast -p` probes. See `docs/plans/2026-05-09-issue-164/judge.md` for
the §V1 RUN / §V2 DUMP / §V3 READ structure.

## ④ Claudefast probes (run BEFORE opening PR)

Per `docs/FASTPROBE.md` and `docs/CLAUDEFAST.md`:

```bash
# P1 — confirm CLI smoke is intact (no daemon involvement)
claudefast -p \
  --output-format stream-json \
  --debug hooks \
  --debug-file .fastprobe/issue-164-help.debug.log \
  --include-partial-messages \
  --verbose \
  --permission-mode acceptEdits \
  "list teamagent commands"

# P2 — confirm legacy fallback works under TEAMAGENT_MATCHER=legacy
TEAMAGENT_MATCHER=legacy claudefast -p \
  --output-format stream-json \
  --debug hooks \
  --debug-file .fastprobe/issue-164-legacy.debug.log \
  --include-partial-messages \
  --verbose \
  --permission-mode acceptEdits \
  "trigger PreToolUse with a fake-database mock"

# P3 — confirm typecheck + tests
pnpm typecheck && pnpm test --filter @teamagent/cli --filter @teamagent/adapters
```

The probes' log/output paths are linked in the PR body. The judge.md playbook
also references them for § V1 RUN.
