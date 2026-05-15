# TeamAgent 系统展示: 十四、已知限制（提前告诉用户避免被问翻）

Source index: [系统展示.md](../系统展示.md)

## 十四、已知限制（提前告诉用户避免被问翻）

| 限制 | 影响 | 缓解方案 |
|---|---|---|
| LLM 提取超时（analyze --commit 可能 30s+） | Stop Hook 嵌套超时风险 | `teamagent config stop-mode async` 切异步（用户端无感，但丢"学到 X 条"的提示）|
| Token 开销 +52% | 单会话成本上升 | 路线图中：按 tier 分层注入、更精准的 hook trigger |
| Windows vitest OOM | 测试必须顺序跑 | 强制 `fileParallelism: false`，已是稳定 workaround |
| sqlite-vec 平台支持 | 极少数 Linux 发行版 native binding 缺失 | 向量功能静默降级，其他功能正常 |
| `.cursorrules` 等其他工具格式尚未导入 | 用户迁移门槛 | importer 框架已做，只需扩 parser |

---
