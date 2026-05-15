# Judge Playbook: Rule Registry Aggregator (verify-all-rules)

> Replaces archived script `scripts/verify-all-rules.sh` per project rule
> "third-party judge harness forbidden fixed scripts; MUST use md playbook"
> (`docs/HOWTO-PLAN-PR.md` § 3b).

## Origin

- Replaced script: `docs/legacy/judge-scripts/scripts/verify-all-rules.sh`
- Original purpose: Discover every `docs/*/verify-canned-answer.sh` under the repo and run each one, aggregating PASS/FAIL counts across all rule checks.
- Status: DEPRECATED — the `docs/*/verify-canned-answer.sh` child scripts it orchestrated graded canned answers that were removed from CLAUDE.md at commit d341da8; no child scripts remain under `docs/`.

## §V1 RUN

Commands the MAIN agent dispatches (via subagent or `claudefast -p` probe).
Capture stdout/stderr to `evidence_dir = .judge/<run_id>/`.

- Step 1: `find docs -mindepth 2 -maxdepth 2 -name 'verify-canned-answer.sh' -type f | sort > .judge/<run_id>/discovered-scripts.txt`
- Step 2: Read `.judge/<run_id>/discovered-scripts.txt` to count how many child scripts exist.
- Step 3: If count > 0, for each child script path, record its directory name (rule name) and whether the corresponding canned-answer rule is still present in `CLAUDE.md` — write results to `.judge/<run_id>/rule-status.jsonl`.
- Step 4: Write `.judge/<run_id>/stdout.txt` with summary of discovered scripts and their CLAUDE.md presence.

## §V2 DUMP

Canonical JSON written to `.judge/<run_id>/judge.json`:

```json
{
  "exit_code": 0,
  "metrics": {
    "scripts_discovered": 0,
    "rules_still_in_claude_md": 0,
    "rules_removed_at_d341da8": 14
  },
  "evidence_dir": ".judge/<run_id>",
  "stdout_path": ".judge/<run_id>/stdout.txt",
  "stderr_path": ".judge/<run_id>/stderr.txt",
  "feature_status": "deprecated"
}
```

## §V3 READ

LLM judge prompt (run via `claudefast -p`):

> Read `.judge/<run_id>/judge.json` and supporting evidence in
> `evidence_dir`. Emit verdict `PASS` / `FAIL` / `SKIP`. Criteria:
>
> - PASS if: `scripts_discovered == 0` (confirming all child scripts have been removed alongside their canned answers) AND `feature_status == "deprecated"`.
> - FAIL if: `scripts_discovered > 0` but the corresponding CLAUDE.md rules no longer exist (orphaned scripts).
> - SKIP if: feature has been deleted from the project (e.g.
>   canned answer no longer in CLAUDE.md), or required infrastructure
>   is unavailable in this environment.
>
> NOTE: The canned-answer child scripts this orchestrator depended on were removed at commit d341da8. SKIP is the expected verdict until a replacement rule-verification registry is established.

## Notes

- Original logic summary: The script used `find docs -mindepth 2 -maxdepth 2 -name 'verify-canned-answer.sh'` to discover per-rule verification scripts, then ran each sequentially (or in parallel via `RULE_VERIFY_PARALLEL=1`), capturing per-rule logs in `.fastprobe/run-all/<timestamp>/`, and reported aggregate PASS/FAIL counts. Exit code equaled the failure count.
- Known limitations / dependencies:
  - Requires child `verify-canned-answer.sh` scripts under `docs/*/`; none remain after d341da8.
  - PASS is unreachable in current state — the parent orchestrator has nothing to orchestrate.
  - Replacement: use `docs/rule-verify/INDEX.md` as the new registry entry point once new rule-verify playbooks are established.
