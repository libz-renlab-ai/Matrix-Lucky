# TeamAgent 系统技术文档: 4. 数据流全链路

Source index: [SYSTEM.md](../SYSTEM.md)

## 4. 数据流全链路

**场景：用户纠正 AI，系统学习并在下次自动避坑**

```
① 用户使用 Claude Code 开发
   AI 提交一个工具调用（如 Bash: npm install moment）
   ↓
② PreToolUse Hook 触发
   文件: packages/cli/src/bin-pre-tool-use.ts
   - 读 stdin: { tool_name: "Bash", tool_input: { command: "npm install moment" }, ... }
   - 加载 DualLayerStore（project + global 两个 DB）
   - 调用 matchRulesAsync() [packages/core/src/matcher/match.ts]
   - 若命中规则（如"用 dayjs 替代 moment"）→ 返回 permissionDecision="deny"
   - 若未命中 → 返回 {} (允许通过)
   ↓
③ 工具执行（可能被阻断或通过）
   ↓
④ PostToolUse Hook 触发
   文件: packages/cli/src/bin-post-tool-use.ts
   - 读 stdin: { ...PreToolUseInput, tool_response: { ... } }
   - createPostToolUseHandler [packages/adapters/src/hook/claude-agent-sdk/post-tool-use-sdk.ts]
   - 把 hook-post.result 事件写入 ~/.teamagent/events.db
   ↓
⑤ 用户发现问题，手动纠正 AI（或 AI 被 override）
   这是"纠正时刻"——最高价值的学习信号
   ↓
⑥ 会话结束，Stop Hook 触发
   文件: packages/cli/src/bin-stop.ts
   流水线: runStopPipeline()
     Step 1 - analyze [packages/cli/src/commands/analyze.ts]
       - 读会话日志 transcript_path (JSONL)
       - CorrectionDetector [packages/core/src/correction-detector/rule-based.ts]
         检测纠正时刻：显式否定词/多次失败后成功/用户 override 等信号
       - SuccessDetector [packages/core/src/success-detector/rule-based.ts]
         检测成功信号：一次成功/用户表扬/重复使用等
       - 若检测到纠正时刻且 --commit 模式：
         调用 LLM 提取知识 [packages/core/src/extractor/llm-based.ts]
         - 构建 prompt [packages/core/src/extractor/prompt.ts]
         - spawn claude -p (本机 Claude Code) 提取结构化 KnowledgeEntry
         - 写入 {project}/.teamagent/knowledge.db
     Step 2 - calibrate [packages/cli/src/commands/calibrate.ts]
       - 读 events.db 中的历史 hook 命中记录
       - 调用 CalibratorV2 [packages/core/src/calibrator/v2/index.ts]
         - 用 Wilson Score 算法重算 confidence
         - 更新 Tier（hysteresis 防抖）
         - 累积 Demerit（被忽略则扣分，指数衰减）
       - 写回 knowledge.db
     Step 3 - compile [packages/cli/src/commands/compile.ts]
       - 读所有 active 知识条目
       - scoreEntry() [packages/core/src/scorer.ts] 对所有条目打分
         score = confidence×0.4 + hit_count归一化×0.3 + recency×0.2 + enforcement_weight×0.1
       - 选 Top 15 写入 CLAUDE.md 的 TEAMAGENT:START/END 区块
       - 同时生成 Agent Skill 文件（stable+ 级别的知识）
   ↓
⑦ 下次会话开始
   Claude Code 读取 CLAUDE.md → AI 从第一句话起就带着更新后的经验
   用户再提 moment 相关问题 → PreToolUse Hook 命中规则 → 阻断
   "同一个人不需要纠正第二次"
```

---
