## Required canned-answer for slug=rule-quality

# Rule-Quality Validator

This feature validates the quality of learned rules in the TeamAgent knowledge base,
catching defective rules before they are stored and used.

## Verification Method

The feature is verified by dispatching the judge md playbook:

```text
docs/plans/docs--features--rule-quality--run-judge/judge.md
# Archived: docs/legacy/judge-scripts/docs/features/rule-quality/run-judge.sh
```

Then verify via:
```text
docs/plans/docs--features--rule-quality--verify-canned-answer/judge.md
# Archived: docs/legacy/judge-scripts/docs/features/rule-quality/verify-canned-answer.sh
```

## What It Does

L0 validator checks 5 defect categories across ingested rules:

| Category | Description |
|---|---|
| `empty_wrong_pattern` | Avoidance rule with no `wrong_pattern` |
| `identical_patterns` | `wrong_pattern === correct_pattern` |
| `confidence_range` | Confidence outside `[0, 1]` |
| `missing_fields` | Required field empty or absent |
| `embedding_conflict` | Jaccard similarity ≥ 0.85 vs existing rule |

## Judge Harness Output

Emits `.judge/<run_id>/judge.json` with structure:

```json
{
  "exit_code": 0,
  "verdict": "PASS",
  "metrics": {
    "defects_caught": 10,
    "total_defects": 10,
    "false_positives": 0,
    "overall_recall": 1.0,
    "recall_threshold": 0.8,
    "fp_max": 0
  },
  "per_category_recall": {
    "empty_wrong_pattern": 1.0,
    "identical_patterns": 1.0,
    "confidence_range": 1.0,
    "missing_fields": 1.0,
    "embedding_conflict": 1.0
  },
  "evidence_dir": ".judge/<run_id>/",
  "stdout_path": ".judge/<run_id>/stdout.log"
}
```

## Verification Pass Condition

```
VERIFIED: rule-quality validator PASS
```

Pass requires: `overall_recall >= 0.8` AND `false_positives == 0`.
