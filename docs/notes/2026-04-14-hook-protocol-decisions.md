# Hook 协议决策记录

> 日期: 2026-04-14 (M2 Day 1)
> 来源: Claude Code 官方文档调研 (claude-code-guide skill)

## 协议关键事实

- **stdin schema** 比 plan v1.2 假设的丰富——含 `cwd / permission_mode / transcript_path / tool_use_id / hook_event_name / agent_id / agent_type`。
- **拦截方式有两种**：
  1. `exit 2` + `stderr` 短文本（最简单，stderr 显示给用户和 AI）
  2. `exit 0` + JSON `{hookSpecificOutput: {permissionDecision: "deny", permissionDecisionReason: "..."}}`
- **可注入给 AI 的反馈通道**：
  - `systemMessage`（顶层）→ Claude 看到的提示
  - `hookSpecificOutput.additionalContext` → 在允许执行的同时给 AI 额外上下文
- **可修改工具输入**：`hookSpecificOutput.updatedInput`（PreToolUse 适用；Phase 2 可用）
- **stdout 大小限制**: ≤10000 字符（超出会被存到文件并显示路径引用）
- **超时**: command 默认 600s，远超我们的 50ms 目标

## TeamAgent 选择

| 场景 | 实现 |
|------|------|
| 完全通过（无命中） | `exit 0` + 空 stdout |
| 命中 enforcement=block（高置信） | `exit 0` + `{hookSpecificOutput: {permissionDecision: "deny", permissionDecisionReason: <归因>}}` |
| 命中 enforcement=warn（中置信） | `exit 0` + `{systemMessage: <归因>, hookSpecificOutput: {permissionDecision: "allow", additionalContext: <correct_pattern>}}` |
| Hook 内部异常（store 损坏等） | `exit 0` + 空——**永不阻断用户**，错误写到 events.jsonl 留痕 |

**为什么不用 exit 2 / stderr 路线**：
- JSON 路线表达力强（systemMessage / additionalContext / updatedInput 全在一个返回值里）
- exit 2 的 stderr 会显示给用户，但格式不可控；JSON 路线由 Claude Code 标准化展示
- 决策原子性更强——一次性传完所有信息

## 跨平台注意

- Windows + Git Bash 下，stdin 是纯 UTF-8 无 BOM
- settings.json 的 `command` 路径用正向斜杠
- 用 `"$CLAUDE_PROJECT_DIR"` 引用项目根（带双引号防止空格破裂）

## 注册示例（M2 Commit 4 的 install-hook 会写入此格式）

```json
{
  "hooks": {
    "PreToolUse": [{
      "matcher": "Bash|Write|Edit",
      "hooks": [{
        "type": "command",
        "command": "node \"$CLAUDE_PROJECT_DIR/.teamagent/hooks/pre-tool-use.cjs\"",
        "timeout": 30
      }]
    }]
  }
}
```

注意：
- `matcher` 是 tool 名（不是 path 模式）。`*` = 全部
- `command` 必须是单个可执行串。Phase 1 用 `node` + 绝对路径方式调用编译后的 hook 脚本
- timeout 30s 对本地匹配绰绰有余（目标延迟 < 50ms）

## 待 M2 Commit 4 落地

- `teamagent install-hook`: 写入上述配置到 `.claude/settings.json`
- `teamagent uninstall-hook`: 移除该配置块
- 编译 `pre-tool-use.ts` → `.teamagent/hooks/pre-tool-use.cjs`（CommonJS 单文件，避免运行时依赖 pnpm/tsx）
