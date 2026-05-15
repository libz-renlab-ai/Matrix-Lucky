# Judge Playbook: Issue #85 Install-from-Markdown Feature (verify-issue85-pr1)

> Replaces archived script `scripts/verify-issue85-pr1.sh` per project rule
> "third-party judge harness forbidden fixed scripts; MUST use md playbook"
> (`docs/HOWTO-PLAN-PR.md` § 3b).

## Origin

- Replaced script: `docs/legacy/judge-scripts/scripts/verify-issue85-pr1.sh`
- Original purpose: Five-task third-party judge harness for PR1 of issue #85 (install-from-markdown feature): parser contract tests, happy-path execution, injected-failure narration, agent narration via install-walkthrough skill, and zshrc/bashrc immutability.
- Status: ACTIVE — the install-from-markdown feature and install-walkthrough skill still exist in the project.

## §V1 RUN

Commands the MAIN agent dispatches (via subagent or `claudefast -p` probe).
Capture stdout/stderr to `evidence_dir = .judge/<run_id>/`.

- Step 1 (T1 — parser contract): Dispatch probe: `claudefast -p --output-format stream-json --include-partial-messages --verbose --permission-mode acceptEdits "Run 'pnpm vitest run install-md-parser-contract --reporter=json'. Read the JSON. Return ONLY bare JSON: {pass: bool, total: int, failed: int, missing_fields: string[], schema_fields_validated: string[], evidence: stdout_path}"` — save to `.judge/<run_id>/T1/stdout.log`; extract JSON to `.judge/<run_id>/T1/judge.json`.
- Step 2 (T2 — happy-path execution): Dispatch probe: `claudefast -p ... "In a fresh tmp dir, run 'bash scripts/install-from-md.ts --dry-run INSTALL.md'. Capture exit_code, every step's command, every step's narrated explanation. Return ONLY bare JSON: {exit_code, steps:[{id, command, explanation, exit, stdout_path}], any_raw_stack_trace: bool}"` — save to `.judge/<run_id>/T2/stdout.log`; extract to `.judge/<run_id>/T2/judge.json`.
- Step 3 (T3 — injected-failure fix): Dispatch probe testing that `pnpm` removal triggers a common_errors pattern match with a copy-pasteable fix and no raw stack trace leak — save to `.judge/<run_id>/T3/stdout.log`; extract to `.judge/<run_id>/T3/judge.json`.
- Step 4 (T4 — agent narration): Dispatch probe invoking install-walkthrough skill for steps 1/2/3, asserting each explanation < 200 chars and contains no stack trace — save to `.judge/<run_id>/T4/stdout.log`; extract to `.judge/<run_id>/T4/judge.json`.
- Step 5 (T5 — zshrc/bashrc immutability): Dispatch probe computing sha256 of `~/.zshrc` and `~/.bashrc` before and after running the install script in a tmp HOME — save to `.judge/<run_id>/T5/stdout.log`; extract to `.judge/<run_id>/T5/judge.json`.
- Step 6 (Final judge): Dispatch `claudefast -p` to read all five `T*/judge.json` files and produce a verdict per acceptance gates G1–G5.

## §V2 DUMP

Canonical JSON written to `.judge/<run_id>/judge.json`:

```json
{
  "exit_code": 0,
  "metrics": {
    "T1_pass": true,
    "T2_pass": true,
    "T3_pass": true,
    "T4_pass": true,
    "T5_pass": true,
    "gates_failed": [],
    "missing_evidence": []
  },
  "evidence_dir": ".judge/<run_id>",
  "stdout_path": ".judge/<run_id>/final/stdout.log",
  "stderr_path": ".judge/<run_id>/final/stderr.log",
  "feature_status": "active"
}
```

## §V3 READ

LLM judge prompt (run via `claudefast -p`):

> Read `.judge/<run_id>/judge.json` and supporting evidence in
> `evidence_dir`. Emit verdict `PASS` / `FAIL` / `SKIP`. Criteria:
>
> - PASS if: `T1_pass` through `T5_pass` are all true AND `gates_failed` is empty AND `missing_evidence` is empty. Gate definitions: G1 = parser schema all fields validated + tests pass; G2 = all steps have non-empty explanation and `any_raw_stack_trace=false`; G3 = `pattern_matched=true` and `fix_is_copy_pasteable=true` and `raw_stack_trace_leaked=false`; G4 = every explanation `len<200` and `contains_stack_trace=false`; G5 = `zshrc_changed=false` and `bashrc_changed=false`.
> - FAIL if: any gate is explicitly marked failed in the evidence, or exit_code != 0.
> - SKIP if: feature has been deleted from the project (e.g.
>   canned answer no longer in CLAUDE.md), or required infrastructure
>   is unavailable in this environment.

## Notes

- Original logic summary: A five-probe orchestrator that dispatches `claudefast -p` with `--output-format stream-json` for each of T1–T5, extracts the LLM's JSON response via a Python `json.JSONDecoder.raw_decode` walk, and writes per-task `judge.json`. A final probe reads all T1–T5 JSONs and produces a structured verdict. Gates are evaluated independently; a parse failure in one task is recorded as `missing_evidence`, not as a failure of other gates.
- Known limitations / dependencies:
  - Requires `claudefast` on PATH or via interactive zsh alias.
  - `scripts/install-from-md.ts` and `INSTALL.md` must exist at repo root.
  - `install-walkthrough` skill must be installed under `.claude/skills/install-walkthrough/`.
  - Python 3 required for JSON extraction (no jq dependency).
  - T5 requires running in a tmp HOME to avoid touching the real `~/.zshrc` / `~/.bashrc`.
