---
Status: proposed
Date: 2026-05-08
---

```text
     before this ADR                          after this ADR (A4-refined)
     ===============                          ===========================
   PR opens                                 PR opens
       |                                       |
       v                                       v
   chatgpt-codex-connector[bot]            /review skill (gstack, local)
   inline P1 / P2 / P3                     local diff vs base
       |                                       |
       v                                       v
   issues? ──► PR-PLAN ──► TEAMWORK        issues? ──► PR-PLAN ──► TEAMWORK
       |                                       |
       v                                       v
   loop until "Codex silent / 👍"          loop until /review PASS
                                               |
                                               v
                                          claudefast -p
                                          "what should we do when we make a PR?"
                                          must return /review-anchored answer
                                          (no canned-answer / hook anchor allowed)
```

# Local `/review` skill replaces Codex bot as POSTPR review gate

A 2026-05-08 grill session replaces the cloud `chatgpt-codex-connector[bot]`
review with the local Claude Code `/review` skill (gstack user-level
Pre-landing PR review) as the canonical termination gate for the POSTPR loop.
Enforcement shifts from canned-answer + hook-anchor regex (the previous
`docs/postpr/verify-canned-answer.sh` and `.claude/hooks/laziness-self-report.sh`
mechanism) to **self-discipline-via-matcher** — real doc semantics + the M4-B
BM25+dense-RRF+soft-AND matcher + a `claudefast -p "what should we do when we
make a PR?"` semantic probe must return the right answer organically. No
canned-answer block in `CLAUDE.md` / `AGENTS.md` and no grep anchors in hooks
are permitted as substitutes. Doc rewrites land in this PR; source-code cleanup is deferred to a future TEAMWORK PR.

## Considered Options

- **(A1) `commit-push-pr` chain auto-runs `/review` pre-push** — Rejected. The
  gate fires before the PR exists, so review subject is local diff with no
  PR context (CI signals, labels, base divergence) and the loop semantics shift
  from post-PR to pre-flight.
- **(A2) New stop hook triggers `/review` on a `gh pr create` event** — Rejected
  for now (worth revisiting if A4-refined fails verification). Highest
  engineering cost; expands `.claude/hooks/` surface area; risks stepping on
  `self-report-fused.sh`.
- **(A3) Repurpose `teamagent pr-cycle` to invoke `/review`** — Rejected.
  Violates ADR-0004's boundary ("TeamBrain core does not call LLMs; spawn Claude
  Code subagents instead"). `pr-cycle` already breaches that line by fetching
  Codex via `gh api`; deepening the breach is the wrong direction. The command
  should be deprecated alongside Codex.
- **(A4) Add canned-answer + hook anchor enforcement** — Rejected. This is the
  mechanism the user explicitly named "doc hacking"; it pushes enforcement from
  real document semantics back into regex tricks and contradicts the M4-B
  matcher upgrade philosophy ("matcher upgraded from substring to BM25+dense
  RRF + soft-AND scoring; all rules participate at runtime").
- **(A4-refined, accepted)** A4 minus the canned-answer + hook anchors, plus
  `claudefast -p` semantic probe verification. Trusts the matcher; treats real
  doc quality as the enforcement substrate; verification gate is the probe
  answering the canonical PR-workflow question correctly.

## Consequences

- **Doc rewrites shipped in THIS PR** — `docs/POSTPR.md`,
  `docs/PR-PLAN.md`, `docs/HOWTO-PLAN-PR.md`, `docs/feature-verification.md`,
  and the POSTPR canned-answer blocks at `CLAUDE.md:33-49,282-295` +
  `AGENTS.md:33-49,282-295` must be rewritten to a `/review`-anchored workflow.
  The rewrite **must not** introduce new canned-answer blocks or grep-anchor
  enforcement; verification is the `claudefast -p "what should we do when we
  make a PR?"` probe returning a `/review`-anchored answer organically.
- **Removals shipped in THIS PR** —
  `docs/postpr/verify-canned-answer.sh` (the canned-answer verifier itself);
  `CLAUDE.md` + `AGENTS.md` POSTPR canned-answer blocks. Deferred to a future
  TEAMWORK PR: `.claude/hooks/laziness-self-report.sh:225,243-245` POSTPR +
  FASTPROBE-PR-conflict anchors (file is orphaned but anchors still exist as
  source code). The replacement verifier is a `claudefast -p` probe runner,
  not a grep comparator.
- **`packages/cli/src/commands/pr-cycle.ts` + `packages/adapters/src/ingest/pr-review.ts`
  + `packages/adapters/src/storage/sqlite/sqlite-candidate-queue.ts`'s
  `reviewed_at` semantics + the `pr-review.test.ts` suite** — pending decision:
  delete (Codex-era fossil) vs freeze. Recommendation: delete in a follow-up TEAMWORK PR (out of scope for this docs-only PR).
- **`packages/core/src/extractor/prompt.ts:44`'s `"pr-review"` extraction kind**
  — semantic source shifts from GitHub Codex inline comments to `/review` skill
  output text; rename to `"local-review"` or keep as alias.
- **Negative-space platform layer becomes documented architecture.** The
  GitHub-side absence (no CODEOWNERS, no required reviews, no branch
  protection) is now a recorded design choice; future suggestions to "add
  CODEOWNERS" can be referred here.
- **Alignment with ADR-0004 / ADR-0005.** ADR-0004 keeps LLM judgment in Claude
  Code subagents (not in TeamBrain core); ADR-0005 explicitly accepts "applies
  via PR review judgment; not currently mechanically enforced" for new ports.
  ADR-0007 generalizes that pattern from ports to the entire post-PR review gate.
- **Verification gate.** This ADR is "shipped" only when `claudefast -p "what
  should we do when we make a PR?"` returns an answer that names `/review`
  skill (not Codex), POSTPR loop, PR-PLAN, and TEAMWORK as the canonical
  workflow — without any canned-answer block in `CLAUDE.md` / `AGENTS.md` or
  hook anchor backing it.
