```
 ┌──────────────────────────────────────────────────────┐
 │           TeamBrain Canonical Repo Layout            │
 │                                                      │
 │  docs/teambrain/                                     │
 │  ├── README.md       ← entry point / who reads what  │
 │  ├── STRUCTURE.md    ← this file / layout authority  │
 │  ├── TRAPS.md        ← curated trap index            │
 │  ├── TRAP_FORMAT.md  ← schema for each trap record   │
 │  ├── TASK_TEMPLATE.md← template for new task docs    │
 │  ├── VERIFY_TEMPLATE.md← harness verification schema │
 │  ├── CONVERGENCE.md  ← current convergence status    │
 │  ├── convergence/    ← detailed reviewer trail       │
 │  ├── evidence/       ← committed verification archive│
 │  │   └── <run_id>/   ← per-run audit evidence        │
 │  └── agent_rules/                                    │
 │      ├── claude.md   ← rules injected into Claude   │
 │      └── codex.md    ← rules injected into Codex    │
 └──────────────────────────────────────────────────────┘
```

# STRUCTURE.md — TeamBrain Canonical Layout

This file is the single authoritative reference for what lives where in `docs/teambrain/`. Every agent and human reads this before writing to any path. Content schemas are defined elsewhere (see Non-goals).

---

## File-by-file registry

### `README.md`
Written by the readme-writer teammate. Entry point for any new agent or human joining the team; maps the purpose of each file and the flow for finding traps, templates, and rules. Ground-truth verifiable: `grep -q "TRAPS.md" docs/teambrain/README.md` must succeed.

### `STRUCTURE.md` (this file)
Defines the canonical directory layout and per-file ownership. Any agent before creating or moving a file checks this registry. Ground-truth verifiable: `find docs/teambrain -maxdepth 2` must include the registered paths above; it must not assume `ls docs/teambrain/` equals a fixed file-only skeleton, because registered directories such as `evidence/` are canonical too.

### `TRAPS.md`
Written by the traps-curator teammate. Curated index of all known traps with IDs, severity, and one-line summaries. Agents read this first when starting a task to avoid known failure modes. Ground-truth verifiable: each trap entry must have an `id:` field matching `TRAP-\d+` pattern, checkable via `grep -c "^| TRAP-" docs/teambrain/TRAPS.md`.

### `TRAP_FORMAT.md`
Written by the trap-format-author teammate. Defines the schema (fields, required vs optional, example) for a single trap record. Any new trap entry must conform; format violations are caught by the harness. Ground-truth verifiable: schema fields listed in this file are a superset of fields present in every TRAPS.md row.

### `TASK_TEMPLATE.md`
Written by the task-template-author teammate. Canonical template agents copy when creating a new task document. Contains task description, expected outputs, and harness evaluation stubs. Ground-truth verifiable: `grep -q "expected_outputs" docs/teambrain/TASK_TEMPLATE.md` must succeed.

### `VERIFY_TEMPLATE.md`
Written by the verify-template-author teammate. Defines how a third-party judge harness runs, dumps local raw JSON evidence, and archives a PR-auditable summary/index into docs. No verbal review — harness output is the verdict. Ground-truth verifiable: `grep -q "archive_path" docs/teambrain/VERIFY_TEMPLATE.md` must succeed.

### `CONVERGENCE.md`
Written by the Opus reviewer agent during H6-12. Records the current convergence status entry: latest verdict, active blockers, cleanup state, and pointers to the detailed reviewer trail. Agents in later phases read this to know the current quality baseline. Ground-truth verifiable: it links to `docs/teambrain/convergence/` for detailed pass/fail history instead of embedding every per-file review row in the status file itself.

### `convergence/`
Detailed reviewer trail archive for convergence passes, including per-file findings, pass/fail history, cleanup routing, and sign-off evidence. Ground-truth verifiable: any completed convergence review referenced by `CONVERGENCE.md` has a corresponding artifact under `docs/teambrain/convergence/`.

### `evidence/<run_id>/`
Committed audit archive for a verification run. Each run stores its PR-auditable index, judge summary JSON, transcript, stdout/stderr excerpts or checksums, failures list, and pointers to raw local `.judge/<run_id>/` evidence. Ground-truth verifiable: every completed onboarding or real-task claim has a committed `docs/teambrain/evidence/<run_id>/INDEX.md` and `judge-summary.json`; commit-message-only evidence is insufficient.

### `agent_rules/claude.md`
Rules injected directly into Claude Code sessions (via CLAUDE.md import or system prompt). Agents read this to know which rules are active in a Claude session. Ground-truth verifiable: `grep -q "TeamBrain" docs/teambrain/agent_rules/claude.md` must succeed.

### `agent_rules/codex.md`
Rules injected into Codex sessions. Parallel to `claude.md` but for the Codex runtime. Ground-truth verifiable: same structure check as `claude.md`.

---

## Future expansion

When the corpus grows, new paths follow this convention — do not create them until needed:

| Future path | Purpose |
|---|---|
| `docs/teambrain/runbooks/<topic>.md` | Step-by-step operational guides for recurring tasks |
| `docs/teambrain/traps/<TRAP-ID>.md` | Full detail file for a single trap when TRAPS.md entry exceeds 200 lines |
| `docs/teambrain/tasks/<YYYY-MM-DD>-<slug>.md` | Per-task documents instantiated from TASK_TEMPLATE.md |

New directories must be registered here before any agent writes to them.

---

## Non-goals

STRUCTURE.md does NOT define:

- **Content schemas for trap records** — that is TRAP_FORMAT.md's job.
- **What fields a task document must have** — that is TASK_TEMPLATE.md's job.
- **How the judge harness runs or what JSON it emits** — that is VERIFY_TEMPLATE.md's job.
- **Which traps are active or their severity rankings** — that is TRAPS.md's job.
- **Agent rule content or enforcement logic** — that lives in `agent_rules/`.

This file answers only: *what path, who owns it, and how to verify its presence mechanically.*
