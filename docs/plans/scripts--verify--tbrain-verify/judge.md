# Judge Playbook: TeamBrain RUN→DUMP→READ Harness Binary (verify/tbrain-verify)

> Replaces archived script `scripts/verify/tbrain-verify.sh` per project rule
> "third-party judge harness forbidden fixed scripts; MUST use md playbook"
> (`docs/HOWTO-PLAN-PR.md` § 3b).

## Origin

- Replaced script: `docs/legacy/judge-scripts/scripts/verify/tbrain-verify.sh`
- Original purpose: Generic RUN→DUMP harness binary referenced by `docs/teambrain/VERIFY_TEMPLATE.md` and `docs/teambrain/TRAPS.md`. Validates an archive gate by sweeping anchor regex over `docs/teambrain/{TASK_TEMPLATE,VERIFY_TEMPLATE,agent_rules/claude,evidence/README}.md`, then sweeping canonical paths under `docs/teambrain/`. Inputs `<recipe_id>` (must match `^VERIFY-[A-Z]+-\d{3}$`) and `<run_id>` (must match `^[0-9]{8}T[0-9]{6}Z-[a-z0-9-]+$`).
- Status: **ACTIVE-PARTIAL** — depends on `docs/teambrain/` subtree existing with the expected anchors. May FAIL if anchors moved or paths reorganized; may SKIP if subtree absent.

## §V1 RUN

Commands the MAIN agent dispatches (via subagent or `claudefast -p` probe).
Capture stdout/stderr to `evidence_dir = .judge/<RUN_ID>/`.

Pre-flight: validate `recipe_id` matches `^VERIFY-[A-Z]+-[0-9]{3}$` and `run_id` matches `^[0-9]{8}T[0-9]{6}Z-[a-z0-9-]+$`. Exit 5 if either fails.

- **Step 1 — Anchor sweep**: for each path in
  ```
  docs/teambrain/TASK_TEMPLATE.md
  docs/teambrain/VERIFY_TEMPLATE.md
  docs/teambrain/agent_rules/claude.md
  docs/teambrain/evidence/README.md
  ```
  if file is non-empty, count grep hits matching regex
  `must stay stable for the run|TASK_TITLE|archive_dir|Output JSON with recipe_id|metrics|missing_evidence|Never append or replace it with a commit SHA`
  and append `anchor: <path> hits=<n>` to `evidence_dir/stdout.txt`. Tally `ANCHOR_HITS` and `ANCHOR_FILES_WITH_HITS`. Missing files appended to `evidence_dir/stderr.txt`.
- **Step 2 — Canonical path sweep**: for each path in `docs/teambrain/{README,STRUCTURE,TRAPS,TRAP_FORMAT,...}.md`, assert file exists and is non-empty. Append `canon: <path> bytes=<n>` to `stdout.txt`. Missing or empty paths => exit code 4.
- **Step 3 — Archive gate**: ensure `ARCHIVE_DIR = docs/teambrain/evidence/<RUN_ID>` exists or is creatable; verify expected evidence files were committed.
- **Step 4 — Write evidence summary**: dump `judge.json` with anchor + canonical sweep counts.

## §V2 DUMP

Canonical JSON written to `.judge/<RUN_ID>/judge.json`:

```json
{
  "schema": "tbrain-verify/v1",
  "recipe_id": "<VERIFY-XYZ-NNN>",
  "run_id": "<YYYYMMDDTHHmmssZ-slug>",
  "task_title": "<from --task-title or recipe_id>",
  "exit_code": "0 | 2 | 3 | 4 | 5",
  "evidence_dir": ".judge/<RUN_ID>/",
  "archive_dir": "docs/teambrain/evidence/<RUN_ID>/",
  "stdout_path": "stdout.txt",
  "stderr_path": "stderr.txt",
  "feature_status": "active-partial",
  "metrics": {
    "anchor_paths_checked": "<int>",
    "anchor_paths_with_hits": "<int>",
    "anchor_total_hits": "<int>",
    "canonical_paths_checked": "<int>",
    "canonical_paths_present": "<int>",
    "canonical_paths_missing": ["<path>", ...]
  }
}
```

Exit code semantics (preserved from source):
- `0` — all checks PASS, archive gate satisfied
- `2` — missing_evidence (one or more required files absent or empty)
- `3` — anchor sweep mismatch (key invariants missing in source files)
- `4` — canonical path sweep mismatch (path missing or empty)
- `5` — bad input (recipe_id / run_id format wrong)

## §V3 READ

LLM judge prompt (run via `claudefast -p`):

> Read `.judge/<RUN_ID>/judge.json` and `evidence_dir/{stdout,stderr}.txt`. Do NOT execute tools. Emit verdict:
>
> - **PASS** if `exit_code == 0` AND `anchor_paths_with_hits == anchor_paths_checked` AND `canonical_paths_present == canonical_paths_checked`.
> - **FAIL** if `exit_code in {2, 3, 4}` (cite the missing path or anchor).
> - **SKIP** if `exit_code == 5` (bad input — playbook should not advance) OR `docs/teambrain/` subtree absent in this checkout.

## Notes

- Original logic summary: shell script with strict `set -euo pipefail`, exit-code taxonomy, runs anchor regex sweep + canonical path existence sweep, dumps single JSON, expects an external `claudefast -p` invocation to grade.
- Dependencies: `docs/teambrain/` subtree present with TASK_TEMPLATE.md / VERIFY_TEMPLATE.md / agent_rules/claude.md / evidence/README.md / STRUCTURE.md / TRAPS.md / TRAP_FORMAT.md.
- Limitations: anchor regex is hard-coded to the TeamBrain template wording; if the template wording is paraphrased, anchor hits drop and exit code becomes 3 even though the rule is preserved semantically. The md-playbook rule (this very rule) explicitly forbids paraphrasing the load-bearing wording, so anchor stability is consistent with project policy.
