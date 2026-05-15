# TeamAgent 系统技术文档: 10. Bug 修复历史（防止重踩）

Source index: [SYSTEM.md](../SYSTEM.md)

## 10. Bug 修复历史（防止重踩）

以下是近期修复的重要 Bug，记录于此防止重踩：

### Hook 路径反斜杠问题（Windows）
**问题**：`install-hook.ts` 写入的 hook command 路径用了 Windows 反斜杠（`C:\bzli\...`），在 Git Bash 环境下会被 bash 吞掉反斜杠，导致 Hook 无法启动。
**修复**：`toForwardSlash()` 函数把所有反斜杠转为正斜杠再写入 settings.local.json。
**文件**：`packages/cli/src/commands/install-hook.ts:63`

### Hook bundle 引用 jsdom 报错
**问题**：`bin-pre-tool-use.cjs` 打包时 tsup 尝试 bundle jsdom，但 jsdom 在 bundle 后找不到 `default-stylesheet.css`（模块加载时读取文件路径被破坏）。
**修复**：将 `jsdom` 加入 `external`，不打包进 bundle。
**文件**：`packages/cli/tsup.hook.config.ts:37`

### UserPromptSubmit hook 未声明 kind 导致 TS 编译失败
**问题**：向 `events.db` emit 新事件时，没有先在 `packages/types/src/persisted-event.ts` 的 `kind` 联合类型中添加新 kind 值，导致 TypeScript 编译报错。
**教训**：新事件 kind 必须先加类型，再 emit。`DEMERIT_KIND_TO_SOURCE` 等映射表也需同步更新。
**文件**：`packages/types/src/persisted-event.ts`

### Stop Hook session_id 缺失导致 analyze 跳过
**问题**：早期 Stop Hook 实现尝试用 `session_id` 精确匹配会话文件，但 hook input 不保证有 `session_id`，导致 analyze 总是 no-op。
**修复**：改用 `transcript_path` 直接定位会话文件，或用 5 分钟时间窗 + `tool_name` 匹配，接受 false positive 而不依赖 session_id。
**文件**：`packages/cli/src/bin-stop.ts`

---

*本文档基于代码截面生成，如代码变更请同步更新。*
