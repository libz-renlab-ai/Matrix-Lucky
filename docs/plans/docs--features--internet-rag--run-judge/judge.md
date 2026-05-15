# Judge Playbook: Internet RAG (rankSources + Domain Tier Ordering)

> Replaces archived script `docs/features/internet-rag/run-judge.sh` per rule
> "third-party judge harness forbidden fixed scripts; MUST use md playbook"
> (`docs/HOWTO-PLAN-PR.md` § 3b).

## Origin
- Replaced script: `docs/legacy/judge-scripts/docs/features/internet-rag/run-judge.sh`
- Original purpose: Verify the `rankSources` helper in `packages/core/src/rag/` via vitest and a mechanical domain tier-ordering check (paper > docs > blog).
- Status: **ACTIVE**

## §V1 RUN
Concrete commands the MAIN agent dispatches (extracted from source .sh):

- Step 1: Run vitest for the RAG test file and capture JSON reporter output:
  ```
  pnpm vitest run packages/core/src/rag/__tests__/internet-rag.test.ts \
    --reporter=json --outputFile=.judge/internet-rag/<run_id>/vitest.json
  ```
  Capture stdout+stderr to `.judge/internet-rag/<run_id>/stdout.log`.

- Step 2: Mechanically verify `rankSources` domain tier ordering via Node ESM:
  ```
  node --input-type=module <<'EOF' > .judge/internet-rag/<run_id>/rank-check.json
  import { rankSources } from './packages/core/src/rag/internet-rag.js';
  const sources = [
    { url: 'https://blog.com/a', title: 'gradient descent blog', domain: 'blog' },
    { url: 'https://arxiv.org/b', title: 'gradient descent paper', domain: 'paper' },
    { url: 'https://docs.com/c', title: 'gradient descent docs', domain: 'docs' },
  ];
  const ranked = rankSources(sources, 'gradient descent', Date.now());
  process.stdout.write(JSON.stringify({ first_domain: ranked[0]?.domain, last_domain: ranked[ranked.length-1]?.domain, count: ranked.length }, null, 2) + '\n');
  EOF
  ```

- Step 3: Extract pass/fail counts and write `judge.json`:
  ```
  node -e "const j=require('.judge/internet-rag/<run_id>/vitest.json'); \
    console.log('passed:', j.numPassedTests, 'failed:', j.numFailedTests)"
  ```

Capture stdout/stderr to `evidence_dir = .judge/internet-rag/<run_id>/`.

## §V2 DUMP
JSON written to `.judge/internet-rag/<run_id>/judge.json`:

```json
{
  "run_id": "<ISO timestamp>-<pid>",
  "exit_code": 0,
  "vitest_pass_count": 5,
  "vitest_fail_count": 0,
  "vitest_ok": true,
  "rank_check_first_domain": "paper",
  "rank_check_count": 3,
  "rank_ok": true,
  "overall_pass": true,
  "evidence_dir": ".judge/internet-rag/<run_id>",
  "stdout_path": ".judge/internet-rag/<run_id>/stdout.log",
  "metrics": {
    "vitest_ok": true,
    "rank_ok": true,
    "rank_first_domain_is_paper": true,
    "rank_count_gte_3": true
  },
  "feature_status": "active"
}
```

Metric keys derived from source:
- `vitest_ok`: `true` when vitest exits 0
- `vitest_pass_count`: number of passed tests (must be > 0)
- `vitest_fail_count`: must equal 0
- `rank_check_first_domain`: must equal `"paper"` (highest tier in paper > docs > blog ordering)
- `rank_check_count`: must be >= 3 (all input sources returned)
- `rank_ok`: `true` when first_domain is `"paper"` AND count >= 3
- `overall_pass`: `true` when both `vitest_ok` and `rank_ok` are `true`

## §V3 READ
`claudefast -p` prompt:

> Read `.judge/internet-rag/<run_id>/judge.json` and `rank-check.json` in `evidence_dir`. Emit PASS / FAIL / SKIP.
>
> PASS criteria: `overall_pass` is `true`; specifically — `vitest_ok=true` (vitest exited 0, zero failing tests) AND `rank_ok=true` (first_domain="paper" AND count>=3, confirming paper > docs > blog tier ordering).
>
> FAIL criteria: `vitest_ok=false` (vitest tests failed) OR `rank_ok=false` (domain ordering incorrect or fewer than 3 results returned).
>
> SKIP if `packages/core/src/rag/internet-rag.js` or its ESM build is not present, or vitest is not installed.

## Notes
- Original logic summary: The harness has two independent verification layers. First, it runs the existing vitest suite for the RAG module to catch any unit-test regressions. Second, it performs a mechanical out-of-band check by directly importing `rankSources` via Node ESM and asserting that a three-source fixture (blog, paper, docs) is ordered with `paper` first — validating the domain tier-ordering contract (paper > docs > blog) is intact regardless of test file coverage. Both checks must pass for `overall_pass=true`.
- Dependencies: `pnpm install`, `pnpm vitest` (via workspace), Node.js ESM support, `packages/core/src/rag/internet-rag.js` (ESM build or tsx)
- Limitations: The ESM import in Step 2 requires either a built `.js` output or a tsx wrapper; the source uses bare `node --input-type=module` which may fail if the package requires a build step first. The `rank-check.json` output file is a JSON object (not JSONL), despite its `.json` extension containing the rank-check results directly.
