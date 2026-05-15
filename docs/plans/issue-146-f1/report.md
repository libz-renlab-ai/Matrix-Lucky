```text
   ___
  ( ^>   issue-146-f1 SHIPPED
  \\_<_)
   |  |
~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~

   plan.md  →  research.md  →  implement  →  /review ×2  →  PR #252  →  CI green  →  squash-merge  →  this report
```

# Report: F1 — `bin-uploader.cjs` build + daemon-spawn fix

- **PR**: [#252](https://github.com/libz-renlab-ai/TeamBrain/pull/252) — squash-merged 2026-05-10 (commit `8ffd9cc`)
- **Plan**: [`plan.md`](plan.md)
- **Research**: [`research.md`](research.md)
- **Judge harness**: [`judge.md`](judge.md)

## Actual chain executed

```
research → plan → implement → /review loop (×2 iter) → PR (#252) → CI matrix → squash-merge → report
```

`annotate` step was skipped — change was small enough (4 source files, 1 build-script line) that no `// FIXME(plan-id)` markers were needed; diff hunks map 1:1 to plan items.

## What shipped (single squash commit `8ffd9cc`)

| File | Change |
|---|---|
| `packages/digital-twin/package.json` | Add `src/bin-uploader.ts` to CJS tsup entry list |
| `packages/cli/src/bin-digital-twin-tap.ts` | `resolveDaemonBin` with monorepo `dist/` fallback + atomic self-install (tmp + rename; `EXDEV` → direct copy; all-fail → log to stderr) + JSDoc staleness caveat + install-hook TODO |
| `packages/digital-twin/src/hooks/tap-session.ts` | Comment-only — delegating resolution + self-install to `resolveDaemonBin` |
| `packages/cli/src/__tests__/bin-digital-twin-tap.test.ts` | 5 `resolveDaemonBin` unit tests (user-installed wins / atomic install via tmp+rename / EXDEV fallback / all-fail logs+returns monorepo / both-missing returns null) |
| `packages/digital-twin/src/__tests__/build-config.test.ts` | **NEW** — static regression guard: asserts `package.json:scripts.build` contains both `bin-uploader.ts` and `bin-prod-server.ts`. Catches the exact issue-146 failure class without running an actual build. |
| `docs/plans/issue-146-f1/{plan,research,judge}.md` | Plan + context + harness playbook (already on F1 branch in commit `46c1f83`) |

## Deviations from plan

1. **Self-install location**: plan said add it to `tap-session.ts:tapSession()`; impl moved it into `resolveDaemonBin` in `bin-digital-twin-tap.ts`. Goal met by different means — single resolution site is cleaner; `tap-session.ts` only got a comment update reflecting the delegation.
2. **Judge harness §V2 DUMP / §V3 READ NOT executed**. §V1 RUN evidence is in commits + PR body, not in machine-readable `.judge/issue-146-f1/<run_id>/judge.json`. Acceptable for F1 scope (small, isolated); future F2/F3/F4/F9 PRs in the issue-146 series should run the full harness.
3. **Claudefast probes BEFORE coding skipped**. Same rationale; instead the `/review` loop ran twice (iter-1 caught 3 hardening items, iter-2 caught 1 ESM-import smell) before opening the PR.

## Verification evidence (V1 RUN executed)

| Check | Result |
|---|---|
| `pnpm exec vitest run` (3 affected files) | 14 cli + 11 tap-session + 2 build-config = **27/27 green** |
| `pnpm typecheck` | clean |
| `pnpm --filter @teamagent/digital-twin build` | `dist/bin-uploader.cjs` 38.34 KB |
| `node packages/digital-twin/dist/bin-uploader.cjs` smoke | exit **2**, `config missing or disabled` log, no `MODULE_NOT_FOUND` |
| GitHub Actions `test (ubuntu-latest, 22)` | PASS 1m28s |
| GitHub Actions `test (windows-latest, 22)` | PASS 2m25s |
| GitHub Actions `claude-review` (informational, ADR-0007 not a gate) | PASS 4m33s, no findings |

## `/review` loop summary

2 iterations to PASS. The local `/review` skill is the authoritative POSTPR gate per ADR-0007.

- **iter-1** — adversarial Claude subagent surfaced 1 false-CRITICAL (rejected: `selfDirname` throw is swallowed by `main().catch(() => {})`) + 3 real items: (a) partial-write race on concurrent self-install → atomic `tmp + rename`; (b) bare `catch{}` hiding programming errors → `log` to stderr; (c) no automated guard against the issue-146 failure class → static `build-config.test.ts`.
- **iter-2** — self-audit caught 1 ESM-import smell: test used `require('node:fs').renameSync` with eslint-disable; refactored to `import { renameSync as realRenameSync }`.

## Open follow-ups (out of scope for F1)

- **F2** — envelope schema mismatch — separate PR
- **F3** — recording not attached to daemon — separate PR
- **F9** — zero-touch silent amplification — re-evaluate after F1 + F3 land
- **TODO**: extend `install-hook` to manage `bin-uploader.cjs` upgrades alongside `bin-digital-twin-tap.cjs`. Today, re-installing the daemon binary requires manually deleting `~/.teamagent/digital-twin/bin-uploader.cjs` and letting the next Stop hook re-self-install (documented in `resolveDaemonBin` JSDoc).

## Status

✅ **MERGED** · F1 closed · issue [#146](https://github.com/libz-renlab-ai/TeamBrain/issues/146) **remains open** (F2-F9 outstanding).
