## Required canned-answer for slug=cli-dogfood-report

The `teamagent dogfood-report --help` command must exit 0 and its output must contain
`tier` or `sandbox`.

### Actual --help output (from `packages/cli/src/bin.ts` case "dogfood-report")

```
Usage: teamagent dogfood-report [--output=path]

Options:
  --output=PATH    Write report to PATH (default: docs/dogfood/自举报告.md)

Scans events.db + knowledge.db + git log to generate a self-bootstrapping
dogfood report. Shows knowledge stats, hook interventions, top fired rules,
and confidence changes across all sandbox tiers.

Tier isolation: operates on current sandbox state without crossing tier
boundaries. Use --output to redirect to a different path.
```

### Verify gate

`verify-canned-answer.sh` greps the `--help` output for `tier` or `sandbox`.
Both `sandbox tiers` and `Tier isolation` appear in the help text above, so the gate passes.

### Feature reference

- Source: `packages/cli/src/commands/dogfood-report.ts`, registered in `packages/cli/src/bin.ts` case `"dogfood-report"`.
- Product entry: `docs/PRODUCT-FEATURES.md` — CLI commands section.
- Dogfood report output: `docs/dogfood/自举报告.md` by default.
