# TeamAgent 系统技术文档: 9. 当前已知限制和 TODO

Source index: [SYSTEM.md](../SYSTEM.md)

## 9. 当前已知限制和 TODO

### LLM 提取超时问题

`teamagent analyze --commit` 会 spawn 本机 `claude -p` 进行知识提取，在 Claude Code 会话**内部**调用时存在嵌套超时问题：外层 Stop Hook 有 55 秒总超时，而 LLM 提取本身可能需要 10~30 秒，在复杂会话日志下容易超时导致提取不完整。

**当前缓解方案**：`config stop-mode async` 切换为异步模式（Stop Hook 立即返回，后台继续执行），但异步模式下用户看不到分析完成的提示。

**根本解决**（设计中）：SP-2 Benchmark 将建立完整的端到端测量基础，为后续优化提供依据。

### MCP Server 未实现

设计文档（`docs/specs/2026-04-13-teamagent-design.md`，第四章）中，MCP Server 是"实时顾问"（帮助方式 ②）的核心实现，提供 `check_pitfall`/`get_best_practice`/`report_correction`/`get_stats` 4 个工具。

当前 Phase 1 的 PreToolUse Hook 提供了有限的本地规则匹配（相当于简化版 `check_pitfall`），但 AI 无法在**思考过程中**主动查询知识库。MCP Server 计划在 Phase 2 上线。

### Team Sharing 未完整实现

本地 `scope.level=team` 已可写入 project DB，并能通过 review/stats 独立读取和统计。未完成的是跨机器团队共享：git transport、隐私脱敏、审核门、冲突仲裁和自动同步仍在后续阶段。

### Session Monitor 未实现

设计文档第五章描述了 Session Monitor 旁路进程，用于检测 AI 连续失败、打转、作用域突变等行为模式并注入警告。当前 Phase 1 未实现，计划 Phase 2 上线。

### 其他已知问题

- **Windows 下 vitest 并发 OOM**：`vitest.config.ts` 强制 `fileParallelism: false`，测试顺序运行。不要开并发。
- **sqlite-vec 可选依赖**：若 `sqlite-vec` native binding 不可用，向量检索功能静默降级（wiki 注入功能不可用），不报错。
- **`knowledge_vec` 虚表创建时机**：必须在 `sqlite-vec` extension 加载后，schema.ts `openDb()` 里处理，而非在 `INIT_SQL` 静态 DDL 里（详见 schema.ts 注释）。

---
