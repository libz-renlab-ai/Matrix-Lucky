# Judge Playbook: Product Features (Ready-to-Ship) Canned Answer (DEPRECATED)

> Replaces archived script `docs/legacy/judge-scripts/docs/product-features/verify-canned-answer.sh` per project rule
> "third-party judge harness forbidden fixed scripts; MUST use md playbook"
> (`docs/HOWTO-PLAN-PR.md` § 3b).

## Origin

- Replaced script: `docs/legacy/judge-scripts/docs/product-features/verify-canned-answer.sh`
- Original purpose: graded the `product-features (ready-to-ship / claimed features)` canned answer in CLAUDE.md
- Status: **DEPRECATED** — canned answer removed at commit `d341da8`

## §V1 RUN (historical)

Commands the original script executed:

- `claudefast -p "list all the features we clamined please. list product feature not tech feature"` (captured from source)
- Output captured to `docs/product-features/.last-verify.out` and `docs/product-features/.last-verify.clean.out`
- Shell noise lines filtered via `sed -E '/^Using Node v[0-9.]+$/d;/command not found: starship/d'`

## §V2 DUMP (historical)

Original anchor list / criteria (from source script):

```json
{
  "exit_code": 0,
  "metrics": {
    "anchors_required": [
      "\"已验证\",\"产品入口能打开\"",
      "\"已验证\",\"最小学习闭环演示\"",
      "\"已验证\",\"安全试吃沙箱\"",
      "\"已验证\",\"AI 犯错前提醒\"",
      "\"已验证\",\"纠正一次，下次记住\"",
      "\"已验证\",\"知识会进化\"",
      "\"已验证\",\"看得见的统计\"",
      "\"已验证\",\"主动记录坑点\""
    ],
    "anchors_forbidden": [
      "部分验证", "已声明未验证", "失败/不稳定", "文档规划",
      "最小质量线", "快速调研流程", "PR 后复查流程", "完整测试绿灯",
      "真实 E2E", "全功能沙箱 E2E", "FASTPROBE", "POSTPR",
      "BUGREPORT", "DOGFOOD 固定话术", "typecheck", "pnpm test"
    ],
    "anchors_found": ["..."],
    "anchors_missing": []
  },
  "evidence_dir": "docs/product-features/",
  "stdout_path": "docs/product-features/.last-verify.clean.out",
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

- Original anchors that the script grepped for: 8 CSV rows starting with `"已验证"` for the 8 verified product features; plus 16 forbidden strings (non-product or non-ready items)
- Original trigger phrase: `"list all the features we clamined please. list product feature not tech feature"`
- Migration path: if the project decides to re-introduce verification
  for any feature that was previously canned-answered, write a fresh
  md playbook describing the actual feature (not the canned answer
  surface), and place it under `docs/plans/<feature>/judge.md`.
