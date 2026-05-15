# Judge Playbook: issue #104 statusLine V1–V5 (judge-issue104-statusline)

> Replaces archived script `scripts/judge-issue104-statusline.sh` per project rule
> "third-party judge harness forbidden fixed scripts; MUST use md playbook"
> (`docs/HOWTO-PLAN-PR.md` § 3b).

## Origin

- Replaced script: `docs/legacy/judge-scripts/scripts/judge-issue104-statusline.sh`
- Original purpose: Third-party judge harness for issue #104 (statusLine 共存) — invokes `installHook` / `uninstallHook` from `packages/cli/src/commands/install-hook.ts` directly via a generated `driver.mjs` in an isolated tmp HOME + tmp repo, asserts V1–V5 invariants, dumps `.judge/issue104-<run_id>/judge.json`.
- Status: **ACTIVE-PARTIAL** — V1–V4 still testable (installHook/uninstallHook code path exists); V5 anchor regression check originally probed `claudefast -p "what project tools we have?"` for FASTPROBE/POSTPR/TEAMWORK anchors, which were removed from CLAUDE.md at commit `d341da8`. V5 should now SKIP.

## §V1 RUN

Commands the MAIN agent dispatches (via subagent or `claudefast -p` probe).
Capture stdout/stderr to `evidence_dir = .judge/issue104-<run_id>/`.

- Step 1 (driver setup): generate `driver.mjs` under `evidence_dir` that imports `installHook` / `uninstallHook` from `packages/cli/src/commands/install-hook.ts` via `pathToFileURL`.
- Step 2 (V1/V2/V4 sandbox): create tmp `homeDir` with user-level `~/.claude/settings.json` containing literal `{"statusLine":{"type":"command","command":"echo USER_OWN_STATUSLINE_TOKEN"}}`; create tmp `repoCwd` with empty `.claude/`; call `installHook({cwd: repoCwd, hookEntry: fakeBundle, statusLineEntry: fakeBundle, homeDir})`.
- Step 3 (V3 sandbox): separate tmp `homeDirV3` + `repoCwdV3` both empty; call `installHook` again.
- Step 4 (V4 uninstall): `uninstallHook({cwd: repoCwd})` against the V1/V2 sandbox; read post-uninstall settings.
- Step 5 (V5 anchor — SKIP): originally `claudefast -p "what project tools we have?"` and grep for FASTPROBE/POSTPR/TEAMWORK; **mark SKIP** with reason `canned-answer anchors removed from CLAUDE.md at commit d341da8`.
- Step 6 (snapshot evidence): write `user-after-install.json`, `project-after-install.json`, `user-after-uninstall.json`, `project-after-uninstall.json`, `v3-project.json` under `evidence_dir`.

Run via `tsx packages/cli/src/commands/install-hook.ts` import (no actual `pnpm teamagent` CLI invocation, to keep hermetic).

## §V2 DUMP

Canonical JSON written to `.judge/issue104-<run_id>/judge.json`:

```json
{
  "schema": "issue104-statusline/v1",
  "run_id": "<run_id>",
  "exit_code": 0,
  "evidence_dir": ".judge/issue104-<run_id>/",
  "stdout_path": "stdout.json",
  "stderr_path": "stderr.log",
  "feature_status": "active-partial",
  "metrics": {
    "install_result": { ... },
    "uninstall_result": { ... },
    "v3_install_result": { ... }
  },
  "v1": { "pass": "<bool>", "reason": "user-level command preserved", "evidence": "user-after-install.json", "observed_command": "<string>" },
  "v2": { "pass": "<bool>", "reason": "project-level command chains user_cmd + echo + teamagent", "evidence": "project-after-install.json", "observed_command": "<string>" },
  "v3": { "pass": "<bool>", "reason": "no user statusLine -> teamagent registers cleanly without backup", "evidence": "v3-project.json", "observed_command": "<string>" },
  "v4": { "pass": "<bool>", "reason": "after uninstall: user equals literal AND project cleared", "evidence": "user-after-uninstall.json + project-after-uninstall.json" },
  "v5": { "pass": "skip", "reason": "canned-answer anchors removed at commit d341da8", "evidence": "(out-of-band)" }
}
```

## §V3 READ

LLM judge prompt (run via `claudefast -p`):

> Read `.judge/issue104-<run_id>/judge.json` and supporting evidence in `evidence_dir`. Emit verdict `PASS` / `FAIL` / `SKIP`. Criteria:
>
> - **PASS** if V1.pass + V2.pass + V3.pass + V4.pass all true AND V5.pass = "skip" (V5 unreachable post-d341da8 is acceptable).
> - **FAIL** if any of V1–V4 is false.
> - **SKIP** if `evidence_dir` missing or `tsx` unavailable in workspace.

## Notes

- Original logic summary: builds `driver.mjs` inline with `cat > "$DRIVER" <<'MJS' ... MJS`; runs it via `node_modules/.bin/tsx`; the driver constructs sandbox dirs, calls `installHook`/`uninstallHook` directly (no CLI), grabs settings before/after, and writes `judge.json` with v1..v5 verdicts.
- Dependencies: `node_modules/.bin/tsx` present (i.e. `pnpm install` complete); write access to `os.tmpdir()`.
- Limitations: V5 is unreachable post-d341da8 — playbook explicitly downgrades V5 to SKIP rather than FAIL.
