# Judge Playbook: xsync/run-judge

> Replaces archived script `docs/legacy/judge-scripts/docs/features/xsync/run-judge.sh` per rule
> "third-party judge harness forbidden fixed scripts; MUST use md playbook"
> (`docs/HOWTO-PLAN-PR.md` § 3b).

## Origin
- Replaced script: `docs/legacy/judge-scripts/docs/features/xsync/run-judge.sh`
- Original purpose: End-to-end harness that verifies cross-machine git-sync by seeding 5 team-scope rules in a simulated Machine-A, pushing via `teamagent sync push`, pulling into a simulated Machine-B via `teamagent sync pull`, and asserting all 5 rules are present in B with exact metadata (confidence, demerit, reasoning).
- Status: **ACTIVE**

## §V1 RUN
Concrete commands from source:

- Step 1: Initialise evidence directory and bare git remote:
  ```bash
  RUN_ID="$(date -u +%Y%m%dT%H%M%SZ)-$$"
  EVIDENCE_DIR="tmp/.judge/xsync/$RUN_ID"
  mkdir -p "$EVIDENCE_DIR/work"
  git init --bare "$EVIDENCE_DIR/work/remote.git"
  ```

- Step 2: Seed 5 team-scope rules into Machine-A's isolated store via `tsx -e`:
  - IDs: `xsync-rule-01` through `xsync-rule-05`
  - Fields per rule: `confidence`, `demerit`, `reasoning`, `scope.level = "team"`,
    `type = "avoidance"`, `wrong_pattern = "axios"`, `correct_pattern = "fetch"`,
    and full metadata fields (hit_count, tier, etc.).
  - Store path: `$EVIDENCE_DIR/work/machine-a/.teamagent/knowledge.db`
  - Abort if seed count ≠ 5.

- Step 3: Export Machine-A rules to `rules_a.json` for later comparison:
  ```bash
  tsx -e "... store.findByScopeLevel('team') ..." > "$EVIDENCE_DIR/rules_a.json"
  ```

- Step 4: Run `teamagent sync push` from Machine-A:
  ```bash
  HOME="$EVIDENCE_DIR/work/home-a" tsx packages/cli/src/bin.ts sync push \
    --remote "$EVIDENCE_DIR/work/remote.git" \
    --cwd "$EVIDENCE_DIR/work/machine-a" \
    2>&1 | tee "$EVIDENCE_DIR/push.log"
  # Record PUSH_MS elapsed time. Abort on non-zero exit.
  ```

- Step 5: Assert bundle file exists at `machine-a/.teamagent/team-rules.json`.

- Step 6: Run `teamagent sync pull` on Machine-B:
  ```bash
  HOME="$EVIDENCE_DIR/work/home-b" tsx packages/cli/src/bin.ts sync pull \
    --remote "$EVIDENCE_DIR/work/remote.git" \
    --cwd "$EVIDENCE_DIR/work/machine-b" \
    2>&1 | tee "$EVIDENCE_DIR/pull.log"
  # Record PULL_MS elapsed time. Abort on non-zero exit.
  ```

- Step 7: Export Machine-B rules to `rules_b.json` and count:
  ```bash
  tsx -e "... store.findByScopeLevel('team') ..." > "$EVIDENCE_DIR/rules_b.json"
  RULES_B_COUNT=$(python3 -c "import json; print(len(json.load(open('rules_b.json'))))")
  ```

- Step 8: Run Python metadata comparison (confidence ±0.001, demerit ±0.001, reasoning exact):
  ```bash
  python3 compare_metadata.py rules_a.json rules_b.json > "$EVIDENCE_DIR/metadata_compare.txt"
  # MATCH = all 5 rules present in B with matching fields
  ```

- Step 9: Write judge.json with full results and exit 0 (PASS) or 1 (FAIL).

Capture to `evidence_dir = tmp/.judge/xsync/<run_id>/`.

## §V2 DUMP
```json
{
  "exit_code": 0,
  "metrics": {
    "rules_present_in_B": ">= 5",
    "metadata_match": "exact",
    "push_ms": "<measured int>",
    "pull_ms": "<measured int>"
  },
  "evidence_dir": "tmp/.judge/xsync/<run_id>",
  "stdout_path": "tmp/.judge/xsync/<run_id>/stdout.log",
  "push_log": "tmp/.judge/xsync/<run_id>/push.log",
  "pull_log": "tmp/.judge/xsync/<run_id>/pull.log",
  "rules_a_path": "tmp/.judge/xsync/<run_id>/rules_a.json",
  "rules_b_path": "tmp/.judge/xsync/<run_id>/rules_b.json",
  "metadata_compare_path": "tmp/.judge/xsync/<run_id>/metadata_compare.txt",
  "feature_status": "active"
}
```

Document EXACT thresholds from source:
- `rules_b count == 5` (all 5 seeded rules present in Machine-B after pull)
- `metadata_match == true` — for each of the 5 rule IDs:
  - `abs(a.confidence - b.confidence) <= 0.001`
  - `abs(a.demerit - b.demerit) <= 0.001`
  - `a.reasoning == b.reasoning` (exact string match)
- Both `sync push` and `sync pull` must exit 0

## §V3 READ
`claudefast -p`:
> Read judge.json + evidence_dir. PASS / FAIL / SKIP.
>
> PASS criteria:
> - `exit_code == 0`
> - `metrics.rules_present_in_B == 5`
> - `metrics.metadata_match == "exact"` (no mismatches in metadata_compare.txt)
> - Both push and pull logs show non-zero exit code absent
>
> FAIL criteria:
> - `exit_code != 0`
> - Fewer than 5 rules in Machine-B (`rules_b count < 5`)
> - Any rule missing from B or metadata mismatch (confidence/demerit/reasoning)
> - `sync push` or `sync pull` exited non-zero
> - Bundle file `machine-a/.teamagent/team-rules.json` not created
>
> SKIP if infra missing: `tsx` not found; `DualLayerStore` not importable from
> `packages/adapters/src/index.ts`; `packages/cli/src/bin.ts` not present; Python 3
> unavailable. Run `pnpm install` and verify adapters are built before retrying.

## Notes
- Original logic summary: The harness creates three isolated directories (bare remote, machine-a
  workdir + home, machine-b workdir + home) inside the evidence dir. It uses `tsx -e` inline
  scripts to interact directly with `DualLayerStore` (bypassing any CLI) for seeding and reading
  rules, while using the CLI bin (`tsx bin.ts sync push/pull`) for the push/pull steps to test
  the actual command path. Python 3 is used for timing, JSON counting, and metadata comparison.
  The PASS gate requires both rule count and exact metadata match — no partial credit.
- Dependencies:
  - `pnpm install` (provides `tsx`, adapter and CLI packages)
  - `packages/adapters/src/index.ts` — exports `DualLayerStore`
  - `packages/cli/src/bin.ts` — provides `sync push` and `sync pull` subcommands
  - Python 3 (for timing, JSON counting, and metadata comparison)
  - Git (for `git init --bare`)
- The evidence directory root is `tmp/.judge/xsync/` (not `.judge/`), which is distinct from
  other harnesses that use `.judge/` at the repo root.

<self-report>
premature_stopping: false
permission_seeking: false
ownership_dodging: false
simplest_fix: false
reasoning_loop: false
known_limitation: false
skipped_repo_search: false
fabricated_value: false
placeholder_used: false
ambiguity_unresolved: false
contradiction_unresolved: false
silent_fallback: false
</self-report>
