## Required canned-answer for slug=cursor-compiler

No `verify-canned-answer.sh` exists for this slug. Verification is done via `run-judge.sh`.

### What the judge harness verifies

`docs/plans/docs--features--cursor-compiler--run-judge/judge.md` (archived: `docs/legacy/judge-scripts/docs/features/cursor-compiler/run-judge.sh`) asserts all 4 of:

1. **vitest unit tests pass** for `packages/core/src/compiler/__tests__/cursor-compiler.test.ts`
2. **Functional integration**: seed 3 fixture rules, call `compileCursorRules`, emit a non-empty `.cursorrules` file
   containing text from each rule (R1: `WRONG_HARDCODE_SECRET_KEY` or `read from process.env.API_KEY`,
   R2: `CORRECT_USE_CONST_FREEZEOBJECT` or `Immutability prevents`,
   R3: `CORRECT_WRITE_TESTS_FIRST_TDD` or `TDD_REASON_TEST_DRIVEN`)
3. **Output is plain text** (first byte is not `{` or `[`)
4. **File size**: > 100 bytes and < 100 KB

### Judge output schema

```json
{
  "run_id": "<YYYYMMDDTHHMMSSZ>-<pid>",
  "exit_code": 0,
  "vitest_passed": <N>,
  "vitest_failed": 0,
  "vitest_exit": 0,
  "file_exists": true,
  "file_size_bytes": <N>,
  "rule_text_hits": [true, true, true],
  "format_is_plain_text": true,
  "evidence_dir": "tmp/.judge/cursor/<run_id>",
  "output_path": "tmp/.judge/cursor/<run_id>/.cursorrules",
  "stdout_path": "tmp/.judge/cursor/<run_id>/stdout.log"
}
```

LLM verdict (via `claudefast`): PASS only if all 3 `rule_text_hits` are true AND
`format_is_plain_text=true` AND `file_size_bytes > 100`.

### Feature reference

- Source: `packages/core/src/compiler/` (`compileCursorRules` export from `@teamagent/core`).
- CLI command: `teamagent compile-cursor` (`packages/cli/src/commands/compile-cursor.ts`).
- Product entry: `docs/PRODUCT-FEATURES.md` — Multi-tool & IDE integration:
  "Cursor `.cursorrules` compiler: exports top-N rules as Cursor-compatible file".
- Known limitation: compiler writes a static file; live sync on rule changes requires IDE reload.
