# Judge Playbook: team-sharing-probe / run-judge

> Replaces archived script `docs/legacy/judge-scripts/docs/features/team-sharing-probe/run-judge.sh` per rule
> "third-party judge harness forbidden fixed scripts; MUST use md playbook"
> (`docs/HOWTO-PLAN-PR.md` § 3b).

## Origin
- Replaced script: `docs/legacy/judge-scripts/docs/features/team-sharing-probe/run-judge.sh`
- Original purpose: E2E probe orchestrator for issue #82 team-sharing feature; runs in `--dry-run` (default) or `--real-run` mode, verifying metric thresholds, attribution chain integrity, and sha256 scenario hash match across alice→bob knowledge sync.
- Status: **ACTIVE**

## §V1 RUN

Concrete commands (extracted from source):

The harness supports two modes. **Always start with `--dry-run`** to preview without touching GitHub state. Use `--real-run` only when a human explicitly approves.

- Step 0: Prepare evidence dir at `tmp/.judge/team-sharing-probe/<run_id>/`.
- Step 0.5 (real-run only): Run `gh auth setup-git` to install credential helper for HTTPS remote access.
- Step 1: Verify probe repo exists at `https://github.com/${PROBE_REPO_OWNER}/${PROBE_REPO_NAME}` — abort with instructions if missing (human must create it first). Hard-reset probe repo to clean state (requires explicit human approval before going live; see source comment).
- Step 2: Alice — in isolated `ALICE_DIR` with `HOME=ALICE_HOME`:
  - `teamagent pitfall --non-interactive --trigger=<trigger_phrase> --correct=<...> --reason=<...> --category=K --tags=pr,review,probe --level=personal`
  - `teamagent m5-publish --project-root <alice_dir>`
  - `git push origin main` → capture sha to `alice-sync-commit.sha`
- Step 3: Blind scenario designer — render `docs/features/team-sharing-probe/prompts/scenario-designer.md` with `{{TRIGGER_PHRASE}}` substituted, pipe to `claudefast -p --output-format json`, save as `scenarios.json`; record `sha256` of scenarios file.
- Step 4: Bob — in isolated `BOB_DIR` with `HOME=BOB_HOME`:
  - `git clone <probe_remote_url>`
  - `git pull --no-rebase origin main` (triggers post-merge hook → m5-sync apply)
  - For each `(id, prompt)` in `scenarios.json` (k_set + n_set): run `claudefast -p --output-format stream-json --include-partial-messages --verbose --debug hooks --debug-file <evidence_dir>/teammate-<id>.debug "<prompt>"` → save to `teammate-<id>.jsonl`
- Step 5: Collect — `find BOB_DIR/.teamagent/events -type f -name '*.jsonl'` → `hook-events.jsonl`; `git log --all --format=fuller` → `git-log.txt`.
- Step 6: Judge LLM verdict — render `docs/features/team-sharing-probe/prompts/judge.md` with run metadata substituted; pipe to `claudefast -p --output-format json` → `judge-verdict.json`.
- Step 7: Synthesize — `jq` assembles final `judge.json` with `topology`, `scenarios_sha256`, and embedded `verdict`.
- Step 8: Read `verdict_pass` from `judge-verdict.json`; exit 0 (PASS) or classify failure: exit 2 (sha256 mismatch), exit 3 (attribution chain broken), exit 5 (branch_protection=on but push succeeded), exit 1 (other).

Capture to `evidence_dir = tmp/.judge/team-sharing-probe/<run_id>/`.

Environment variables accepted:
- `BRANCH_PROTECTION` (off|on, default off)
- `PROBE_REPO_OWNER` / `PROBE_REPO_NAME` (default `libz-renlab-ai` / `TeamBrain-team-sharing-probe`)
- `K_COUNT` (default 5) / `N_COUNT` (default 20)
- `CLAUDEFAST_BIN` (default `claudefast`)
- `TRIGGER_PHRASE` (default `PR 合并后必须 fetch codex review 直到 silent`)

## §V2 DUMP

```json
{
  "exit_code": 0,
  "metrics": {
    "run_id": "<run_id>",
    "topology": {
      "transport": "T3a",
      "instance": "C3-hybrid",
      "branch_protection": "off",
      "k_count": 5,
      "n_count": 20,
      "model": "MiniMax-M2.7-highspeed"
    },
    "scenarios_sha256": "<sha256-of-scenarios.json>",
    "verdict": {
      "verdict_pass": true,
      "reason": "all thresholds met",
      "attribution_chain_ok": true,
      "sha256_match": true
    }
  },
  "evidence_dir": "tmp/.judge/team-sharing-probe/<run_id>",
  "stdout_path": "tmp/.judge/team-sharing-probe/<run_id>/stdout.log",
  "stderr_path": "tmp/.judge/team-sharing-probe/<run_id>/stdout.log",
  "feature_status": "active"
}
```

## §V3 READ

`claudefast -p` prompt:
> Read judge.json + evidence_dir. PASS / FAIL / SKIP.
> PASS criteria: `verdict.verdict_pass` is `true` — all metric thresholds met, attribution chain intact, scenarios sha256 matches between designer and judge.
> FAIL criteria:
>   - exit 1: General metric threshold failure.
>   - exit 2: `scenarios_sha256` mismatch (scenarios tampered between design and evaluation).
>   - exit 3: Attribution chain broken (bob's session did not produce expected attribution events linking to alice's knowledge).
>   - exit 5: `branch_protection=on` but git push succeeded (M5 spec violation).
> SKIP if `--dry-run` mode (no real artifacts created), or if probe repo does not exist and real-run was attempted, or if `claudefast` / `gh` / `jq` infra is missing.

## Notes

- Original logic summary: This is a full E2E orchestrator for the team-knowledge-sharing feature (issue #82). It simulates two isolated teammates (alice and bob) using separate HOME directories and separate git clones of a probe repository. Alice records a pitfall and publishes it via `m5-publish`; a blind scenario designer (independent claudefast session) generates K positive + N negative prompts without seeing alice's knowledge; bob clones, triggers a post-merge hook to apply the shared knowledge, then runs all K+N prompts. An independent judge LLM reads all evidence and produces a `judge-verdict.json`. The sha256 guard ensures the scenario set was not modified between design and evaluation. The dry-run mode prints every command without executing, making it safe to preview without spending tokens or modifying GitHub state.
- Dependencies / limitations:
  - Real-run requires: `gh` authenticated, probe repo pre-created by a human, `claudefast`, `jq`, `git`, `pnpm teamagent`.
  - The probe repo hard-reset step is intentionally left as a TODO requiring human approval (not auto-executed).
  - The scenario-designer and judge prompt templates at `docs/features/team-sharing-probe/prompts/` must exist before real-run.
  - `PROBE_REPO_OWNER/PROBE_REPO_NAME` refers to a separate GitHub repo dedicated to this probe — not the main TeamBrain repo.
  - `--real-run` is destructive on the probe repo; use only with explicit approval.

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
