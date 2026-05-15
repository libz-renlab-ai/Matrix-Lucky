# TeamAgent 系统展示: 十二、技术栈（2026 最成熟开源栈，零自研底层）

Source index: [系统展示.md](../系统展示.md)

## 十二、技术栈（2026 最成熟开源栈，零自研底层）

| 领域 | 选型 | 理由 |
|---|---|---|
| 存储 | **node:sqlite**（Node 22+ 内置）+ better-sqlite3 降级 | 零安装、本地优先 |
| 向量检索 | **sqlite-vec** | 和 SQLite 同一进程，无外部向量 DB |
| 嵌入模型 | **@xenova/transformers**（all-MiniLM-L6-v2, 384 维） | 纯 Node 本地推理，零 API |
| AST 解析 | **web-tree-sitter** (WASM) | 上下文感知匹配（跳过 comment / string） |
| Hook SDK | **@anthropic-ai/claude-agent-sdk** | 官方 SDK，shape 规范 |
| LLM 客户端 | spawn `claude -p` → Claude Code 订阅 Haiku / Sonnet | 复用用户已有订阅、零 API key |
| Token 计数 | **js-tiktoken** | 本地、精确 |
| Web 抓取 | **@mozilla/readability** + **rss-parser** (+ Firecrawl 可选) | 广覆盖 wiki 源 |
| 打包 | **tsup** | 单文件 CJS bundle，hook 可 spawn |
| 测试 | **vitest** + 契约测试套件 | 保证 Port 多实现一致 |

**原则**：只用 2026 仍在维护的主流库；所有 license 必须 MIT / Apache 2.0（禁 BSL / 商业限制）；本地优先，无云依赖即可跑。

---
