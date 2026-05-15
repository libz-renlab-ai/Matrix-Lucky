```
        __
   <(o )___    GOAL = 5 路 context 合流 + AskUserQuestion 消歧
    ( ._> /
     `---'
```

# GOAL-COMPOSER — 把 5 路 context 合成 GOAL.md

主 agent 在 [RUN-VERIFY-LOOP](RUN-VERIFY-LOOP.md) Step 1 调用本流程。
产出 `docs/features/<name>/GOAL.md`，供 JUDGE / META-JUDGE 使用。

## 5 路 context 来源（**必须全部读**）

| 来源 | 抓取方式 | 信号类型 |
|---|---|---|
| `docs/PRODUCT-FEATURES.md` 对应行 | 按 feature_id 行号定位 | 产品定义 + evidence 路径 |
| 引入 PR(s) | `gh pr view <n> --json title,body,commits` | 实现意图 + 验收讨论 |
| 引入 commit(s)（**fallback**：legacy / 直接合 main 的 feature） | `git show <sha>` 抓 commit message | 当 PR 号无法干净映射时使用 `commits: [<sha>, ...]` 字段 |
| 关联 issue(s) | PR body 里 `Refs #<i>` / `Closes #<i>` 提取 → `gh issue view` | 用户痛点 + 原始需求 |
| Feature owner | PR `--json author` + commit `git log --author` | 决策权人；歧义找他 |
| `docs/features/<name>/` 旁路 docs | `ls docs/features/<name>/` 全读 | 实现细节 + 已有 anti-probe |
| `docs/features/<name>.md` 主文档 | `Read docs/features/<name>.md`（注意：**file 和 dir 同名共存是项目常见模式**，不是冲突） | 总览、架构图、状态表、verify 命令 |

## Composer 工作流

```
   1. 主 agent 读 5 路 context（并行 fetch）
              ↓
   2. 草拟 GOAL.md
              ↓
   3. 自检歧义（见下方清单）
              ↓
   4. 每个歧义 → AskUserQuestion(...)
              ↓
   5. 用户答案合入 GOAL.md
              ↓
   6. 写 docs/features/<name>/GOAL.md
              ↓
   7. owner 写进 frontmatter（META-JUDGE 出
      STUCK_DESIGN_FLAW 时主 agent 据此 ping）
```

## 歧义清单（**触发 AskUserQuestion 的固定模式**）

主 agent 草拟 GOAL.md 后**必须**逐项检查：

1. **Warn vs Block 不一致** — PRODUCT-FEATURES.md 写 "warned"，PR 写 "blocked"，GOAL 到底写哪个？
2. **Specific anchor 缺失** — 「装 moment 时被警告」没说 "warning 必须含 'moment' 字样"——要不要加 anchor？
3. **Counter-example 范围** — 「lodash 不应触发」是真不该（lodash 不在 seed pack），还是该但需补 rule？
4. **Owner 多人** — PR 是 A 提的，最近 fix 是 B 改的——歧义时找谁？
5. **PRODUCT-FEATURES.md 与 PR 描述冲突** — 哪个是 source of truth？

每条歧义都用 `AskUserQuestion` 单独问，**不要默认猜**。

## GOAL.md 模板

```markdown
---
feature_id: 3
feature_name: AI warned before repeating known mistake
owner: <github_handle>
sources:
  product_features_md: line 30
  prs: [#71, #88]                   # 优先；可读 gh pr view 拿 body
  # commits: [<sha1>, <sha2>]       # fallback when feature pre-dates clean PR mapping
  issues: [#85]
  related_docs: [docs/features/real-time-intercept.md]
last_composed: 2026-05-07
---

# GOAL: AI 重蹈覆辙前预警

## Product language (no tech stack)
鸭鸭打算装 `moment` 这种已知坑包时，AI 收到 warning，
看到 warning 后就改用别的库。

## Specific anchors (judge 必须在 trace 里看到)
- statusline 含 "moment"
- 触发的 rule 文案明显冲着 moment（不是泛 npm 警告）

## Counter-examples (judge 必须在 trace 里看不到)
- 装 `react` 时不应触发
- 装 `lodash` 时不应触发（不在 seed pack 里）

## AskUserQuestion answers (composer 阶段消歧记录)
- Q: warn vs block? A: warn-only, 不阻止 npm 真的跑
- Q: anchor 严格度? A: rule_id 包含 "moment" substring 即可
```

## 联动

- 上游：[RUN-VERIFY-LOOP](RUN-VERIFY-LOOP.md) Step 1
- 下游：[META-JUDGE](META-JUDGE.md) 读 `goal` 字段
