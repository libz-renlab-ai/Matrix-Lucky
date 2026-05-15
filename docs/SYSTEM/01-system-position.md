# TeamAgent 系统技术文档: 1. 系统定位

Source index: [SYSTEM.md](../SYSTEM.md)

## 1. 系统定位

TeamAgent 是一个**团队 AI 自进化引擎**，以 Claude Code Hooks 为核心嵌入点，无感地运行在每个开发者的工作流背后。它解决的核心问题是：**开发者踩过的坑，AI 下次会自动避开；团队成员的经验，自动流入所有人的 AI**。不同于 CLAUDE.md 这种手写维护的静态规则文件，TeamAgent 的知识库是活的——通过纠正时刻检测、置信度校准、Tier 晋升/降级等机制，知识会随使用自动进化。当前处于 Phase 1（个人层核心），Phase 2~4 将依次引入 MCP Server 实时顾问、团队层共享、互联网层知识。

---
