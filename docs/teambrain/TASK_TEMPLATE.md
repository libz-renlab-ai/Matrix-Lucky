# TASK_TEMPLATE.md

`owner task -> filled record -> VERIFY command -> required evidence archive -> reviewer verdict -> DONE`

Reject: no owner task, blank/N/A field, verbal completion, missing raw `.judge/<run_id>/judge.json`, or missing any required docs archive file.

---

## When to use

Use this template for any real TeamBrain task that needs reviewer-verifiable evidence. Do not use it for scratch exploration, hello-world demos, or speculative tasks.

Every issued task MUST fill all required sections. A reviewer rejects blank sections, `N/A`, vague scope, and success criteria that rely on "looks good".

---

## Day 1 H12-24 Real Task #1 placeholder

Real Task #1 is **not completed** until an owner provides a concrete task and the assigned agent archives real evidence.

Before owner assignment, only this placeholder status is allowed:

```yaml
phase: "Day 1 H12-24 Real Task #1"
status: "WAITING_FOR_OWNER_TASK"
owner_task: null
completion_allowed: false
reason: "No owner-provided real task, transcript, command evidence, failure list, or judge JSON summary exists yet."
```

Forbidden status before owner assignment:

```yaml
status: "COMPLETED"
```

The owner assignment MUST name:

- owner or owner role
- real task title
- durable context link
- scope in/out
- required archive under `docs/teambrain/evidence/<run_id>/` and raw evidence under `.judge/<run_id>/`
- reviewer role and deadline

---

## Required task record

Copy this block into the task issue, PR, or task doc and fill every field.

```yaml
title: ""
owner: ""
assignee: ""
reviewer: ""
review_deadline: "YYYY-MM-DD HH:MM TZ"

context_links:
  - ""

scope_in:
  - ""

scope_out:
  - ""

expected_outputs:
  files:
    - ""
  commit_message: "feat(teambrain): <imperative sentence>"
  evidence_dir: "docs/teambrain/evidence/<run_id>/"

success_criteria:
  verify_recipe_id: "VERIFY-XXX-000"
  command: ""
  expected_output: ""
  judge_json_check: ""
  missing_evidence_policy: "fail if any required raw/archive file is missing or empty"

evidence_checklist:
  index: "docs/teambrain/evidence/<run_id>/INDEX.md"
  transcript: "docs/teambrain/evidence/<run_id>/transcript.md"
  command_stdout: "docs/teambrain/evidence/<run_id>/stdout.txt"
  command_stderr: "docs/teambrain/evidence/<run_id>/stderr.txt"
  failure_list: "docs/teambrain/evidence/<run_id>/failures.md"
  raw_judge_json: ".judge/<run_id>/judge.json"
  judge_summary_json: "docs/teambrain/evidence/<run_id>/judge-summary.json"

anti_mock_checklist:
  no_skipped_tests: false
  no_test_later_todos: false
  sut_not_replaced_by_mock: false
  no_new_coverage_ignores_without_ticket: false
  coverage_or_equivalent_metric_not_lower: false

trap_awareness:
  reviewed_traps_md: false
  applicable_traps:
    - ""

handoff:
  pr_or_commit: ""
  evidence_dir: "docs/teambrain/evidence/<run_id>/"
  reviewer_needs:
    - ""
```

---

## Field rules

### 1. Title

Use one imperative sentence naming the deliverable. Bad: "work on verifier". Good: "Add a judge JSON summary field to `docs/teambrain/evidence/<run_id>/judge-summary.json`."

### 2. Context links

Use durable links only: GitHub issue/PR URL, committed spec line, or committed dump line. "See Slack" and "we discussed verbally" are rejected.

### 3. Scope IN

List exact file paths or precise modules the assignee may edit. Globs are allowed only when unambiguous.

### 4. Scope OUT

List concrete non-goals and forbidden paths. Any diff outside Scope IN or inside Scope OUT is an automatic rejection unless owner updates the task first.

### 5. Expected outputs

Name exact output files, commit message convention, and evidence directory. Directories alone are insufficient; list the files expected inside them.

### 6. Success criteria

Provide a `VERIFY_TEMPLATE.md` recipe ID or a real shell command with exact expected output. The command must fail on missing raw/archive evidence. "CI green", "tests pass", and "looks good" are not success criteria.

### 7. Evidence checklist

Archive raw harness output under `.judge/<run_id>/` and committed audit evidence under `docs/teambrain/evidence/<run_id>/`. Missing or empty files in this contract are `missing_evidence` and block DONE:

```text
INDEX.md            archive index and raw evidence pointer
transcript.md       task assignment and execution transcript
stdout.txt          command stdout excerpt or checksum + raw path
stderr.txt          command stderr excerpt or checksum + raw path
failures.md         observed failures, or "No failures observed" with evidence
judge-summary.json  JSON summary derived from .judge/<run_id>/judge.json
```

Raw required file: `.judge/<run_id>/judge.json`.

`run_id` must stay stable for the run: use ISO timestamp plus short slug, and never append or replace it with a commit SHA. Record commit SHA only in `docs/teambrain/evidence/<run_id>/INDEX.md`.

### 8. Anti-mock checklist

The assignee must confirm no skipped tests, no "test later" TODOs, no mocks replacing the SUT itself, no new coverage ignores without ticket, and no coverage/equivalent metric regression.

### 9. Trap-awareness checklist

The assignee must read `docs/teambrain/TRAPS.md` and list applicable trap IDs. If none apply, write: "Reviewed TRAPS.md; no applicable traps for this task scope."

### 10. Reviewer hand-off

Name the reviewer role, deadline, PR/commit, evidence directory, and what the reviewer must inspect. A task is not done until reviewer evidence review passes.

---

## Common loopholes

Reject these patterns before assignment:

1. Vague scope such as "clean up docs" without exact files.
2. Context stored only in Slack, chat, or memory.
3. Success criteria with no executable command or recipe ID.
4. Raw `.judge/<run_id>/judge.json` or any required archive file missing.
5. Failure list omitted because "nothing failed".
6. Agent marks Day 1 H12-24 completed before owner assigns a real task.
7. Judge summary written without raw `.judge/<run_id>/judge.json`.
