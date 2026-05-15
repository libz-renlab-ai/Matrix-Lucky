# Tiered Dynamic Rule Injection + Meta-Principles Optimization

**Date:** 2026-04-27  
**Status:** Approved

---

## 问题陈述

当前 CLAUDE.md 静态加载 top-28 条规则（按置信度 + scoreEntry 排序），在 token 预算 3000 内截断。这个方式有三个问题：

1. **与上下文无关**：规则在会话开始时一次性确定，不随用户当前任务动态调整
2. **规则膨胀**：随着知识库增长，token 预算持续被稀释，每条规则曝光时长降低
3. **已读不再注入**：CLAUDE.md 在首 turn 读一次，后续 turn 中 AI 可能忘记早期内容

---

## 目标

- CLAUDE.md 退化为"人格层"：仅保留 4-8 条普适元原则，大幅瘦身
- 知识规则全部走动态语义检索，在 UserPromptSubmit 时按当前上下文注入最相关的规则
- 检索排名引入置信度权重，让校准系统的历史信号反映到注入优先级上

---

## 架构：四层上下文预算

```
Tier-0  CLAUDE.md（会话常量）
        8 条元原则，硬编码，永不轮换
        ~400 tokens，每次会话可见

Tier-1  UserPromptSubmit 首条 prompt（会话一次）
        embed(tech_stack) → 置信度加权 top-3
        ~200 tokens，仅首 turn 注入

Tier-2  UserPromptSubmit 每条 prompt（per-turn）
        embed(user_message) → 置信度加权 top-3
        排除 Tier-0/Tier-1 和近期注入，去重
        ~200 tokens/turn

Tier-3  PreToolUse（per-tool-call）
        语义 + 关键词匹配（现有，不改）
        block/warn/pass 决策
```

---

## 置信度加权排名

`semanticMatch` 当前只按 soft-AND score 排序。新增后处理步骤：

```
adjustedScore = softAndScore × confidenceWeight(rule)

confidenceWeight:
  archived           → 0 （不参与检索）
  experimental tier  → confidence × 0.5
  probation tier     → confidence × 0.7
  stable tier        → confidence × 0.9
  enforced / canonical / full tier → confidence × 1.0
```

实现为纯函数 `rerankByConfidence(matches: SemanticMatch[]): SemanticMatch[]`，位于 `packages/core/src/ranking/confidence-rank.ts`，不修改现有 `semanticMatch`。

---

## 会话去重机制

文件：`~/.teamagent/sessions/{sessionId}_session_injected.json`（字符串数组）

- **写入**：每次 UserPromptSubmit 完成注入后，append 本次注入的 rule ID
- **读取**：Tier-2 检索时排除已在列表中的规则
- **Tier-1** 同样写入列表（首 prompt 完成后追加）
- **生命周期**：随 session 消亡（Stop 完成后可清理，或 30 天后过期忽略）

---

## CLAUDE.md 编译变更

`compileMarkdownBlock` 新增 `presetOnly?: boolean` 选项：

```typescript
if (options.presetOnly) {
  filtered = entries.filter(e => e.source === 'preset' && e.status === 'active');
}
```

头部从「TeamAgent 经验（N 条）」改为「TeamAgent 元原则」。

`runCompile` 调用 `markdownCompiler` 时传入 `{ presetOnly: true }`。

---

## 元原则集（8 条）

### 保留（4 条）

| ID | 核心 |
|----|------|
| `preset-tdd-cycle` | 红→绿→重构，跑通再声明完成 |
| `preset-small-commits` | 一 commit 一概念，说 what+why |
| `preset-prefer-edit-over-create` | 优先编辑现有文件 |
| `preset-search-web-before-trusting-memory` | 新概念先 WebSearch（canonical） |

### 新增（4 条）

| ID | Trigger | Correct |
|----|---------|---------|
| `preset-audience-adaptive` | 向用户讲解技术系统/方案/分析结果时 | 先判断受众层级；非技术受众给功能骨架（做什么/为什么），技术受众再给实现细节；先结论后细节 |
| `preset-execute-not-analyze` | 收到明确执行类任务（修 bug、实现功能、多步工作流）时 | 执行完整序列到底；只在遇到不可逆操作或真正歧义时停下；不要在分析/汇报层等待确认 |
| `preset-read-before-asserting` | 即将断言某文件/功能不存在，或声称「计划文档还没实现」时 | 先 Read 用户指向的路径，以实际文件内容为准；不要凭印象断言存在性 |
| `preset-full-pipeline-for-complex` | 面对多组件、多阶段的复杂新功能或系统改造时 | 调研 → brainstorm+需求确认 → 设计文档 → 实现计划 → 执行；不得跳过前期设计直接写代码 |

### 降级（2 条，保留在 knowledge DB 但不再是 preset）

- `preset-pitfall-cli`：过于 TeamAgent 内部，变为普通 knowledge rule
- `preset-prefer-gstack-tooling`：工具偏好，变为普通 knowledge rule

---

## 新增文件

| 文件 | 职责 |
|------|------|
| `packages/core/src/ranking/confidence-rank.ts` | 置信度权重计算 + 后处理重排 |
| `packages/cli/src/session-rule-injected.ts` | 会话注入 ID 追踪（read/append） |
| `packages/cli/src/user-prompt-rule-retriever.ts` | Tier-1/2 检索入口，返回格式化注入文本 |

## 修改文件

| 文件 | 变更 |
|------|------|
| `packages/core/src/init/meta-principles.ts` | 替换为 8 条新元原则 |
| `packages/core/src/compiler/markdown.ts` | 新增 `presetOnly` 选项 |
| `packages/core/src/index.ts` | 导出 `rerankByConfidence` |
| `packages/cli/src/bin-user-prompt-submit.ts` | 接入 rule retriever |

---

## 不变更范围

- PreToolUse 语义匹配逻辑：不动
- Stop pipeline 学习/校准流程：不动
- Calibrator 置信度调整逻辑：不动（retriever 直接读最新 confidence，自动反映）
- Events DB 结构：不动
