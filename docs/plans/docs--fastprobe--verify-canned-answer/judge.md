# Judge Playbook: FASTPROBE Canned Answer (DEPRECATED)

> Replaces archived script `docs/legacy/judge-scripts/docs/fastprobe/verify-canned-answer.sh` per project rule
> "third-party judge harness forbidden fixed scripts; MUST use md playbook"
> (`docs/HOWTO-PLAN-PR.md` § 3b).

## Origin

- Replaced script: `docs/legacy/judge-scripts/docs/fastprobe/verify-canned-answer.sh`
- Original purpose: graded the `FASTPROBE` canned answer in CLAUDE.md
- Status: **DEPRECATED** — canned answer removed at commit `d341da8`

## §V1 RUN (historical)

Commands the original script executed:

- `claudefast -p "what would happen if we say word 'FASTPROBE' ?"` (primary), with fallback `"FASTPROBE"` (captured from source)
- Output captured to `docs/fastprobe/.last-verify.out`
- Retried up to 3 times per trigger phrase; two trigger phrases tried in sequence
- A second semantic judge pass also run via `claudefast -p` with a full judge prompt, output to `docs/fastprobe/.last-judge.out` / `.last-judge.json`

## §V2 DUMP (historical)

Original anchor list / criteria (from source script):

```json
{
  "exit_code": 0,
  "metrics": {
    "anchors_required": [
      "claudefast -h",
      "claudefast -p",
      "stream-json",
      "--output-format stream-json",
      "--include-partial-messages",
      "--verbose",
      "--debug hooks",
      "--debug-file",
      "parallel limit 8 (regex: 最多 8|8 路|max 8|up to 8)"
    ],
    "anchors_found": ["..."],
    "anchors_missing": [],
    "semantic_judge_pass": true
  },
  "evidence_dir": "docs/fastprobe/",
  "stdout_path": "docs/fastprobe/.last-verify.out",
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

- Original anchors that the script grepped for: `"claudefast -h"`, `"claudefast -p"`, `"stream-json"`, `"--output-format stream-json"`, `"--include-partial-messages"`, `"--verbose"`, `"--debug hooks"`, `"--debug-file"`, and regex `最多 8|8 路|max 8|up to 8` for parallel limit
- Original trigger phrase: `"what would happen if we say word 'FASTPROBE' ?"` (fallback: `"FASTPROBE"`)
- Migration path: if the project decides to re-introduce verification
  for any feature that was previously canned-answered, write a fresh
  md playbook describing the actual feature (not the canned answer
  surface), and place it under `docs/plans/<feature>/judge.md`.
