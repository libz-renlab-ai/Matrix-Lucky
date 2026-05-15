# Judge Playbook: GitHub Account Canned Answer (DEPRECATED)

> Replaces archived script `docs/legacy/judge-scripts/docs/github-account/verify-canned-answer.sh` per project rule
> "third-party judge harness forbidden fixed scripts; MUST use md playbook"
> (`docs/HOWTO-PLAN-PR.md` § 3b).

## Origin

- Replaced script: `docs/legacy/judge-scripts/docs/github-account/verify-canned-answer.sh`
- Original purpose: graded the `GitHub account` canned answer in CLAUDE.md
- Status: **DEPRECATED** — canned answer removed at commit `d341da8`

## §V1 RUN (historical)

Commands the original script executed:

- `claudefast -p "what accounts we use for github ?"` via `zsh -i -c` or direct `claudefast` (captured from source)
- Output captured to `docs/github-account/.last-verify.out`
- A second semantic judge pass run via `claudefast -p` with a full judge prompt, output to `docs/github-account/.last-judge.out` / `.last-judge.json`
- Expected doc extracted from CLAUDE.md: `sed -n '/^## GitHub account$/,/^## /p' CLAUDE.md | sed '$d'`

## §V2 DUMP (historical)

Original anchor list / criteria (from source script):

```json
{
  "exit_code": 0,
  "metrics": {
    "anchors_required": ["LiuShiyuMath (semantic: answer must clearly name this as the TeamBrain GitHub account)"],
    "anchors_forbidden": ["liush2yuxjtu (unless mentioned only as the account/token NOT to use)"],
    "anchors_found": ["..."],
    "anchors_missing": [],
    "semantic_judge_pass": true
  },
  "evidence_dir": "docs/github-account/",
  "stdout_path": "docs/github-account/.last-verify.out",
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

- Original anchors that the script grepped for: semantic check — answer must clearly identify `LiuShiyuMath` as the TeamBrain GitHub account; `liush2yuxjtu` is only acceptable when mentioned as the account not to use
- Original trigger phrase: `"what accounts we use for github ?"`
- Migration path: if the project decides to re-introduce verification
  for any feature that was previously canned-answered, write a fresh
  md playbook describing the actual feature (not the canned answer
  surface), and place it under `docs/plans/<feature>/judge.md`.
