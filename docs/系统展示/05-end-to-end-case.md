# TeamAgent 系统展示: 五、端到端案例（看系统怎么运作）

Source index: [系统展示.md](../系统展示.md)

## 五、端到端案例（看系统怎么运作）

以真实 benchmark 任务 `001-moment-vs-dayjs` 为例——这条规则在系统里实际命中了 21 次以上（见命中频次 Top 3）。

```
① 用户：写一个用 moment 格式化日期的 TypeScript 函数
     ↓
② Claude Code 准备调用 Write 工具，写入 import moment from 'moment'
     ↓
③ PreToolUse Hook 触发（bin-pre-tool-use.cjs）
     - 读入 { tool_name: "Write", tool_input: { content: "...import moment..." } }
     - 从 SQLite 加载规则 → matchRulesAsync() 命中 "用 dayjs 替代 moment"
     - 规则 tier=canonical、enforcement=block
     - 返回 { permissionDecision: "deny", reason: "规则匹配 [block] 使用 dayjs 替代 moment（体积少 200KB）" }
     ↓
④ Claude Code 看到 deny，自动 pivot：改用 dayjs 重写
     ↓
⑤ PostToolUse Hook 记录
     - 本次 tool_use 的结果写入 events.db，kind = hook-post.result
     ↓
⑥ 会话结束，Stop Hook 触发 3 阶段流水线：
     analyze → 从 transcript 里检测到"AI 首次选了 moment，被 hook deny，改用 dayjs 后成功"
              这是一条"干预成功"观察
     calibrate → 该规则 +1 成功观察，Wilson LB 上界提升，confidence 上调 +0.06
     compile → 重新生成 CLAUDE.md 的 TEAMAGENT 区块（Top 15 条按 scoreEntry 排序）
     ↓
⑦ 下次任何新会话
     - Claude 从第一句话起就带着最新的 CLAUDE.md
     - 同一个坑永远不会再踩第二次
```

这条规则在自举报告里是**命中频次第一名**（28 次命中），**Confidence 提升第一名**（+0.10）——系统自己每次被 AI 成功采纳，自己给自己加分。

---
