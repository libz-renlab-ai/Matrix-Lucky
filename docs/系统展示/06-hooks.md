# TeamAgent 系统展示: 六、4 个 Hook——系统的"神经末梢"

Source index: [系统展示.md](../系统展示.md)

## 六、4 个 Hook——系统的"神经末梢"

TeamAgent 完全依靠 Claude Code 的 Hook 机制嵌入。注册 4 个 hook：

| Hook | 触发时机 | 职责 | 超时 |
|---|---|---|---|
| **PreToolUse** | AI 调用 Bash/Write/Edit 之前 | **实时拦截**：匹配规则 → deny/warn | 30s |
| **PostToolUse** | 工具执行完成后 | **回传反馈**：把结果写 events.db 供 Calibrator 学习 | 30s |
| **UserPromptSubmit** | 用户每次回车时 | **主动注入**：从 wiki 知识库做语义匹配，注入最新前沿知识到上下文 | 10s |
| **Stop** | 会话结束时 | **自动学习**：跑 analyze→calibrate→compile 三阶段流水线 | 60s |

### 设计铁律

Hook 入口的顶层 catch **永远 `exit 0`**，永不 `exit 1` 或阻断 Claude Code 工作流——错误写到日志，"宁可不拦截也不能卡用户"。这一条是系统在真实用户场景下能活下来的底线。

---
