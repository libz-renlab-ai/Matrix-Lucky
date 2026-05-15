```
   ┌─────────────────────────────────────────────────────────────────┐
   │  Two real tasks, two real archives. Reproduce them step-for-    │
   │  step before ever claiming you understand TeamBrain.            │
   │                                                                 │
   │  Task #1 — Day 1 H12-24 — owner alignment task   (recipe 001)   │
   │  Task #2 — Day 2 H36-60 — harness self-bootstrap (recipe 002)   │
   └─────────────────────────────────────────────────────────────────┘
```

# USAGE_EXAMPLES.md — two real-task walkthroughs

These are the two tasks that produced the live evidence archives under `docs/teambrain/evidence/`. They are not toy examples; they were the real owner tasks for Day 1 and Day 2 of the bootstrap. Reproducing them is the fastest way to internalise the RUN → DUMP → READ + archive-gate loop.

---

## Walkthrough A — Real Task #1 (Day 1 H12-24)

**Owner task:** Align `run_id` stability + `task_title` field across `docs/teambrain/`.

**Recipe / run id:**

| Field | Value |
|---|---|
| `recipe_id` | `VERIFY-TBRAIN-001` |
| `run_id` | `20260502T000000Z-real-task-1` |
| Archive | [`docs/teambrain/evidence/20260502T000000Z-real-task-1/`](evidence/20260502T000000Z-real-task-1/) |

### A1. Run the harness against the staged change

Dispatch via md playbook (archived script: `docs/legacy/judge-scripts/scripts/verify/tbrain-verify.sh`):

```
claudefast -p "Follow docs/plans/scripts--verify--tbrain-verify/judge.md with RECIPE_ID=VERIFY-TBRAIN-001 RUN_ID=20260502T000000Z-real-task-1 task_title='Align run_id stability + task_title field across docs/teambrain/'"
```

Historical command reference (archived — do not run directly):

```text
scripts/verify/tbrain-verify.sh VERIFY-TBRAIN-001 20260502T000000Z-real-task-1 \
  --task-title "Align run_id stability + task_title field across docs/teambrain/"
```

What you should see:

| Output | Meaning |
|---|---|
| `RESULT ... exit_code=0 anchor_hits=22 canon_ok=12/12 archive_present=6/6` | All gates pass |
| `.judge/20260502T000000Z-real-task-1/judge.json` written | Raw evidence (gitignored) |
| `metrics.canonical_paths_missing == 0` | Owner files all non-empty |
| `metrics.anchor_hits >= 4` (one per anchor file) | Run-id stability invariants survived the edit |

### A2. Build the evidence archive (already on disk for this run)

The committed archive lists exactly the six files mandated by `docs/teambrain/evidence/README.md`:

```bash
ls docs/teambrain/evidence/20260502T000000Z-real-task-1
# INDEX.md  failures.md  judge-summary.json
# stderr.txt stdout.txt   transcript.md
```

Open `INDEX.md` to see the recipe id, owner / reviewer / commit SHAs, and the verdict block. Open `failures.md` to see the 10/10 PASS table and the four GAP-1..GAP-4 framework gaps that Task #1 surfaced for follow-up.

### A3. Read the raw judge JSON

The committed `judge-summary.json` carries the eight required fields enumerated by `evidence/README.md`:

```bash
jq 'keys' docs/teambrain/evidence/20260502T000000Z-real-task-1/judge-summary.json
# [ "archive_dir", "exit_code", "failure_list_path", "metrics",
#   "raw_evidence_dir", "raw_judge_path", "run_id", "task_title" ]
```

The raw `.judge/20260502T000000Z-real-task-1/judge.json` is gitignored on purpose; the committed summary is what reviewers and the LLM judge consult.

### A4. Separate LLM judge — file-path-only (AP-8)

The judge call is captured in `INDEX.md` under "External LLM judge verdict". Verdict was `pass`. The prompt passed **paths only** to the LLM (`judge.json`, `judge-summary.json`, `failures.md`); it did not splice file contents into the prompt. That is the AP-8 right-pattern; spec at `agent_rules/claude.md` AP-8 + `VERIFY-CLAUDE-007`.

### A5. Lessons captured

Real Task #1 exposed four framework gaps. Each one has a closure committed in Day 2:

| GAP | Closure |
|---|---|
| GAP-1 (no harness binary) | `docs/plans/scripts--verify--tbrain-verify/judge.md` (archived: `docs/legacy/judge-scripts/scripts/verify/tbrain-verify.sh`, commit `9230b3c`) |
| GAP-2 (archive gate by convention only) | `TRAP-OPS-012` row in `TRAPS.md` (commit `83c54b6`) |
| GAP-3 (judge prompt splices contents) | `AP-8` + `VERIFY-CLAUDE-007` in `agent_rules/claude.md` (commit `181ac5f`) |
| GAP-4 (`archive_dir` not in schema) | `evidence/README.md` 8-field table (commit `5819ab6`) |

The same mapping is encoded in `TRAPS.md` under "Real Task #1 GAP closure" so future agents do not re-introduce these regressions.

---

## Walkthrough B — Real Task #2 (Day 2 H36-60)

**Owner task:** Run the tbrain-verify harness against Real Task #1 evidence dir; build the self-bootstrap evidence archive (closes GAP-1..GAP-4). The harness is now the md playbook `docs/plans/scripts--verify--tbrain-verify/judge.md` (archived: `docs/legacy/judge-scripts/scripts/verify/tbrain-verify.sh`).

**Recipe / run id:**

| Field | Value |
|---|---|
| `recipe_id` | `VERIFY-TBRAIN-002` |
| `run_id` | `20260502T000000Z-real-task-2` |
| Archive | [`docs/teambrain/evidence/20260502T000000Z-real-task-2/`](evidence/20260502T000000Z-real-task-2/) |

### B1. Positive case — harness against Task #1

```text
# archived: docs/legacy/judge-scripts/scripts/verify/tbrain-verify.sh
# now: claudefast -p "Follow docs/plans/scripts--verify--tbrain-verify/judge.md with RECIPE_ID=VERIFY-TBRAIN-001 RUN_ID=20260502T000000Z-real-task-1"
# expected: exit 0, missing_evidence=false
```

This re-verifies that Task #1 still passes under the new harness binary. Captured to `.judge/20260502T000000Z-real-task-2/task1-verify-stdout.txt`.

### B2. Negative case — harness against Task #2 before its own archive exists

```text
# archived: docs/legacy/judge-scripts/scripts/verify/tbrain-verify.sh
# now: claudefast -p "Follow docs/plans/scripts--verify--tbrain-verify/judge.md with RECIPE_ID=VERIFY-TBRAIN-002 RUN_ID=20260502T000000Z-real-task-2"
# expected: exit 2, archive_missing=6, missing_evidence=true
```

This is the **right** failure. The harness must reject a run whose archive directory is empty. The negative-case stdout is captured to `pre-archive-stdout.txt` so future agents have proof of the gate firing.

### B3. Build the archive — the six required files

```bash
DIR=docs/teambrain/evidence/20260502T000000Z-real-task-2
mkdir -p "$DIR"
# Each file must be non-empty; templates and prior runs are good seed material.
$EDITOR "$DIR"/{INDEX.md,transcript.md,stdout.txt,stderr.txt,failures.md,judge-summary.json}
```

### B4. Positive case — harness against Task #2 after archive built

```text
# archived: docs/legacy/judge-scripts/scripts/verify/tbrain-verify.sh
# now: claudefast -p "Follow docs/plans/scripts--verify--tbrain-verify/judge.md with RECIPE_ID=VERIFY-TBRAIN-002 RUN_ID=20260502T000000Z-real-task-2"
# expected: exit 0, archive_present=6/6, missing_evidence=false
```

The harness now re-verifies Task #2 itself. The bootstrap loop closes.

### B5. The two-attempt judge — a real example of GAP-3 hardening

`INDEX.md` "External LLM judge verdict" preserves both attempts:

- **Attempt 1:** judge conflated the raw `judge.json` schema with the committed `judge-summary.json` schema (different field names) and emitted `fail`.
- **Attempt 2:** prompt was rewritten to disambiguate the two files and pass paths only. Verdict: `pass`.

This is real evidence that the AP-8 (file-path-only) rule is necessary and that prompt clarity matters even when paths are passed correctly. It also shows that a `fail` from the judge is recoverable — re-prompt, do not silently rerun.

### B6. Bootstrap closure verdict

| Check | Result |
|---|---|
| Task #1 carries over after Day 2 patches | 10/10 PASS preserved, 0 new errors |
| Task #2 self-verify (positive) | exit 0, archive 6/6 present |
| Task #2 self-verify (negative, pre-archive) | exit 2, archive 6/6 missing |
| GAP-1..GAP-4 closures committed | `9230b3c`, `83c54b6`, `181ac5f`, `5819ab6` |
| Day 2 evidence archive | committed in `8f0076e` |

---

## Reproducing either walkthrough on your own task

Copy `TASK_TEMPLATE.md`, fill it in for **your** task, then re-run the same five-step pattern: stage edits → run harness → build archive → re-run harness → external LLM judge (file-path mode). The evidence under `evidence/` is the canonical reference for what a passing run looks like; if your output diverges, your task is not done.
