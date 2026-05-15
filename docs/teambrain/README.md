```
  ┌──────────────┐     ┌──────────────┐     ┌──────────────┐     ┌──────────────┐
  │  read TRAPS  │────▶│  pick TASK   │────▶│ run VERIFY   │────▶│ commit + log │
  │  (skim P0)   │     │  fill tmpl   │     │  commands    │     │  evidence    │
  └──────────────┘     └──────────────┘     └──────────────┘     └──────────────┘
         ▲                                                                │
         └────────────── patch brain if new trap surfaces ◀──────────────┘
```

# TeamBrain

## What is TeamBrain

TeamBrain is the agent team's shared experience brain. It turns past traps, failed cases, and judgment calls into verifiable rules — rules that a fresh agent can load in 5 minutes and immediately use to avoid repeating history.

It is not a wiki. It is not a style guide. Every rule in it must be checkable with a concrete command that produces pass/fail output. If a rule can only be verified by human review or gut feeling, it does not belong here.

Scope: Markdown, prompts, and scripts only. No UI, no database.

## Who It's For

- **Claude Code agents** — load `agent_rules/claude.md` before starting any task.
- **Codex agents** — load `agent_rules/codex.md` before starting any task.
- **Human teammates** — use TRAPS.md to audit agent output and add new traps after real failures.

## 5-Minute Onboarding Flow

Run these steps in order. Do not skip or re-order.

**Step 1 — Read P0 traps (2 min)**
```
cat docs/teambrain/TRAPS.md
```
Skim entries marked `[P0]`. These are the traps that have caused real task failure. Know them before touching anything.

**Step 2 — Load your stack rules (30 s)**
```
# Claude Code agents:
cat docs/teambrain/agent_rules/claude.md

# Codex agents:
cat docs/teambrain/agent_rules/codex.md
```

**Step 3 — Pick a task and fill the template (1 min)**

Copy `TASK_TEMPLATE.md`, fill every field (task, success criterion, verification command, expected output). No blanks allowed.

**Step 4 — Run verification commands before declaring done (1 min)**

Execute the commands listed in `VERIFY_TEMPLATE.md` for your task type. Match actual output against expected output. Verbal "it looks good" is not verification.

**Step 5 — Atomic commit + log evidence (30 s)**
```
mkdir -p docs/teambrain/evidence/<run_id>
# Fill INDEX.md, judge-summary.json, transcript.md, stdout.txt, stderr.txt, failures.md.
git add <changed files>
git add docs/teambrain/evidence/<run_id>/
git commit -m "feat(<scope>): <what> — verified: <run_id>"
```
Evidence must be committed under `docs/teambrain/evidence/<run_id>/` before the task is declared done. The commit message may reference the run ID and verification result, but it is not the archive. Command output, file paths, exit codes, reviewer hand-off, failures, and raw `.judge/<run_id>/` pointers belong in the committed archive. Commit-message-only evidence = task not done.

## Where to Find What

| File | Purpose |
|------|---------|
| `docs/teambrain/STRUCTURE.md` | Full directory layout and file ownership |
| `docs/teambrain/TRAPS.md` | All known traps, P0 first |
| `docs/teambrain/TRAP_FORMAT.md` | How to write a new trap entry |
| `docs/teambrain/TASK_TEMPLATE.md` | Template to fill before starting any task |
| `docs/teambrain/VERIFY_TEMPLATE.md` | Executable verification commands by task type |
| `docs/teambrain/evidence/<run_id>/` | Committed archive for one verification run |
| `docs/teambrain/agent_rules/` | Stack-specific rule files (claude.md, codex.md) |
| `docs/specs/2026-05-01-teambrain-72h-bootstrap.md` | Bootstrap plan, success bar, anti-patterns |

## Hard Success Criteria

From bootstrap plan §Success Bar — verbatim:

> 1. 一个没读过任何历史的新 agent，按 onboarding flow 5 分钟内能跑通一个 task。
> 2. Task #1 全部失败点都在 `TRAPS.md` 里有对应条目。
> 3. 每条规则都能用 `VERIFY_TEMPLATE.md` 里描述的命令验证，没有「靠人审」的口头规则。
> 4. 没有任何「mock 即通过」的 loophole。

Source: [`docs/specs/2026-05-01-teambrain-72h-bootstrap.md`](../specs/2026-05-01-teambrain-72h-bootstrap.md)

## Anti-Patterns

These are banned. A reviewer agent will flag them.

- Writing "先去读哪些文件" as a plan step — plans describe work, not context-gathering rituals.
- Agent evaluates its own output — reviewer agent + human must evaluate, never the author.
- Using hello-world as a real task — Task #1 and #2 must be real work the owner needs today.
- Skipping the H6–12 reviewer pass before Real Task #1.
- Any "skip if busy" loophole in the onboarding or verification steps.
- Verbal verification ("the code looks correct") — only executable commands count.
