# TeamAgent 系统技术文档: 7. Hook 系统详解

Source index: [SYSTEM.md](../SYSTEM.md)

## 7. Hook 系统详解

### Claude Code 如何触发 Hook

Claude Code 在触发 Hook 时，向注册的命令的 **stdin** 发送 JSON，等待该进程返回 stdout JSON 后继续。格式：

**PreToolUse stdin 示例：**
```json
{
  "session_id": "abc123",
  "hook_event_name": "PreToolUse",
  "cwd": "/path/to/project",
  "permission_mode": "default",
  "transcript_path": "/path/to/transcript.jsonl",
  "tool_name": "Bash",
  "tool_input": { "command": "npm install moment" },
  "tool_use_id": "toolu_xyz"
}
```

**Hook stdout 返回格式（HookOutput）：**
```json
{
  "continue": true,
  "hookSpecificOutput": {
    "hookEventName": "PreToolUse",
    "permissionDecision": "deny",
    "permissionDecisionReason": "teamagent: 规则匹配 [warn] 使用 dayjs 替代 moment"
  }
}
```

类型定义：`packages/types/src/hook-protocol.ts`

### 4 个 Hook 的职责详解

**PreToolUse** (`bin-pre-tool-use.cjs`)
- 匹配工具：`Bash|Write|Edit|WebFetch`
- 输入：`PreToolUseInput`
- 处理：加载知识库 → `matchRulesAsync()` → 若 enforcement=block 则 deny，若 warn 则注入警告
- 输出：`HookOutput`（deny 或带 additionalContext 的 allow）
- 超时：30 秒

**PostToolUse** (`bin-post-tool-use.cjs`)
- 匹配工具：`Bash|Write|Edit|WebFetch`
- 输入：`PostToolUseInput`（含 `tool_response`）
- 处理：将执行结果写入 `events.db` 作为 `hook-post.result` 事件
- 输出：空 `HookOutput`（不影响工作流）
- 超时：30 秒

**UserPromptSubmit** (`bin-user-prompt-submit.cjs`)
- 无 matcher（所有 prompt 触发）
- 输入：`{ prompt: string }`
- 处理：提取关键词 → XenovaEmbedder 生成 384 维向量 → sqlite-vec 相似度查询 → 返回相关 Wiki 条目的 tldr
- 输出：注入文本（写到 stdout，Claude Code 将其加入上下文）
- 超时：10 秒（有 5 秒内部超时保底）
- 冷却控制：同一条目 30 分钟内不重复注入，同一会话最多注入 15 次

**Stop** (`bin-stop.cjs`)
- 无 matcher
- 输入：`{ session_id, transcript_path, cwd, hook_event_name }`
- 处理：analyze → calibrate → compile 三阶段流水线（sync 模式等待完成，async 模式 detach 子进程立即返回）
- 超时：60 秒（流水线内部有 55 秒上限）
- 错误：写入 `~/.teamagent/stop-errors.log`，永远 exit 0

### Hook 错误处理原则

**所有 Hook 入口的顶层 catch 都必须 exit 0**，永不 exit 1 或 exit 2。原因：Hook 报错会阻断 Claude Code 的正常工作流，这是不可接受的。系统选择"宁可不拦截，也不能卡住用户"。错误写到 stderr（对用户可见但不阻断）或日志文件。

### 如何重新注册 Hook

```bash
pnpm teamagent install-hook
```

此命令写入 `{project}/.claude/settings.local.json`，幂等，重复执行无副作用。注册的命令格式为：
```
node C:/bzli/teamagent/packages/cli/dist/bin-pre-tool-use.cjs
```

（Windows 下路径用正斜杠，避免 bash 吞掉反斜杠）

如果修改了 Hook 代码，需要重新 build：
```bash
pnpm --filter @teamagent/cli build:hook
```

### tsup.hook.config.ts 为何独立

Hook bundle 与主 CLI bundle 使用不同配置，原因是 Hook 有特殊约束：

1. **必须是自包含单文件**：Hook 被 Claude Code 在 `%TEMP%` 目录 spawn，不在项目根，无法用 `npx tsx` 因为找不到 workspace 依赖
2. **格式必须是 CJS**：Node.js `--input-type` 在 spawn 场景下默认 CJS
3. **所有 workspace 依赖打包进去**：`noExternal: ["@teamagent/types", "@teamagent/ports", "@teamagent/core", "@teamagent/adapters", "zod"]`
4. **排除 native addon**：`external: ["sharp", "onnxruntime-node", "jsdom"]`——这些有 `.node` 二进制扩展，无法打包

文件：`packages/cli/tsup.hook.config.ts`

---
