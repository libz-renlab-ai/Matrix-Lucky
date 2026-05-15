```
first pass -> 6 P0 + 7 P1 + 3 P2 -> cleanup queue
```

# Convergence First-Pass Findings

Historical detail moved from `docs/teambrain/CONVERGENCE.md`. This file records the first Opus reviewer audit of the 8 atomic skeleton commits from H2-6.

---

## Verdict

**`CLEANUP-REQUIRED`**

P0 count: **6**. The central blocker was schema drift between `TRAPS.md`, `TRAP_FORMAT.md`, and task / agent-rule examples. A linter built from `TRAP_FORMAT.md` would reject current trap entries and cross-references, so Real Task #1 could not safely start before cleanup.

## P0 findings

| ID | File(s) | Problem | Required cleanup | Owner |
|----|---------|---------|------------------|-------|
| F-P0-1 | `TRAPS.md` | P0 deep-dives used hyphenated / spaced labels such as `wrong-pattern`, `right-pattern`, `evidence link`, `verify hint`; spec requires underscored fields. | Rename P0 labels to `wrong_pattern`, `right_pattern`, `verify_command`, `evidence_link`. | traps-curator |
| F-P0-2 | `TRAPS.md` | P1/P2 table had 5 columns; spec mandates 7 columns including `verify_command` and `evidence_link`. | Re-emit table as `id | category | severity | wrong_pattern | right_pattern | verify_command | evidence_link`. | traps-curator |
| F-P0-3 | `TRAPS.md`, `TRAP_FORMAT.md` | `category: testing` and `TRAP-TEST-*` violated enum `{git, review, ops, coop, security, docs}`. | Remap to an allowed category or extend the enum and id-prefix mapping. | trap-format-author + traps-curator |
| F-P0-4 | `TASK_TEMPLATE.md` | Success criteria example used invalid recipe id `VERIFY#unit-pass-coverage-80`; regex requires `^VERIFY-[A-Z]+-\d{3}$`. | Replace with regex-conformant id such as `VERIFY-PNPM-001`. | task-template-author |
| F-P0-5 | `TASK_TEMPLATE.md` | Trap-awareness examples used `TRAP#<slug>` instead of `TRAP-<CAT>-<NNN>`. | Replace slug references with concrete trap ids or create missing trap ids. | task-template-author |
| F-P0-6 | `agent_rules/claude.md`, `agent_rules/codex.md` | Two commit anchor formats: `TRAPS-READ:` vs `traps-read:`; verifier only matched one. | Pick one canonical anchor and update both files plus verifier grep. | claude-rules-author + codex-rules-author |

## P1 findings

| ID | File(s) | Problem | Required cleanup | Owner |
|----|---------|---------|------------------|-------|
| F-P1-1 | `TRAPS.md` | `TRAP-TEST-002` verify hint fell back to reviewer sign-off. | Replace verbal fallback with numeric gate. | traps-curator |
| F-P1-2 | `TRAPS.md` | `TRAP-OPS-001` verify hint returned lines but had no exit-code assertion. | Add positive assertions for rollout percentages and rollback job. | traps-curator |
| F-P1-3 | `TRAPS.md` | `TRAP-COOP-001` age check used `ls -lt` and did not assert the 24h window. | Use a portable age gate such as `find -mtime -1`, with portability note. | traps-curator |
| F-P1-4 | `TRAPS.md` | `TRAP-TEST-001` grep was TS / `src/` scoped, but TeamBrain is Markdown, prompts, and scripts. | Scope to `docs/` or mark the check repo-conditional. | traps-curator |
| F-P1-5 | `STRUCTURE.md` | Listed 8 writer files plus reviewer-owned `CONVERGENCE.md`. | No-op confirm after `CONVERGENCE.md` commit. | skeleton-architect |
| F-P1-6 | `TASK_TEMPLATE.md` | Example used host-project `feat(m1):` milestone scope while TeamBrain uses `feat(teambrain):`. | Replace examples or explicitly separate host scope from bootstrap scope. | task-template-author |
| F-P1-7 | `agent_rules/claude.md`, `agent_rules/codex.md` | Agent flow mentioned `TASK` but not `TASK_TEMPLATE.md` by path. | Add instruction to open `TASK_TEMPLATE.md` before any code change. | claude-rules-author + codex-rules-author |

## P2 notes

| ID | Note |
|----|------|
| F-P2-1 | `TRAP_FORMAT.md` anti-pattern example reused real id `TRAP-OPS-001`. |
| F-P2-2 | `README.md` "Where to Find What" table omitted `CONVERGENCE.md`. |
| F-P2-3 | `claude.md` and `codex.md` differed on `--force-with-lease` allowed scope. |

## Cross-file checks A-J

| Check | Verdict | Notes |
|-------|---------|-------|
| A | FAIL | `TRAPS.md` did not use `TRAP_FORMAT` schema. |
| B | FAIL | `TASK_TEMPLATE` example used invalid `VERIFY#...` form. |
| C | PASS | `TRAP_FORMAT` allowed `VERIFY_TEMPLATE:<recipe_id>`. |
| D | PARTIAL | Agent rules named TRAPS and VERIFY but not `TASK_TEMPLATE.md` by path. |
| E | PASS | `STRUCTURE.md` listed all writer files plus reviewer file. |
| F | PASS | New md files had ASCII art headers. |
| G | PARTIAL | README onboarding was executable only after a real task instantiated a recipe. |
| H | PASS | FASTPROBE batch cap was honored. |
| I | PASS | No doc told agents to `code` a non-plan / research / report file. |
| J | PASS | 8 sequential atomic commits, one file each. |

## Rule audit

| Rule | Result |
|------|--------|
| Vague rules rejected | Mostly PASS; `TRAPS.md` needed cleanup for reviewer sign-off and TS-only scope. |
| Mock loopholes explicitly flagged | PASS; loophole language had explicit warning context. |
| Executable verify command + expected output | FAIL for P1/P2 trap rows; PARTIAL for several P0 verify hints. |

## First-pass cleanup queue

Blocking items were F-P0-1 through F-P0-6. Recommended non-blocking cleanup items were F-P1-1 through F-P1-7, with P2 bundled later. Definition of `CLEANUP-DONE`: all P0 items fixed, then re-evaluate to `READY`; P1/P2 remained recommended unless a reviewer kept sign-off blocked.
