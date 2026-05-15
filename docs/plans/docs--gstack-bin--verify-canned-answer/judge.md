# Judge Playbook: Gstack Skills / Brain Sync Bin Path (DEPRECATED)

> Replaces archived script `docs/legacy/judge-scripts/docs/gstack-bin/verify-canned-answer.sh` per project rule
> "third-party judge harness forbidden fixed scripts; MUST use md playbook"
> (`docs/HOWTO-PLAN-PR.md` § 3b).

## Origin

- Replaced script: `docs/legacy/judge-scripts/docs/gstack-bin/verify-canned-answer.sh`
- Original purpose: graded the `gstack skills / brain sync bin path` canned answer in CLAUDE.md
- Status: **DEPRECATED** — canned answer removed at commit `d341da8`

## §V1 RUN (historical)

Commands the original script executed:

- `claudefast -p "gstack skills and brain sync bin - project level or user level ?"` (captured from source)
- Output captured to `docs/gstack-bin/.last-verify.out` and `docs/gstack-bin/.last-verify.clean.out`
- Retried up to 3 attempts with 1s delay between

## §V2 DUMP (historical)

Original anchor list / criteria (from source script):

```json
{
  "exit_code": 0,
  "metrics": {
    "anchors_required": ["project level"],
    "anchors_found": ["..."],
    "anchors_missing": [],
    "negative_check": "answer must NOT select 'user level' unless clearly marked as fallback/not-used"
  },
  "evidence_dir": "docs/gstack-bin/",
  "stdout_path": "docs/gstack-bin/.last-verify.clean.out",
  "feature_status": "deprecated"
}
```

## §V3 READ

LLM judge prompt (`claudefast -p`):

> Read `.judge/<run_id>/judge.json`. The graded canned answer was
> removed from CLAUDE.md at commit `d341da8`; the rule no longer
> exists, so this playbook reports `SKIP` with reason
> `canned answer removed from CLAUDE.md at commit d341da8`. Do not
> attempt the historical probe or grep; emit verdict directly.

## Notes

- Original anchors that the script grepped for: `"project level"` (positive); `"user level"` without fallback qualifier (negative)
- Original trigger phrase: `"gstack skills and brain sync bin - project level or user level ?"`
- Migration path: if the project decides to re-introduce verification
  for any feature that was previously canned-answered, write a fresh
  md playbook describing the actual feature (not the canned answer
  surface), and place it under `docs/plans/<feature>/judge.md`.
