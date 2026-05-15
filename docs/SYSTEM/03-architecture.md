# TeamAgent 系统技术文档: 3. 系统架构图

Source index: [SYSTEM.md](../SYSTEM.md)

## 3. 系统架构图

### Packages 依赖层次

```
┌──────────────────────────────────────────────────────┐
│                    @teamagent/cli                     │
│   bin.ts — CLI 入口（所有命令）                        │
│   bin-pre-tool-use.ts  ──────────────────────────┐   │
│   bin-post-tool-use.ts ──────── Hook 入口 ────┐  │   │
│   bin-user-prompt-submit.ts                   │  │   │
│   bin-stop.ts                                 ↓  ↓   │
└─────────────────┬──────────────────────────────────-─┘
                  │ imports
                  ↓
┌─────────────────────────────────────────────────────┐
│                  @teamagent/adapters                  │
│   DualLayerStore    SqliteKnowledgeStore             │
│   SqliteEventLog    MarkdownCompiler                 │
│   ClaudeCodeLLMClient  WikiPipeline                  │
│   createPreToolUseHandler  createPostToolUseHandler  │
└─────────────────┬────────────────────────────────────┘
                  │ implements ports, uses core
                  ↓
┌──────────────────────────────────────────────────────┐
│                   @teamagent/core                     │
│   scorer.ts          ← 知识优先级评分（纯函数）         │
│   matcher/           ← 规则匹配（纯函数）               │
│   calibrator/v2/     ← Tier/Demerit/Wilson（纯函数）   │
│   extractor/         ← LLM 提取 prompt 生成            │
│   correction-detector/ ← 纠正时刻识别                  │
│   success-detector/  ← 成功信号识别                    │
│   pipeline/          ← extract/calibrate/compile 流水线│
│   wiki/              ← WikiEntry 过滤/构建              │
│   wiki-injection/    ← Inline Wiki 注入格式化           │
└─────────────────┬────────────────────────────────────┘
                  │ implements
                  ↓
┌─────────────────────────────────────────────────────┐
│                   @teamagent/ports                    │
│   KnowledgeStore  Compiler  Matcher  Calibrator      │
│   CorrectionDetector  SuccessDetector  LLMClient     │
│   AttributionBus  Renderer  WikiSource  WikiEmbedder  │
│   __tests__/*-contract.ts  ← 契约测试套件             │
└─────────────────┬────────────────────────────────────┘
                  │ types only
                  ↓
┌─────────────────────────────────────────────────────┐
│                   @teamagent/types                    │
│   KnowledgeEntry  Scope  Evidence                    │
│   HookProtocol  Attribution  SessionLog  PersistedEvent│
└─────────────────────────────────────────────────────┘
```

### 4 个 Hook 的位置

```
Claude Code 运行时
│
├── UserPromptSubmit ──→ bin-user-prompt-submit.cjs
│   用户按下 Enter 时                 ↓
│                          keyword extract → embed → sqlite-vec
│                          → 注入 Wiki 相关知识到上下文
│
├── PreToolUse ──────→ bin-pre-tool-use.cjs
│   AI 调用工具之前                   ↓
│                          DualLayerStore.findActive()
│                          → matchRulesAsync() → 阻断或注入警告
│
├── PostToolUse ─────→ bin-post-tool-use.cjs
│   工具执行完成后                    ↓
│                          createPostToolUseHandler
│                          → 记录 hook-post.result 事件到 events.db
│
└── Stop ────────────→ bin-stop.cjs
    会话结束时                        ↓
                          analyze → calibrate → compile
                          （自动更新 knowledge.db + CLAUDE.md）
```

### 数据库物理位置

```
~/ (用户 Home 目录)
└── .teamagent/
    ├── global.db          ← scope.level=global 的知识条目
    ├── events.db          ← hook 命中事件、校准事件（append-only）
    └── stop-errors.log    ← Stop Hook 流水线异常日志

{project}/ (Git 仓库根目录)
└── .teamagent/
    └── knowledge.db       ← scope.level=personal 的知识条目
                             + wiki_meta（前沿知识元数据）
                             + rule_candidates（候选规则队列）
                             + knowledge_vec（向量嵌入，sqlite-vec）

.claude/
└── settings.local.json    ← Hook 注册配置（不入 git）
```

---
