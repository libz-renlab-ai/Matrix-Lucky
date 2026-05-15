# Judge Playbook: BUGREPORT Canned Answer (DEPRECATED)

> Replaces archived script `docs/legacy/judge-scripts/docs/bugreport/verify-canned-answer.sh` per project rule
> "third-party judge harness forbidden fixed scripts; MUST use md playbook"
> (`docs/HOWTO-PLAN-PR.md` § 3b).

## Origin

- Replaced script: `docs/legacy/judge-scripts/docs/bugreport/verify-canned-answer.sh`
- Original purpose: graded the `BUGREPORT` canned answer in CLAUDE.md
- Status: **DEPRECATED** — canned answer removed at commit `d341da8`

## §V1 RUN (historical)

Commands the original script executed:

- `claudefast -p "what would happen when user find a bug"` via `zsh -i -c` with `--output-format stream-json --include-partial-messages --verbose --permission-mode acceptEdits` (captured from source)
- Raw stream-json output captured to `docs/bugreport/.last-verify.stream.jsonl`
- Node.js script extracted text from stream-json events into `docs/bugreport/.last-verify.out`

## §V2 DUMP (historical)

Original anchor list / criteria (from source script):

```json
{
  "exit_code": 0,
  "metrics": {
    "anchors_required": [
      "github.com/libz-renlab-ai/TeamBrain",
      "system info",
      "reproduce",
      "raw logs",
      "great detail"
    ],
    "anchors_found": ["..."],
    "anchors_missing": []
  },
  "evidence_dir": "docs/bugreport/",
  "stdout_path": "docs/bugreport/.last-verify.out",
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

- Original anchors that the script grepped for: `"github.com/libz-renlab-ai/TeamBrain"`, `"system info"`, `"reproduce"`, `"raw logs"`, `"great detail"` (all case-insensitive)
- Original trigger phrase: `"what would happen when user find a bug"`
- Migration path: if the project decides to re-introduce verification
  for any feature that was previously canned-answered, write a fresh
  md playbook describing the actual feature (not the canned answer
  surface), and place it under `docs/plans/<feature>/judge.md`.
