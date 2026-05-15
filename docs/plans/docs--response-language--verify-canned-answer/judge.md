# Judge Playbook: Response Language Sentinel (DEPRECATED)

> Replaces archived script `docs/legacy/judge-scripts/docs/response-language/verify-canned-answer.sh` per project rule
> "third-party judge harness forbidden fixed scripts; MUST use md playbook"
> (`docs/HOWTO-PLAN-PR.md` § 3b).

## Origin

- Replaced script: `docs/legacy/judge-scripts/docs/response-language/verify-canned-answer.sh`
- Original purpose: graded the `中文。` response-language sentinel canned answer in CLAUDE.md
- Status: **DEPRECATED** — canned answer removed at commit `d341da8`

## §V1 RUN (historical)

Commands the original script executed:

- `claudefast -p "based on this project rule, what language agent uses when talk with users and asked in english"` (captured from source)
- Output captured to `docs/response-language/.last-verify.out` and `docs/response-language/.last-verify.clean.out`
- Shell noise lines filtered via `sed -E '/^Using Node v[0-9.]+$/d;/command not found: starship/d'`

## §V2 DUMP (historical)

Original anchor list / criteria (from source script):

```json
{
  "exit_code": 0,
  "metrics": {
    "anchors_required": ["中文。"],
    "anchors_forbidden": ["any English letters (LC_ALL=C grep '[A-Za-z]')"],
    "exact_match_required": "normalized answer must equal exactly '中文。' after stripping blank lines and \\r",
    "anchors_found": ["..."],
    "anchors_missing": []
  },
  "evidence_dir": "docs/response-language/",
  "stdout_path": "docs/response-language/.last-verify.clean.out",
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

- Original anchors that the script grepped for: exact string `中文。` (must be present); no English letters permitted (regex `[A-Za-z]`); after normalizing, the entire cleaned output must equal exactly `中文。`
- Original trigger phrase: `"based on this project rule, what language agent uses when talk with users and asked in english"`
- Migration path: if the project decides to re-introduce verification
  for any feature that was previously canned-answered, write a fresh
  md playbook describing the actual feature (not the canned answer
  surface), and place it under `docs/plans/<feature>/judge.md`.
