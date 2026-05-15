```text
              ┌─────────────────────────────────────────────────────────┐
              │  ISSUE-164 JUDGE HARNESS — md playbook (NOT bash)       │
              │  V1 RUN  →  V2 DUMP  →  V3 READ                         │
              └─────────────────────────┬───────────────────────────────┘
                                        │
       MAIN agent dispatches sections; subagents / claudefast -p run them;
       LLM-judge reads only raw V2 JSON + V1 evidence; nothing else.
```

# Issue #164 — Third-party judge harness

Per `~/.claude/CLAUDE.md` testing-judge-harness rule and
`docs/HOWTO-PLAN-PR.md` § 3b. **Hard rule**: the harness is an MD playbook.
There is no fixed `scripts/*.sh` here. The MAIN agent dispatches each `§V<n>`
section to a subagent or to `claudefast -p`; failures rerun a section.

> **Re-mapping note (post-PR #227)**: the 10 acceptance criteria were derived
> from the locked grill spec, **not** from any specific implementation. They
> apply to PR #227's merged design (which uses `daemon-first-embedder.ts`
> wrapper + `/register` endpoint) just as well as to the bailed parallel
> branch (which used inline-proxy + `/join`). When using this playbook
> against PR #227's merged code, expect the §V1 evidence-mapping for
> criteria 4–6 (5 s graceful exit / kill→<100 ms fallback / 5-concurrent
> RSS<800 MB) to need adaptation — they were never run against the merged
> code, only against the bailed branch's tests. The grep-based criteria
> (1, 7, 10) and the static-shape ones (2, 3, 8, 9) carry over unchanged.

## §V1 RUN — fixed tool set

Each tool runs once. Output goes to `.judge/issue-164/<tool>.{stdout,stderr,exit}`.
None of the V1 commands are interactive.

| Step | Tool | Command | Evidence target |
|------|------|---------|-----------------|
| V1.1 | typecheck | `pnpm typecheck` | `.judge/issue-164/typecheck.{stdout,exit}` |
| V1.2 | test (cli) | `pnpm -F @teamagent/cli test --run` | `.judge/issue-164/test-cli.{stdout,exit}` |
| V1.3 | test (adapters) | `pnpm -F @teamagent/adapters test --run` | `.judge/issue-164/test-adapters.{stdout,exit}` |
| V1.4 | test (core) | `pnpm -F @teamagent/core test --run` | `.judge/issue-164/test-core.{stdout,exit}` |
| V1.5 | bundle | `pnpm -F @teamagent/cli build` | `.judge/issue-164/build.{stdout,exit}` |
| V1.6 | dist artifact | `ls -la packages/cli/dist/bin-embedder.cjs` | `.judge/issue-164/dist-artifact.{stdout,exit}` |
| V1.7 | deps shape | `node -e 'const p=require("./packages/teamagent/package.json"); console.log(JSON.stringify({deps:Object.keys(p.dependencies||{}).filter(k=>k==="@xenova/transformers"||k==="onnxruntime-node"), opt:Object.keys(p.optionalDependencies||{})},null,2))'` | `.judge/issue-164/deps.{stdout,exit}` |
| V1.8 | grep clean | `grep -RIn "TEAMAGENT_INCLUDE_OPTIONAL" packages/teamagent release docs \|\| true` | `.judge/issue-164/legacy-grep.{stdout,exit}` |
| V1.9 | hook smoke | `claudefast -p --output-format stream-json --debug hooks --debug-file .fastprobe/issue-164-help.debug.log --include-partial-messages --verbose --permission-mode acceptEdits "list teamagent commands"` | `.judge/issue-164/hook-smoke.{stdout,exit}` + `.fastprobe/issue-164-help.debug.log` |
| V1.10 | legacy bypass | `TEAMAGENT_MATCHER=legacy claudefast -p --output-format stream-json --debug hooks --debug-file .fastprobe/issue-164-legacy.debug.log --include-partial-messages --verbose --permission-mode acceptEdits "fake database mock"` | `.judge/issue-164/legacy-bypass.{stdout,exit}` + `.fastprobe/issue-164-legacy.debug.log` |

## §V2 DUMP — emit a single judge.json + evidence dir

After §V1 finishes, write `.judge/issue-164/judge.json` with this shape (the
LLM-judge reads only this + §V1 evidence files, nothing else):

```json
{
  "run_id": "issue-164-<unix-ts>",
  "started_at": "<iso>",
  "finished_at": "<iso>",
  "evidence_dir": ".judge/issue-164/",
  "tools": {
    "typecheck":     { "exit_code": 0, "stdout_path": ".judge/issue-164/typecheck.stdout" },
    "test-cli":      { "exit_code": 0, "stdout_path": ".judge/issue-164/test-cli.stdout" },
    "test-adapters": { "exit_code": 0, "stdout_path": ".judge/issue-164/test-adapters.stdout" },
    "test-core":     { "exit_code": 0, "stdout_path": ".judge/issue-164/test-core.stdout" },
    "build":         { "exit_code": 0, "stdout_path": ".judge/issue-164/build.stdout" },
    "dist-artifact": { "exit_code": 0, "stdout_path": ".judge/issue-164/dist-artifact.stdout" },
    "deps":          { "exit_code": 0, "stdout_path": ".judge/issue-164/deps.stdout" },
    "legacy-grep":   { "exit_code": 0, "stdout_path": ".judge/issue-164/legacy-grep.stdout" },
    "hook-smoke":    { "exit_code": 0, "stdout_path": ".judge/issue-164/hook-smoke.stdout" },
    "legacy-bypass": { "exit_code": 0, "stdout_path": ".judge/issue-164/legacy-bypass.stdout" }
  },
  "metrics": {
    "files_changed": 12,
    "lines_added": "<int>",
    "lines_deleted": "<int>",
    "new_test_files": 3,
    "package_json_deps_has_xenova": true,
    "package_json_deps_has_onnxruntime": true,
    "package_json_optional_has_xenova": false,
    "package_json_optional_has_onnxruntime": false,
    "dist_bin_embedder_cjs_exists": true,
    "TEAMAGENT_INCLUDE_OPTIONAL_refs": 0
  }
}
```

`metrics` MUST be derived from the §V1 stdout, not from heuristic guesses.
For booleans, derive directly from V1.7 (`deps.stdout`) and V1.8
(`legacy-grep.stdout`).

## §V3 READ — LLM-judge reads only V2 JSON + V1 evidence

The LLM-judge dispatched at this step has only these inputs:

1. `.judge/issue-164/judge.json` (V2 output above)
2. The 10 stdout/exit files in `.judge/issue-164/*.{stdout,exit}` (V1 evidence)
3. The 10 acceptance criteria from `research.md` § 1.

The LLM-judge **must not** read `plan.md`, the source diff, or anything outside
`.judge/issue-164/` and the 10 acceptance criteria. This is what makes it a
*third-party* judge.

### Verdict rubric (10 criteria)

| # | Criterion | Bound to |
|---|-----------|----------|
| 1 | `package.json` deps has both packages, optional has neither | V2.metrics.package_json_*  |
| 2 | After SessionStart, state file shows `status=running` | V1.9 stdout `state.json` line |
| 3 | Multiple PreToolUse calls share one daemon pid | V1.9 stdout pid stability |
| 4 | After last Claude Code closes, daemon exits within 5 s | V1.9 stdout daemon-exit-elapsed line |
| 5 | Manual `kill <daemon-pid>` → next hook < 100 ms | V1.9 stdout fallback-elapsed line |
| 6 | 5 concurrent hook embeds → total RSS < 800 MB | V1.9 stdout concurrent-rss line |
| 7 | `TEAMAGENT_MATCHER=legacy` bypasses daemon | V1.10 stdout (no daemon spawn marker) |
| 8 | ADR-0001 30 s install promise honored | V1.5 build time + V1.9 cold-CLI elapsed |
| 9 | `pnpm test` all green | V1.2 + V1.3 + V1.4 exit_code == 0 |
| 10 | No Unix socket / named pipe code | V1.8 grep alternative scan (e.g., `net.createServer.*\\.sock`) |

If any criterion fails, the judge writes `verdict: "FAIL"` with the failing
criteria index and the offending evidence file path. Otherwise `verdict: "PASS"`.

## Rerun

If §V1 step `<n>` fails, MAIN agent reruns just that step (e.g., re-dispatch
`§V1.5`). Do not edit fixed bash. Do not "patch" `judge.json` — recompute it.
