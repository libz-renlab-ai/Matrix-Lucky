```
   minute 0          minute 1            minute 2           minute 3            minute 4-5
 ┌────────────┐   ┌──────────────┐   ┌─────────────┐   ┌──────────────┐   ┌────────────────┐
 │ read TRAPS │──▶│ load stack   │──▶│ pick TASK   │──▶│ run VERIFY   │──▶│ commit + log   │
 │ P0 only    │   │ rules        │   │ template    │   │ harness      │   │ evidence/<id>/ │
 └────────────┘   └──────────────┘   └─────────────┘   └──────────────┘   └────────────────┘
                                                              │
                                                              ▼
                                                     docs/plans/
                                                     scripts--verify--tbrain-verify/
                                                     judge.md
```

# ONBOARDING.md — 5-minute new-agent onboarding

This is the canonical onboarding flow for any new agent (Claude / Codex / Human) joining TeamBrain. If a fresh agent cannot be productive within 5 minutes by following this file alone, the file has failed and must be patched.

Anchor source: `docs/specs/2026-05-01-teambrain-72h-bootstrap.md` §Success Bar #1.

---

## Pre-flight (10 seconds)

You must already be at the repo root:

```bash
test -f docs/teambrain/README.md || { echo "wrong cwd"; exit 1; }
test -f docs/plans/scripts--verify--tbrain-verify/judge.md || { echo "playbook missing"; exit 1; }
```

Both checks must print nothing and exit 0. If either fails, stop — the repo is in an unexpected state.

> **Note (PR #148 sweep):** `scripts/verify/tbrain-verify.sh` is archived at `docs/legacy/judge-scripts/scripts/verify/tbrain-verify.sh`. The active harness is now `docs/plans/scripts--verify--tbrain-verify/judge.md`.

---

## Step 1 — Read P0 traps (≤ 2 min)

```bash
grep -nE '^### TRAP-' docs/teambrain/TRAPS.md | head -20
```

Open `docs/teambrain/TRAPS.md` and skim only the **P0** section. The P0 list is short by design. Ignore P1/P2 on the first pass.

For each P0 you read, note its `wrong_pattern` and `verify_command`. Treat the trap as a contract: if your work matches a `wrong_pattern`, stop.

---

## Step 2 — Load your stack rules (≤ 30 s)

```bash
# Claude Code agents:
cat docs/teambrain/agent_rules/claude.md

# Codex agents:
cat docs/teambrain/agent_rules/codex.md
```

These files are short on purpose. They list the anti-patterns (AP-1..AP-8) that the harness or reviewer will flag. AP-8 (file-path-only judge) and the archive gate (TRAP-OPS-012) are the two most failed in early runs — read those carefully.

---

## Step 3 — Pick a task and fill the template (≤ 1 min)

```bash
cp docs/teambrain/TASK_TEMPLATE.md /tmp/my-task.md
$EDITOR /tmp/my-task.md
```

Fill **every** field. No blanks, no `TBD`. Required fields:

| Field | Source |
|---|---|
| `task_title` | Owner-given title; matches what you’ll write into `judge-summary.json` |
| `run_id` | `YYYYMMDDTHHMMSSZ-<task-slug>` — stable, never replaced by a commit SHA |
| `expected_outputs` | Concrete file/path/command list |
| `verify_recipe_id` | Matches `^VERIFY-[A-Z]+-\d{3}$` (see `VERIFY_TEMPLATE.md`) |

If you cannot fill a field, the task is not yet ready — escalate to the task owner.

---

## Step 4 — Run the harness before declaring done (≤ 1 min)

Dispatch via md playbook:

```
claudefast -p "Follow docs/plans/scripts--verify--tbrain-verify/judge.md with RUN_ID=$(date -u +%Y%m%dT%H%M%SZ)-onboarding-demo RECIPE_ID=VERIFY-OPS-001 task_title='Onboarding demo'"
```

Historical command reference (archived — do not run directly):

```text
RUN_ID="$(date -u +%Y%m%dT%H%M%SZ)-onboarding-demo"
RECIPE_ID="VERIFY-OPS-001"
scripts/verify/tbrain-verify.sh "$RECIPE_ID" "$RUN_ID" --task-title "Onboarding demo"
```

Behaviour you must verify:

- exit `0` only when the **6-file archive gate** passes against `docs/teambrain/evidence/$RUN_ID/`. With no archive, expect exit `2` and `missing_evidence: true` in `.judge/$RUN_ID/judge.json` — that is the correct negative case.
- `.judge/$RUN_ID/judge.json` is written; open it. The `metrics` object must include `archive_present`, `archive_missing`, `canonical_paths_ok`, `anchor_hits`.

Do **not** rely on a verbal "looks good". The harness output is the verdict. The same gating logic is captured by TRAP-OPS-012; check `verify_command` there for jq post-conditions you can re-run.

---

## Step 5 — Build the archive and commit evidence (≤ 1 min)

```bash
ARCHIVE="docs/teambrain/evidence/$RUN_ID"
mkdir -p "$ARCHIVE"

# 1. Required 6 files — each must be non-empty (harness uses -s). Use printf stubs:
printf '# INDEX\nrun_id: %s\ntask_title: Onboarding demo\n' "$RUN_ID" > "$ARCHIVE/INDEX.md"
printf '# Transcript\nOnboarding demo run.\n' > "$ARCHIVE/transcript.md"
printf 'Onboarding demo stdout.\n' > "$ARCHIVE/stdout.txt"
printf 'Onboarding demo stderr (none).\n' > "$ARCHIVE/stderr.txt"
printf '# Failures\nNone — this is an onboarding demo, not a real task.\n' > "$ARCHIVE/failures.md"
printf '{"run_id":"%s","task_title":"Onboarding demo","exit_code":0,"metrics":{},"raw_evidence_dir":".judge/%s","archive_dir":"docs/teambrain/evidence/%s","raw_judge_path":".judge/%s/judge.json","failure_list_path":"docs/teambrain/evidence/%s/failures.md"}\n' \
  "$RUN_ID" "$RUN_ID" "$RUN_ID" "$RUN_ID" "$RUN_ID" > "$ARCHIVE/judge-summary.json"

# 2. Re-run the harness — it must now exit 0 and pass the archive gate:
claudefast -p "Follow docs/plans/scripts--verify--tbrain-verify/judge.md with RUN_ID=$RUN_ID RECIPE_ID=$RECIPE_ID task_title='Onboarding demo'"
test "$?" = 0 || { echo "archive gate failed"; exit 1; }

# 3. Commit (atomic, single-concern — evidence only, not the harness binary):
git add docs/teambrain/evidence/"$RUN_ID"
git commit -m "chore(teambrain): onboarding demo run $RUN_ID"
```

The 6-file layout, the 8 required fields in `judge-summary.json` (incl. `archive_dir`), and the AP-8 file-path-only judge rule are all hard-enforced — see:

- `docs/teambrain/evidence/README.md` — required file table + `judge-summary.json` schema.
- `docs/teambrain/agent_rules/claude.md` AP-8 + `VERIFY-CLAUDE-007`.
- `docs/teambrain/TRAPS.md` TRAP-OPS-012.

A separate LLM judge (not the executing agent) must read only `.judge/$RUN_ID/judge.json` and the linked archive files. Do not paste file contents into the judge prompt — that is the AP-8 violation.

---

## Verification: did onboarding actually work?

```bash
# 1. Recipe and run id format — must both pass.
printf '%s\n' "$RECIPE_ID" | grep -Eq '^VERIFY-[A-Z]+-[0-9]{3}$' || echo FAIL_RECIPE
printf '%s\n' "$RUN_ID"    | grep -Eq '^[0-9]{8}T[0-9]{6}Z-[a-z0-9-]+$' || echo FAIL_RUNID

# 2. All 6 archive files non-empty.
for f in INDEX.md transcript.md stdout.txt stderr.txt failures.md judge-summary.json; do
  test -s "docs/teambrain/evidence/$RUN_ID/$f" || echo "FAIL $f"
done

# 3. Raw judge JSON exists with archive_dir field.
jq -e '.archive_dir == "docs/teambrain/evidence/'"$RUN_ID"'"' \
   ".judge/$RUN_ID/judge.json" >/dev/null || echo FAIL_JUDGE
```

Zero `FAIL` markers = onboarding pass. Otherwise re-do the failed step before claiming done.

---

## Where to go next

- New trap surfaced? Update `docs/teambrain/TRAPS.md` (P0/P1/P2 placement) using `docs/teambrain/TRAP_FORMAT.md`.
- Walkthroughs of two real tasks: `docs/teambrain/USAGE_EXAMPLES.md`.
- File ownership map: `docs/teambrain/STRUCTURE.md`.
- Bootstrap source of truth: `docs/specs/2026-05-01-teambrain-72h-bootstrap.md`.
