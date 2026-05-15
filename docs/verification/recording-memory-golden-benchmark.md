# Recording Memory Golden Prompt Benchmark

## Recording Examples

- Recording Memory import design review (docs/specs/2026-04-29-recording-memory-performance-verification.md)
- Recording Memory dashboard and latency review (docs/specs/2026-04-29-recording-memory-performance-verification.md#dashboard)
- Recording Memory golden prompt benchmark (docs/specs/2026-04-29-recording-memory-performance-verification.md#golden-prompt-benchmark)

## Results

| # | Prompt | Expected Recording | Actual Recording | Pass | Injection Tokens |
|---|---|---|---|---|---|
| 1 | What did we decide about importing recording transcripts? | golden-1 | golden-1 | PASS | 408 |
| 2 | Where should recording memory cite source references? | golden-1 | golden-1 | PASS | 403 |
| 3 | Should the full transcript be injected by default? | golden-1 | golden-1 | PASS | 402 |
| 4 | How do we monitor slow recording-memory retrievals? | golden-2 | golden-2 | PASS | 405 |
| 5 | What dashboard counts are required for recording memory? | golden-2 | golden-2 | PASS | 405 |
| 6 | What evidence should show latency and empty retrievals? | golden-2 | golden-2 | PASS | 404 |
| 7 | How many golden prompts are used for acceptance? | golden-3 | golden-3 | PASS | 274 |
| 8 | What is the default recording memory token budget? | golden-3 | golden-1 | FAIL | 405 |
| 9 | What pass rate does the golden benchmark require? | golden-3 | golden-3 | PASS | 400 |
| 10 | When is a full recording transcript allowed in context? | golden-3 | golden-1 | FAIL | 405 |

Pass rate: 8/10
Acceptance: PASS
Default injection budget: 800 tokens
Full transcript appears only after explicit expansion with `teamagent recording show <id> --transcript` or `teamagent recording inject --full`.
