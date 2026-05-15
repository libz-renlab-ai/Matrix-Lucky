---
feature_id: 26
feature_name: PII redactor covers API keys, JWT, phone, credit card, AWS key
owner: LiuShiyuMath
sources:
  product_features_md: row 26
  commits: [c08b8fa, 79adc0d, 6147c9e]  # introducing-commit SHAs; legacy m4/wave6 era — no clean PR mapping
  issues: []
  related_docs:
    - docs/plans/docs--features--pii-redaction--run-judge/judge.md
    - docs/plans/docs--features--pii-redaction--verify-canned-answer/judge.md
    - docs/features/pii-redaction/canned-answer-snippet.md
    - packages/core/src/pii/redactor.ts
    - packages/core/src/pii/__tests__/redactor.test.ts
    - scripts/pii-redact-fixture.ts
last_composed: 2026-05-08
---

# GOAL: PII 涂黑器（team-share 前 scrub 5 类敏感信息）

## Product language (no tech stack)

团队成员把工作笔记 / 经验上传到 team store 之前，系统自动把以下信息
变成 `[redacted]`，避免泄露：

- API key（Bearer / `API_KEY=` / `sk-ant-` / `sk-` / `gh*_`）
- JWT（`eyJ.eyJ.<sig>`）
- phone（带国码或区号格式）
- credit card（**带 Luhn 校验**，避免误伤普通数字串）
- AWS access key（AKIA/ASIA/ABIA + 16 字符）

副作用：被 scrub 后的文本仍保留经验/教训本身的可读性，只换敏感值。

## Specific anchors (judge 必须在 trace 里看到)

- redactor.ts 的 `PATTERNS` 数组 + Luhn-checked CC 包含上述 5 类全部模式
- redactor.test.ts 对每个公开类别至少 1 个 test 覆盖
- 当按 `docs/plans/docs--features--pii-redaction--run-judge/judge.md` 跑 judge playbook 时（live 或 simulated），`judge.json` 满足
  `vitest_fail_count == 0` 且 `leaked_pii_count == 0`
- AWS key 的 ASIA/ABIA 前缀也被识别（不仅 AKIA）
- credit card 的 Luhn 检查避免普通 13–19 位数字误判

## Counter-examples (judge 必须在 trace 里看不到)

- 普通经验文本（"Use fetch instead of axios"）不触发 redaction
- 普通大写字符串（"DEPLOYMENT_OK_PROD_ENV12345678"）不被误判 aws-key
- credit card 模式没通过 Luhn 时不 redact

## AskUserQuestion answers (composer 阶段消歧记录)

- **Q (deferred, self-resolved)**: PRODUCT-FEATURES.md 写 5 类
  公开 SUPPORT，但实现里有 10 类（额外: email / generic-secret /
  uuid / private-ip / internal-host / private-path）。GOAL 锚点
  应只测 5 类还是 10 类？

  **A**: 锚点用公开 5 类（PRODUCT-FEATURES.md 视角）；额外 5 类
  作为 bonus coverage，不影响 PASS 判定。理由：dogfood best-effort
  口径下，验证「公开承诺成立」即可，bonus coverage 可在未来 GOAL
  refinement 时挪到 anchor。

## Notes for verifier

- **RUN harness**: follow `docs/plans/docs--features--pii-redaction--run-judge/judge.md`
  （mechanical, machine-readable, 输出 `.judge/pii/<run_id>/judge.json`）
  [archived: `docs/legacy/judge-scripts/docs/features/pii-redaction/run-judge.sh`]
- For verify-canned-answer checks: follow `docs/plans/docs--features--pii-redaction--verify-canned-answer/judge.md`
  [archived: `docs/legacy/judge-scripts/docs/features/pii-redaction/verify-canned-answer.sh`]
- worktree `node_modules` 缺失时走 code-frozen attestation：
  - 读 redactor.ts `PATTERNS` 数组确认 5 类全在
  - 读 redactor.test.ts 确认每类至少 1 test
  - 引 c08b8fa commit 历史（首次 4/6 leak → 后续 fix → 现在 0 leak）作为 audit trail
- 实跑 harness 需要 `pnpm install` + `pnpm vitest`
