# Judge Playbook: AttributionBus — Run Judge

> Replaces archived script `docs/legacy/judge-scripts/docs/features/attribution-bus/run-judge.sh` per rule
> "third-party judge harness forbidden fixed scripts; MUST use md playbook"
> (`docs/HOWTO-PLAN-PR.md` § 3b).

## Origin
- Replaced script: `docs/legacy/judge-scripts/docs/features/attribution-bus/run-judge.sh`
- Original purpose: Run vitest for `InMemoryAttributionBus` and `StdoutRenderer` test suites, then mechanically verify emit/drain/subscribe/unsubscribe semantics via inline Node ESM, and aggregate results into `judge.json`.
- Status: **ACTIVE**

## §V1 RUN
Commands MAIN agent dispatches; capture to `evidence_dir = .judge/<run_id>/`:
- Step 1: Create `evidence_dir` at `.judge/attribution-bus/<run_id>/`.
- Step 2: Run vitest for the two attribution adapter test files, saving JSON reporter output:
  ```bash
  pnpm vitest run \
    packages/adapters/src/attribution/__tests__/in-memory-bus.test.ts \
    packages/adapters/src/attribution/__tests__/stdout-renderer.test.ts \
    --reporter=json --outputFile=<evidence_dir>/vitest.json
  ```
  Record exit code as `vitest_exit`.
- Step 3: Run a Node ESM inline script to mechanically verify emit/drain/subscribe/unsubscribe behaviour. The script must:
  - Import `InMemoryAttributionBus` from `./packages/adapters/src/attribution/in-memory-bus.js`
  - Emit one event `{ type: 'rule_applied', ruleId: 'r1', sessionId: 's1', timestamp: Date.now() }`
  - Call `bus.drain()` and record `drain_count` and `drain_first_rule_id`
  - Subscribe a callback, emit one event, unsubscribe, emit one more event; record `sub_count_before_unsub`
  - Call `bus.drain()` again and record `buf_after_drain` (should include both post-drain emits: 1 from subscribe test + 1 after unsub = 2)
  - Write result JSON to `<evidence_dir>/bus-check.json`

  Record exit code as `bus_check_exit`.
- Step 4: Parse `vitest.json` to extract `numPassedTests` and `numFailedTests`.
- Step 5: Parse `bus-check.json` to extract `drain_count`, `sub_count_before_unsub`, `buf_after_drain`.

## §V2 DUMP
JSON to `.judge/<run_id>/judge.json`:
```json
{ "exit_code": 0,
  "metrics": {
    "vitest_pass_count": 0,
    "vitest_fail_count": 0,
    "vitest_ok": true,
    "drain_count": 1,
    "sub_count_before_unsub": 1,
    "buf_after_drain": 2,
    "bus_ok": true
  },
  "evidence_dir": ".judge/attribution-bus/<run_id>",
  "stdout_path": ".judge/attribution-bus/<run_id>/stdout.log",
  "feature_status": "active" }
```

## §V3 READ
`claudefast -p` prompt:
> Read judge.json + evidence_dir. Emit PASS / FAIL / SKIP.
> PASS criteria:
>   (1) `vitest_ok` is true (vitest exit code 0, zero failed tests);
>   (2) `bus_ok` is true: `drain_count == 1` AND `sub_count_before_unsub == 1` AND `buf_after_drain == 2`.
>   Both (1) and (2) must hold for PASS.
> FAIL criteria: `vitest_ok` is false OR `bus_ok` is false.
> SKIP if feature deleted at d341da8: not applicable — `packages/adapters/src/attribution/` is an active package; do not emit SKIP.

## Notes
- Original logic summary: The harness ran `pnpm vitest run` targeting the two test files (`in-memory-bus.test.ts` and `stdout-renderer.test.ts`) with `--reporter=json`. In parallel it ran a Node `--input-type=module` heredoc that instantiated `InMemoryAttributionBus`, exercised emit/drain (expecting drain_count=1), then subscribe (expecting sub_count_before_unsub=1 after one emit), then unsubscribe and one more emit. The second `bus.drain()` was expected to return 2 events (the emit during subscription + the post-unsub emit). All four conditions (`vitest exit 0`, `drain_count==1`, `sub_count==1`, `buf_after_drain==2`) were required for OVERALL_PASS.
- Dependencies / limitations:
  - Requires `pnpm` on PATH and the monorepo to be installed (`pnpm install`)
  - Test files: `packages/adapters/src/attribution/__tests__/in-memory-bus.test.ts` and `packages/adapters/src/attribution/__tests__/stdout-renderer.test.ts`
  - The Node ESM inline script imports from the TypeScript source via `.js` extension (TSX/ESM resolution); ensure build artifacts or `tsx` loader is configured
  - `buf_after_drain==2` is a subtle invariant: the original drain empties the buffer, so the second drain only captures events emitted after the first drain (1 during subscribe + 1 after unsub)
  - `node:sqlite` (`DatabaseSync`) is used in the team-share harness but NOT here; this harness uses plain Node ESM with no extra DB dependency
