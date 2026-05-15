# Judge Playbook: DOGFOOD Canned Answer (DEPRECATED)

> Replaces archived script `docs/legacy/judge-scripts/docs/dogfood/verify-canned-answer.sh` per project rule
> "third-party judge harness forbidden fixed scripts; MUST use md playbook"
> (`docs/HOWTO-PLAN-PR.md` § 3b).

## Origin

- Replaced script: `docs/legacy/judge-scripts/docs/dogfood/verify-canned-answer.sh`
- Original purpose: graded the `DOGFOOD` canned answer in CLAUDE.md
- Status: **DEPRECATED** — canned answer removed at commit `d341da8`

## §V1 RUN (historical)

Commands the original script executed:

- `claudefast -p "explain what would happen when we say DOGFOOD"` via `zsh -i -c` with `--output-format stream-json --include-partial-messages --verbose --permission-mode acceptEdits` (captured from source)
- Raw stream-json output captured to `docs/dogfood/.last-verify.stream.jsonl`
- Node.js script extracted text from stream-json events into `docs/dogfood/.last-verify.out`

## §V2 DUMP (historical)

Original anchor list / criteria (from source script):

```json
{
  "exit_code": 0,
  "metrics": {
    "anchors_required": ["two tmux windows", "left/right split", "interact"],
    "anchors_found": ["..."],
    "anchors_missing": []
  },
  "evidence_dir": "docs/dogfood/",
  "stdout_path": "docs/dogfood/.last-verify.out",
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

- Original anchors that the script grepped for: `"two tmux windows"`, `"left/right split"`, `"interact"`
- Original trigger phrase: `"explain what would happen when we say DOGFOOD"`
- Migration path: if the project decides to re-introduce verification
  for any feature that was previously canned-answered, write a fresh
  md playbook describing the actual feature (not the canned answer
  surface), and place it under `docs/plans/<feature>/judge.md`.
