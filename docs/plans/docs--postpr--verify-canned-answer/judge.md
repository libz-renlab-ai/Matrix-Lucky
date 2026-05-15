# Judge Playbook: POSTPR Canned Answer (DEPRECATED)

> Replaces archived script `docs/legacy/judge-scripts/docs/postpr/verify-canned-answer.sh` per project rule
> "third-party judge harness forbidden fixed scripts; MUST use md playbook"
> (`docs/HOWTO-PLAN-PR.md` § 3b).

## Origin

- Replaced script: `docs/legacy/judge-scripts/docs/postpr/verify-canned-answer.sh`
- Original purpose: graded the `POSTPR` canned answer in CLAUDE.md
- Status: **DEPRECATED** — canned answer removed at commit `d341da8`

## §V1 RUN (historical)

Commands the original script executed:

- `claudefast -p "what we shall do after each PR?"` (captured from source)
- Output captured to `docs/postpr/.last-verify.out`
- Preferred direct `claudefast`; fell back to `zsh -i -c` with stderr separated to avoid noise contaminating grep

## §V2 DUMP (historical)

Original anchor list / criteria (from source script):

```json
{
  "exit_code": 0,
  "metrics": {
    "anchors_required": [
      "fetch the codex review",
      "chatgpt-codex-connector",
      "@codex review",
      "silent",
      "loop",
      "pulls/[^[:space:]]*comments (regex)"
    ],
    "anchors_found": ["..."],
    "anchors_missing": []
  },
  "evidence_dir": "docs/postpr/",
  "stdout_path": "docs/postpr/.last-verify.out",
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

- Original anchors that the script grepped for: `"fetch the codex review"`, `"chatgpt-codex-connector"`, `"@codex review"`, `"silent"`, `"loop"` (all fixed-string, case-insensitive); plus regex `"pulls/[^[:space:]]*comments"` for the gh api endpoint pattern
- Original trigger phrase: `"what we shall do after each PR?"`
- Migration path: if the project decides to re-introduce verification
  for any feature that was previously canned-answered, write a fresh
  md playbook describing the actual feature (not the canned answer
  surface), and place it under `docs/plans/<feature>/judge.md`.
