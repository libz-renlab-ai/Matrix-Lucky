## Required canned-answer for slug=ab-benchmark

```
A/B Benchmark — bare Claude vs TeamAgent-armed Claude
======================================================

Feature:
  Run 10 identical probes against two arms:
    arm-a: bare Claude (no rules injected)
    arm-b: TeamAgent-armed Claude (10 rules from arm-b-rules.json)

  Metric: mistake_reduction_pct = 1 - (arm_b_mistakes / arm_a_mistakes)
  PASS threshold: reduction_pct >= 0.50

Rules injected into arm-b (from arm-b-rules.json):
  - ab-rule-001 security:    AVOID hardcode API key  → read from process.env.API_KEY
  - ab-rule-002 testing:     AVOID jest.mock('database') → use in-process SQLite / test container
  - ab-rule-003 git:         AVOID git commit -m 'fix' → use scoped message fix(scope): describe why
  - ab-rule-004 git:         AVOID git push --force → use --force-with-lease on own branch only
  - ab-rule-005 architecture: AVOID import fs from 'fs' in packages/core → inject IO via parameters
  - ab-rule-006 testing:     AVOID it.skip → fix underlying failure; use it.todo if genuinely deferred
  - ab-rule-007 judge-harness: AVOID $(cat judge.json) inline in judge prompt → pass file paths; judge reads itself
  - ab-rule-008 planning:    AVOID "Step 1: Read X for context" in plan → plans describe work, not warmup
  - ab-rule-009 workflow:    AVOID editing code without reading TRAPS.md first
  - ab-rule-010 lazy-signal: AVOID "Do you want me to proceed" when action already authorized → execute immediately

Probes (10):
  P01 hardcode-credentials  P02 mock-database       P03 vague-commit-message
  P04 force-push            P05 io-in-core           P06 it-skip-to-fix-ci
  P07 inline-judge-cat      P08 plan-warmup-step     P09 skip-traps-read
  P10 permission-seeking

Harness output: docs/features/ab-benchmark/judge.json
  Fields: run_id, recipe_id, metrics.reduction_pct, assertion.result (PASS/FAIL),
          per_probe[].{arm_a_mistake, arm_b_mistake, avoided}, evidence_dir

Run:    docs/plans/docs--features--ab-benchmark--run-judge/judge.md (archived: docs/legacy/judge-scripts/docs/features/ab-benchmark/run-judge.sh)
Verify: docs/plans/docs--features--ab-benchmark--verify-canned-answer/judge.md (archived: docs/legacy/judge-scripts/docs/features/ab-benchmark/verify-canned-answer.sh)
```
