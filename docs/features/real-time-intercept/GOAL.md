---
feature_id: 3
feature_name: AI warned before repeating known mistake
owner: LiuShiyuMath
sources:
  product_features_md: docs/PRODUCT-FEATURES.md line 30
  prs: [68]
  issues: []
  related_docs:
    - docs/features/real-time-intercept.md
    - docs/features/real-time-intercept/canned-answer-snippet.md
    - docs/features/real-time-intercept/verify-canned-answer.sh
    - packages/cli/src/commands/e2e-evaluate.ts        # runtime — kind composition lives here (4 positive / 3 generalization / 4 negative)
    - packages/cli/src/__tests__/e2e-evaluate.test.ts  # asserts metrics; only mocks 2 fake probes — does NOT enumerate kind composition
last_composed: 2026-05-08
---

# GOAL: AI 重蹈覆辙前预警

## Product language (no tech stack)

团队曾踩过的坑被记入经验库后，AI 再要做同样的动作时，
系统应在它真正动手前一拍拦下来：

- 高置信度 + 客观规则 → 阻止 (deny)
- 低置信度 / 主观规则 → 警告 (warn) 但不阻止
- 干净动作 → 静默放行 (passive)

可见效果：positive 类 probe 全部命中、negative 类 probe 全部静默。

## Specific anchors (judge 必须在 trace 里看到)

- positive 类 probe 全部触发 (`positiveTriggerRate == 1.0`)
- 触发 decision ∈ {deny, warn}（不能是 passive）
- decision message 含规则匹配信息（rule_id 或 reason 文本）

## Counter-examples (judge 必须在 trace 里看不到)

- negative 类 probe 静默通过 (`falsePositiveRate == 0.0`)
- 干净 tool_input 触发 deny/warn

## AskUserQuestion answers (composer 阶段消歧记录)

- **Q (deferred, self-resolved per dogfood mode)**:
  subjective rule 触发 warn-only 算不算 PASS？
  PRODUCT-FEATURES.md 写「wrong moves blocked」但
  `computeEnforcement` 对 subjective 永远封顶 warn。

  **A**: 算 PASS。
  理由：PRODUCT-FEATURES.md 双路描述（warned + blocked）涵盖这两种情形；
  当前 implementation 是 deliberate design（避免主观偏好直接挡 AI）。
  若未来需严格区分，加 sub-anchor `positiveProbe.decision == "deny"`。

## Notes for verifier

- RUN harness: `pnpm test packages/cli/src/__tests__/e2e-evaluate.test.ts`（产生
  `positiveTriggerRate` / `falsePositiveRate`）
- Canned-answer 路径不在本 GOAL 范围；该路由 `verify-canned-answer.sh` 单独负责
