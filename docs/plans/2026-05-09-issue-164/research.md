```text
                            ┌──────────────────────────────────────────┐
                            │  ISSUE-164 RESEARCH — vector-by-default  │
                            │  + shared embedder daemon                │
                            └─────────────────┬────────────────────────┘
                                              │
            ┌─────────────────────────────────┼─────────────────────────────────┐
            │                                 │                                 │
        deps gate                       cold-load cost                     daemon shape
        (ADR-0001)                  (3-4s × every hook)              (HTTP + state file)
            │                                 │                                 │
   pkg.json removes                  PreToolUse / Stop                 SessionStart spawns,
   xenova + onnxruntime             reload model each time             SessionEnd shuts down,
   → users get substring             5 concurrent = 3.3GB OOM           hooks share via 127.0.0.1
            │                                 │                                 │
            └────────────────► one shared in-process embedder ◄─────────────────┘
                                              │
                                  fallback: legacy substring
                                  whenever daemon unreachable
```

# Issue #164 — Research

This file captures the actual context that drives `plan.md`, per AGENTS.md rule 8.
It is **not** a re-statement of the plan; it is the inputs the plan was derived from.

> **Historical**: § 1 below is the locked grill spec verbatim — that part is
> shared between PR #227 (merged) and the bailed parallel branch. § 2 onward
> describes the **bailed branch's** intended file layout (`bin-embedder.ts`
> with `/join` endpoint, separate `embedder-state.ts` / `embedder-client.ts` /
> `bin-embedder.test.ts`). PR #227's actual implementation introduces a
> `daemon-first-embedder.ts` wrapper and uses `/register` instead. The
> Explore-agent codebase map and integration notes here describe the
> pre-implementation main HEAD; on post-#227 main some of the named singletons
> (e.g. `_embedder` in `bin-pre-tool-use.ts`) have already been replaced.

## 1. The locked grill spec (verbatim)

Posted by issue author `libz-renlab-ai` on 2026-05-09T11:05:23Z, ends with `--- end grill ---`,
`grill-ready` label applied. Treated as a v1-locked design contract.

### Scope

**Do**: make semantic matching ship by default = put `@xenova/transformers@^2.17.0`
+ `onnxruntime-node@1.14.0` back into `packages/teamagent/package.json` `dependencies`,
**and** add a long-running embedder daemon that all four hooks share.

**Don't (out of v1 scope)**: quantization / smaller model (v2), HTTP localhost auth
(YAGNI; bind 127.0.0.1 only), model cache cleanup (v2), original issue's Plan B
(first-run prompt) / Plan C (banner) / Plan D (split npm packages).

### Why a daemon (measured benchmarks, see `.fastprobe/` archives)

| Scenario | Cost without daemon |
|---|---|
| Single PreToolUse cold-load | **3-4 s** + 650 MB RSS |
| 5 concurrent hooks | **3.3 GB** RAM peak (8 GB Mac OOMs) |
| Claude Code session (5-30 tool calls) | cumulative **15-120 s** stalls |

Issue-189 fix (`d009d71`) addressed Stop orphan/OOM and 90 s fetch hang, but did
**not** fix per-hook cold-loading. This PR is the root fix.

### Architecture (locked)

```
SessionStart hook
   ├─ read ~/.teamagent/.embedder-state.json
   ├─ if status=running ∧ pid alive → refcount++
   └─ else → spawn detached bin-embedder.cjs

bin-embedder.cjs (long-running daemon)
   ├─ load XenovaRuleEmbedder (once)
   ├─ http.createServer().listen(0)  // random port, 127.0.0.1
   ├─ write port/pid/members to state file
   ├─ POST /embed { text } → { vector }
   └─ POST /shutdown → refcount--, if 0 then exit

PreToolUse / Stop hook
   ├─ read state file → port
   ├─ POST localhost:port/embed (200 ms timeout)
   ├─ ok    → run semanticMatch
   └─ fail  → useLegacy=true + async respawn daemon

SessionEnd hook
   └─ POST localhost:port/shutdown
```

### File map (12 changes)

| File | Action | Note |
|------|--------|------|
| `packages/teamagent/package.json` | edit | `dependencies` += two vector packages |
| `packages/cli/src/bin-embedder.ts` | new | daemon entry; HTTP server; refcount + idle-exit |
| `packages/cli/tsup.hook.config.ts` | edit | new `bin-embedder` entry → `dist/bin-embedder.cjs` |
| `packages/cli/src/embedder-client.ts` | new | fetch wrapper, 200 ms timeout |
| `packages/cli/src/embedder-state.ts` | new | state file schema + atomic R/W (mirrors `warmup-state.ts`) |
| `packages/cli/src/bin-pre-tool-use.ts` | edit | `getEmbedder()` → daemon-first, fallback in-process |
| `packages/cli/src/bin-stop.ts` | edit | same pattern as PreToolUse |
| `packages/cli/src/bin-session-start.ts` | edit | spawn-or-join daemon + refcount++ |
| `packages/cli/src/bin-session-end.ts` | edit | POST `/shutdown` |
| `packages/teamagent/postinstall.mjs` | edit | drop `vectorOptionalsInstalled()` opt-in gate (always true now) |
| `release/install.sh` | edit | drop `TEAMAGENT_INCLUDE_OPTIONAL` user-facing guidance |
| `docs/adr/0001-two-stage-install.md` | edit | reword: 30 s = CLI install; model 5 min in background |

### State file schema — `~/.teamagent/.embedder-state.json`

```json
{
  "status": "starting" | "running" | "failed" | "exiting",
  "pid": 12345,
  "port": 54321,
  "started_at": "2026-05-09T10:00:00.000Z",
  "ready_at": "2026-05-09T10:00:04.123Z",
  "model": "Xenova/multilingual-e5-small",
  "members": [{ "session_id": "abc", "joined_at": "..." }]
}
```

### Failure modes (from grill, locked behavior)

| Failure | Behavior |
|---|---|
| daemon HTTP unreachable | hook → `useLegacy=true`, async respawn daemon (do not block hook response) |
| daemon model-load failed | state `status=failed`, hooks legacy permanently until next SessionStart respawn |
| state file missing | hook → legacy; next SessionStart spawns |
| pid dead, state stale | hook does `process.kill(pid, 0)` liveness, treats as down, respawns |
| concurrent SessionStart spawns | `.embedder.lock` + atomic rename — late spawn reuses early daemon |
| model still downloading (first install, 5 min) | warmup-state.ts ready-gate; status≠ready → legacy |

### Acceptance criteria (10, copied verbatim from grill, also in `judge.md`)

1. `packages/teamagent/package.json` has both vector packages in `dependencies` (NOT `optionalDependencies`).
2. After first SessionStart, `~/.teamagent/.embedder-state.json` shows `status=running`.
3. Multiple PreToolUse calls in the same session **share one daemon pid** (pid stable).
4. After last Claude Code closes, daemon exits within 5 s (state cleaned or `status=exited`).
5. Manual `kill <daemon-pid>` → next hook responds **< 100 ms** (legacy fallback) + async respawn.
6. 5 concurrent hook embeds → total RSS **< 800 MB** (shared daemon).
7. `TEAMAGENT_MATCHER=legacy` still completely bypasses daemon.
8. ADR-0001 30 s install promise still honored (postinstall still detaches model warmup).
9. `pnpm test` all green.
10. **No** Unix socket / named pipe — only HTTP + state file.

### Reuse / don't redo

- ✅ `warmup-state.ts` ready-gate (fallback entry when daemon down)
- ✅ `XenovaRuleEmbedder` (`packages/adapters/src/embedding/xenova-rule-embedder.ts`) — daemon imports and reuses
- ✅ `bin-stop.ts` issue-189 per-cwd lock + 90 s fetch timeout
- ✅ `postinstall.mjs` detached warmup spawn

## 2. Codebase architecture (read by Explore subagent on 2026-05-09)

### Hook surfaces

- `bin-pre-tool-use.ts:53-56` — `_embedder` lazy singleton, `getEmbedder()` accessor.
- `bin-pre-tool-use.ts:108-111` — warmup readiness probe; `!warmup.ready || TEAMAGENT_MATCHER=legacy` → legacy.
- `bin-pre-tool-use.ts:139-260` — semantic path; opens project + global DB in parallel, queries 3 scopes.
- `bin-pre-tool-use.ts:224` — `mergeSemanticAndLegacyMatches()` so unvectorized rules still fire.
- `bin-stop.ts:126-130` — `_stopEmbedder` lazy singleton (separate from PreToolUse instance).
- `bin-stop.ts:267-339` — per-cwd pipeline lock (issue-189), sha1(cwd) keyed, stale detection.
- `bin-stop.ts:738-837` — semantic scan in step 6b (global DB only).
- `bin-stop.ts:132-179` — vectorization catch-up, fire-and-forget, max 15 rules.
- `bin-session-start.ts:1-196` — no embedder code; auto-init decision + detached spawn.
- `bin-session-end.ts:1-146` — detached-only; uses tmp-file JSON + argv[2] for child invocation.

### Atomic-write idiom (mirror in `embedder-state.ts`)

From `warmup-state.ts:52-58`:

```typescript
const tmp = `${filePath}.tmp.${process.pid}.${Date.now()}`;
fs.writeFileSync(tmp, JSON.stringify(state, null, 2), "utf-8");
fs.renameSync(tmp, filePath);
```

### Pid liveness (mirror in `embedder-state.ts`)

From `warmup-state.ts:90-101`:
- `process.kill(pid, 0)` — POSIX signal 0 = exists check.
- `EPERM` → exists, foreign-owned (treat as alive).
- `ESRCH` or anything else → dead.

### XenovaRuleEmbedder public API (`packages/adapters/src/embedding/xenova-rule-embedder.ts`)

- ctor: `new XenovaRuleEmbedder({ modelId?, dim?, progressCallback? })`
- `embed(texts: string[]): Promise<number[][]>`
- `modelId`, `dim` read-only.
- Lazy load; first `embed()` triggers `ensureLoaded()`.
- 90 s fetch timeout; overridable via `TEAMAGENT_EMBEDDER_FETCH_TIMEOUT_MS`.
- ⚠ Modifies `globalThis.fetch` while loading (process-global side effect).
  Daemon owns the process exclusively, so this is fine; concurrent loads inside a single process are still rare.

### tsup entry array (`packages/cli/tsup.hook.config.ts:14-24`)

Add `"bin-embedder": "src/bin-embedder.ts"` to `entry`. `noExternal` already
includes `@xenova/transformers`; `external` already includes `onnxruntime-node`.

### postinstall opt-in gate (`packages/teamagent/postinstall.mjs:24-75`)

`vectorOptionalsInstalled(pkgDir)` checks 3 strategies (sibling, hoisted parent,
createRequire walk). With deps in `dependencies`, this returns `true` always —
the gate becomes dead code. Remove it (or keep as defensive `assert(true)` for
weird hoisting setups; we'll just remove for clarity).

### install.sh (`release/install.sh:324-370`)

Has `TEAMAGENT_INCLUDE_OPTIONAL=1` user-facing message. Once optional gate is
gone, this message is wrong / misleading. Remove.

### ADR-0001 (`docs/adr/0001-two-stage-install.md:1-39`)

Says "5 seconds default install". Reword to "30 s default install (CLI ready);
model 5 min in background (semantic ready when warmup completes)". Behavior is
unchanged — the model has always been a detached background spawn — only the
naming of what's "default" changes.

## 3. Existing tests (will need touch)

In `packages/cli/src/__tests__/`:

- `warmup-state-integration.test.ts`, `warmup-state.test.ts` — pattern for new `embedder-state.test.ts`.
- `bin-stop.test.ts`, `bin-stop-singleton-lock.test.ts`, `bin-stop-race-with-timeout.test.ts` — Stop hook surface; daemon hook-up will need a stub for `getStopEmbedder()`.
- `pre-tool-use-context.test.ts`, `pre-tool-use-merge.test.ts` — PreToolUse semantic path; daemon hook-up needs a stub.
- `session-start-input-shape.test.ts`, `session-start-logic.test.ts`, `session-start-update.test.ts` — SessionStart surface; new daemon spawn-or-join needs a stub.
- `m5-session-hook.test.ts` — M5 session pipeline interaction.
- `warmup.test.ts` — warmup spawn path.

We will add: `embedder-state.test.ts`, `embedder-client.test.ts`, `bin-embedder-daemon.test.ts` (lifecycle).

## 4. Risk register (informs `judge.md`)

| Risk | Mitigation |
|---|---|
| daemon hangs on model load → SessionStart blocks | spawn detached, never await; readiness check is async, hook always falls back to legacy until ready |
| port-rebind race on rapid open/close | bind to port 0 (random), atomic rename of state file ensures readers see consistent view |
| `globalThis.fetch` patch leaks between embedder instances | daemon has one embedder; fine. Tests mock `fetch` per-test. |
| Windows-incompatible `process.kill(pid, 0)` | already used by warmup-state.ts on Windows; mirror that |
| Bundling onnxruntime-node | already external in tsup config; no change needed |
| Test flakes from real HTTP server | tests bind to port 0 + use ephemeral state file paths in tmpdir |

## 5. Out-of-scope reminder

Don't touch — and don't let `/review` push us into touching:

- Quantized model swap (issue #164 v2)
- Auth/rate-limit on local HTTP (YAGNI per grill)
- Model cache eviction (v2)
- Cross-machine daemon sharing (NEVER, security)
- Plan B / C / D from original issue body
