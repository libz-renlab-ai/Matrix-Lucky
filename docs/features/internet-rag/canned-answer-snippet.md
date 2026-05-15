## Required canned-answer for slug=internet-rag

# Internet RAG (Paper/Blog/Docs Ranker)

This feature ranks external internet sources (papers, documentation, blog posts) by relevance and domain authority to surface the most credible results for AI context enrichment.

## What it does

`packages/core/src/rag/internet-rag.ts` exports `rankSources()` which applies BM25-style scoring plus domain tier tie-breaking: `paper > docs > blog`. Given a query string and a list of source objects, it returns a ranked array with the most credible domain first.

## Key symbols

- `rankSources` — main export in `packages/core/src/rag/internet-rag.ts`
- Domain tiers: `paper` (highest) > `docs` > `blog` (lowest)

## Judge harness output

`.judge/internet-rag/<run_id>/judge.json` contains:

```json
{
  "run_id": "<timestamp>-<pid>",
  "exit_code": 0,
  "vitest_pass_count": 1,
  "vitest_fail_count": 0,
  "vitest_ok": true,
  "rank_check_first_domain": "paper",
  "rank_check_count": 3,
  "rank_ok": true,
  "overall_pass": true,
  "evidence_dir": ".judge/internet-rag/<run_id>",
  "stdout_path": ".judge/internet-rag/<run_id>/stdout.log"
}
```

## Verification

```text
# Run-judge md playbook (script archived to docs/legacy/judge-scripts/...; use playbook):
docs/plans/docs--features--internet-rag--run-judge/judge.md
# Verify-canned-answer (utility, retained per docs/legacy/judge-scripts/README.md exemption):
bash docs/features/internet-rag/verify-canned-answer.sh
```

PASS requires `vitest_ok=true` AND `rank_ok=true` (first ranked domain must be `paper`).
