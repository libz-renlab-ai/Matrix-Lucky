# TeamAgent 系统技术文档: 5. 目录结构解析

Source index: [SYSTEM.md](../SYSTEM.md)

## 5. 目录结构解析

```
packages/
├── types/                    ← 共享类型层，无任何 IO
│   └── src/
│       ├── knowledge-entry.ts  ⭐ KnowledgeEntry + computeEnforcement 核心类型
│       ├── hook-protocol.ts    ⭐ PreToolUseInput / PostToolUseInput / HookOutput
│       ├── attribution.ts      AttributionEvent / VisibilityMode
│       ├── session-log.ts      解析 ~/.claude/ 会话日志的类型
│       └── persisted-event.ts  events.db 存储的事件 kind 联合类型
│
├── ports/                    ← 接口层（Port 契约），无实现
│   └── src/
│       ├── knowledge-store.ts  KnowledgeStore Port 接口
│       ├── attribution-bus.ts  AttributionBus Port 接口
│       ├── calibrator-v2.ts    CalibratorV2 Port 接口
│       ├── wiki-retriever.ts   WikiRetriever Port 接口
│       └── __tests__/*-contract.ts  ⭐ 所有 Port 的契约测试套件
│
├── core/                     ← 业务逻辑层（禁止 IO）
│   └── src/
│       ├── scorer.ts           ⭐ 知识优先级评分公式（纯函数）
│       ├── matcher/
│       │   ├── match.ts        ⭐ 规则匹配主逻辑（含 AST 上下文增强）
│       │   └── keyword-matcher.ts  关键词粗筛
│       ├── calibrator/v2/
│       │   ├── tier.ts         ⭐ Tier 晋升/降级逻辑
│       │   ├── demerit.ts      ⭐ Demerit 计算（驾照扣分制）
│       │   ├── wilson.ts       Wilson Score 置信区间算法
│       │   └── hysteresis.ts   Tier 变更防抖（迟滞）
│       ├── correction-detector/
│       │   └── rule-based.ts   ⭐ 纠正时刻识别（多信号融合）
│       ├── success-detector/
│       │   └── rule-based.ts   成功信号识别
│       ├── extractor/
│       │   ├── llm-based.ts    ⭐ LLM 知识提取器（调用 Claude Code）
│       │   └── prompt.ts       提取 prompt 模板
│       ├── importer/
│       │   ├── claude-md-parser.ts  解析已有 CLAUDE.md → 知识条目
│       │   └── cursor-rules-parser.ts  解析 .cursorrules
│       ├── pipeline/
│       │   ├── extract-pipeline.ts    ⭐ analyze 命令流水线
│       │   ├── calibration-pipeline-v2.ts  ⭐ calibrate 命令流水线
│       │   └── compile-pipeline.ts    ⭐ compile 命令流水线
│       ├── wiki/               Wiki 来源过滤 / 条目构建
│       ├── wiki-injection/     ⭐ UserPromptSubmit 注入格式化逻辑
│       └── compiler/
│           ├── markdown.ts     CLAUDE.md 编译器（纯函数）
│           └── agent-skill.ts  Agent Skill 编译器（纯函数）
│
├── adapters/                 ← 实现层（含 IO，实现 ports 接口）
│   └── src/
│       ├── storage/sqlite/
│       │   ├── schema.ts       ⭐ SQLite DDL + migration（openDb 幂等）
│       │   ├── dual-layer-store.ts  ⭐ 双层存储路由
│       │   ├── sqlite-knowledge-store.ts  单 DB 的知识 CRUD
│       │   ├── sqlite-event-log.ts  events.db 写入/读取
│       │   ├── sqlite-wiki-retriever.ts  ⭐ sqlite-vec 向量检索
│       │   └── wiki-store.ts   wiki_meta 表 CRUD
│       ├── hook/claude-agent-sdk/
│       │   ├── pre-tool-use-sdk.ts   ⭐ PreToolUse handler 工厂
│       │   └── post-tool-use-sdk.ts  ⭐ PostToolUse handler 工厂
│       ├── compiler/
│       │   └── markdown-compiler.ts  把 markdown.ts 纯函数 + 文件写入组合
│       ├── llm/
│       │   └── claude-code-client.ts  ⭐ spawn claude -p 的 LLM 客户端
│       ├── wiki/
│       │   ├── xenova-embedder.ts     ⭐ @xenova/transformers 384 维嵌入
│       │   ├── haiku-judge.ts         用 claude-haiku 判断 wiki 条目价值
│       │   └── wiki-pipeline.ts       ⭐ wiki:pull 完整流水线
│       └── attribution/
│           ├── in-memory-bus.ts    测试用 AttributionBus
│           └── stdout-renderer.ts  终端输出 Renderer
│
└── cli/                      ← 入口层
    └── src/
        ├── bin.ts              ⭐ CLI 总入口（所有命令路由）
        ├── bin-pre-tool-use.ts  ⭐ PreToolUse Hook 入口
        ├── bin-post-tool-use.ts ⭐ PostToolUse Hook 入口
        ├── bin-user-prompt-submit.ts  ⭐ UserPromptSubmit Hook 入口
        ├── bin-stop.ts          ⭐ Stop Hook 入口（analyze+calibrate+compile 流水线）
        ├── commands/
        │   ├── install-hook.ts  ⭐ Hook 注册逻辑（写 settings.local.json）
        │   ├── analyze.ts       analyze 命令实现
        │   ├── calibrate.ts     calibrate 命令实现
        │   ├── compile.ts       compile 命令实现
        │   ├── pitfall.ts       pitfall 命令实现（手动录入踩坑）
        │   ├── stats.ts         stats 命令实现
        │   ├── wiki.ts          wiki:* 命令路由
        │   └── ingest.ts        ingest 命令实现（多源摄入）
        ├── tsup.config.ts       CLI 主包打包配置
        └── tsup.hook.config.ts  ⭐ Hook 专用打包配置（自包含 .cjs）
```

---
