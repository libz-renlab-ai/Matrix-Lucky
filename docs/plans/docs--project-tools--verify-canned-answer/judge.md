# Judge Playbook: Project Tools Table Canned Answer (DEPRECATED)

> Replaces archived script `docs/legacy/judge-scripts/docs/project-tools/verify-canned-answer.sh` per project rule
> "third-party judge harness forbidden fixed scripts; MUST use md playbook"
> (`docs/HOWTO-PLAN-PR.md` § 3b).

## Origin

- Replaced script: `docs/legacy/judge-scripts/docs/project-tools/verify-canned-answer.sh`
- Original purpose: graded the `project tools / FASTPROBE` canned answer table in CLAUDE.md
- Status: **DEPRECATED** — canned answer removed at commit `d341da8`

## §V1 RUN (historical)

Commands the original script executed:

- `claudefast -p "what project tools we have ?"` via `zsh -i -c` with `--output-format stream-json --include-partial-messages --verbose --permission-mode acceptEdits` (captured from source)
- Raw stream-json output captured to `docs/project-tools/.last-verify.stream.jsonl`
- Node.js script extracted text from stream-json events into `docs/project-tools/.last-verify.out`
- A second semantic judge pass run via `claudefast -p` with a full judge prompt, output to `docs/project-tools/.last-judge.out` / `.last-judge.json`
- Expected doc extracted from CLAUDE.md: `sed -n '/^## Project tools \/ FASTPROBE$/,/^## Bug report canned answer$/p' CLAUDE.md | sed '$d'`

## §V2 DUMP (historical)

Original anchor list / criteria (from source script):

```json
{
  "exit_code": 0,
  "metrics": {
    "anchors_required": [
      "FASTPROBE (must appear as available tool, not negated)",
      "claudefast",
      "DOGFOOD",
      "BUGREPORT",
      "POSTPR",
      "RULE-VERIFY"
    ],
    "anchors_found": ["..."],
    "anchors_missing": [],
    "semantic_judge_pass": true,
    "note": "pass=false if tools appear only in negated/forbidden list rather than as available project tools"
  },
  "evidence_dir": "docs/project-tools/",
  "stdout_path": "docs/project-tools/.last-verify.out",
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

- Original anchors that the script grepped for (semantic): `FASTPROBE`, `claudefast`, `DOGFOOD`, `BUGREPORT`, `POSTPR`, `RULE-VERIFY` — all must appear as available project tools (not negated); semantic judge verified the table structure matched the source rule section
- Original trigger phrase: `"what project tools we have ?"`
- Migration path: if the project decides to re-introduce verification
  for any feature that was previously canned-answered, write a fresh
  md playbook describing the actual feature (not the canned answer
  surface), and place it under `docs/plans/<feature>/judge.md`.
