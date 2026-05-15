# TeamAgent Phase 1 实现计划

> 版本: 1.2 | 日期: 2026-04-14 | 依据: 设计文档 v5.1 (`docs/specs/2026-04-13-teamagent-design.md`)

---

## 一、开发原则

系统必须同时满足以下 7 条原则，任何 Milestone 违反其中任一条都视为 Milestone 未完成：

1. **Walking Skeleton First（Cockburn）** — M0 即端到端贯通，后续每个 Milestone 是"替换一个 Fake 为真实实现"或"加一个新边界 Adapter"，不是"堆功能"。
2. **Ports & Adapters（Hexagonal）** — 核心域不认识文件系统、LLM、Claude Code。它只认识端口接口。文件 IO、LLM 调用、Hook stdin/stdout 都是 adapter。
3. **Functional Core, Imperative Shell** — Matcher / Detector / Extractor / Compiler 的核心逻辑是纯函数；所有副作用被推到边界层。
4. **Strategy Pattern 让实现可替换** — 同一个 Port 可以有多个策略实现（例如 `CorrectionDetector` 有规则版、LLM 版、混合版），Milestone 之间通过替换策略推进。
5. **TDD** — 先写测试（会失败）→ 实现 → 通过 → Commit。核心域测试易写（纯函数），Adapter 做集成测试。
6. **归因可见（AttributionBus）** — 组件不直接 `console.log`。所有用户可见的"系统帮你做了什么"通过结构化事件发到 AttributionBus，由统一的 Renderer 渲染（smart / silent / verbose 三种模式，对齐 spec v5.1）。
7. **自举（Dogfood）** — 从 M1 起，TeamAgent 仓库自己接入 TeamAgent。每个 Milestone 的"DoD"必须包含一个"自举切入"步骤——本 Milestone 的能力要在开发 teamagent 项目自身的过程中被真实使用。

---

## 二、架构：Ports & Adapters

### 分层

```
┌──────────────────────────────────────────────────────┐
│               Adapters (边界层)                      │
│   CLI / Hook / SessionSource (~/.claude/)            │
│   Filesystem / LLM / Git                             │
└─────────────┬────────────────────────────▲───────────┘
              │ 调用 Port                  │ 事件上报
              ▼                            │
┌──────────────────────────────────────────────────────┐
│            Core (核心域，纯函数为主)                 │
│   Matcher / CorrectionDetector / SuccessDetector /   │
│   KnowledgeExtractor / Compiler / Calibrator /       │
│   Retriever / Pipeline                               │
└──────────────────────────────────────────────────────┘
              │ 依赖注入                   ▲
              ▼                            │
┌──────────────────────────────────────────────────────┐
│             Ports (接口契约)                         │
│   KnowledgeStore / Compiler<T> / LLMClient /         │
│   SessionSource / AttributionBus / Renderer          │
└──────────────────────────────────────────────────────┘
```

### 核心 Port 清单（M0 定义，后续不改）

| Port | 职责 | 代表方法签名 |
|------|------|-------------|
| `KnowledgeStore` | 知识的增删改查 | `add / update / getById / query / getAll` |
| `Compiler<T>` | 知识 → 目标格式 | `compile(entries): T` |
| `CorrectionDetector` | 会话 → 纠正时刻 | `detect(session): CorrectionMoment[]` |
| `SuccessDetector` | 会话 → 成功信号 | `detect(session): SuccessSignal[]` |
| `KnowledgeExtractor` | LLM 结构化提取 | `extract(input, callLLM): Promise<Partial<KnowledgeEntry> \| null>` |
| `Retriever` | 知识检索 | `query(ctx): KnowledgeEntry[]` |
| `Matcher` | 工具调用 → 命中规则 | `match(toolCall, rules): KnowledgeEntry[]` |
| `SessionSource` | 会话日志的来源 | `listRecent / loadById` |
| `LLMClient` | LLM 调用 | `complete(prompt): Promise<string>` |
| `AttributionBus` | 事件总线 | `emit / subscribe` |
| `Renderer` | 事件 → 用户可见文本 | `render(events, mode): string` |
| `RuleImporter` | 文本规则 → 结构化知识 | `import(filepath): Promise<KnowledgeEntry[]>` |

共 **12 个 Port**（原计划 11，Detector 拆为 Correction/Success 两个后变 12）。

### Adapter 清单（Milestone 逐步加入）

| Adapter | 实现 Port | 引入 Milestone |
|---------|-----------|----------------|
| `InMemoryKnowledgeStore` | KnowledgeStore (Fake) | M0 |
| `JsonlKnowledgeStore` | KnowledgeStore (Real) | M1 |
| `MarkdownCompiler` | Compiler<string> | M1 |
| `StdoutRenderer` | Renderer | M0 (basic), M1 (refined) |
| `ClaudeCodeHookAdapter` | —（是入口而非 Port 实现）| M2 |
| `ClaudeSessionSource` | SessionSource | M3 |
| `ClaudeCodeLLMClient` | LLMClient（默认）| M4 |
| `AnthropicLLMClient` | LLMClient（可选，Phase 2 或需要时）| — |
| `ClaudeMdRuleImporter` | RuleImporter | M5 |
| `GitTeamSync` | —（Phase 3，Phase 1 不做）| — |

---

## 三、归因总线 AttributionBus 规范（M0 定义，全 Milestone 遵守）

### Event 结构

```ts
interface AttributionEvent {
  source: 'pitfall' | 'compiler' | 'hook-pre' | 'hook-post'
        | 'detector' | 'extractor' | 'importer' | 'init'
        | 'calibrator' | 'scenario-runner';
  action: string;                // '添加知识条目' / '拦截工具调用' / ...
  target?: { id?: string; file?: string; count?: number };
  before?: unknown;              // 可选，变更前状态快照
  after?: unknown;               // 可选，变更后状态快照
  userFacingValue?: string;      // '下次遇到 X 会改用 Y'
  counterfactual?: string;       // '没有 TeamAgent 你会 Z'
  severity: 'info' | 'highlight' | 'warning';
  timestamp: string;             // ISO
}
```

### 三种渲染模式（对齐 spec v5.1）

| 模式 | 显示 info | 显示 highlight | 显示 warning | 显示 counterfactual | 附加事件 JSON | 适用场景 |
|------|-----------|----------------|-------------|---------------------|:-:|---------|
| `silent` |   |   |   |   | | 用户追求极致无感 |
| `smart`（默认）|   | ✓ | ✓ |   | | 日常使用 |
| `verbose` | ✓ | ✓ | ✓ | ✓ | ✓ | 用户想看系统运作细节（含调试场景）|

开发调试时使用 `verbose` 模式；环境变量 `TEAMAGENT_DEBUG=1` 额外打开详细 trace log（单独的 logger，不经 AttributionBus）。

### 归因块输出格式（smart / verbose）

```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
✨ TeamAgent · 本次操作归因
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
▸ 做了什么: 添加知识条目 rule-abc123
▸ 知识库变化: 15 → 16 条 (personal/C/api-hallucination)
▸ 传播到: CLAUDE.md 第 32 行
▸ 下次体验: AI 遇到 "stripe.charges" 时会改用 "paymentIntents"
▸ 如果没有 TeamAgent: 你会看到 AI 第二次踩同一个坑
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```

最后一行"如果没有 TeamAgent"仅 verbose 模式出现。silent 模式整块不显示。verbose 模式末尾附加原始 JSON 事件数组。

---

## 四、Milestone 路线总览

| # | Milestone | 性质 | 替换/新增 | 能体验 |
|---|-----------|------|----------|--------|
| **M0** | Walking Skeleton | 贯通 | 所有 Port + Fake 实现 + AttributionBus + Renderer | `teamagent skeleton-demo` 端到端跑出归因块，骨架就位 |
| **M1** | 真实存储与编译 | 换 adapter | JsonlStore / MarkdownCompiler / pitfall/stats CLI | 录一条知识 → CLAUDE.md 真的被注入 |
| **M2** | Hook 入口 | 加 adapter | ClaudeCodeHookAdapter (PreToolUse) + Matcher 策略 | Claude Code 执行违规命令时被真实拦截 |
| **M3** | 感知通道 | 加 adapter | ClaudeSessionSource + 规则版 Detector | `analyze` 列出识别到的纠正时刻（dry-run） |
| **M4** | 自动提取 | 换策略 | ClaudeCodeLLMClient + LLM 版 Extractor + Pipeline | 纠正 → 自动入库 → 下次同类被拦（完整自动闭环）|
| **M5** | 安装闭环 | 加 adapter | ClaudeMdRuleImporter + Init orchestrator | `npx teamagent init` 对新项目一键接入，带上已有规则 |
| **M6** | 反馈回路 | 加 adapter+策略 | PostToolUse Hook + ConfidenceCalibrator | 规则被用多次→confidence 上升；override→下降 |
| **M7** | 验证套件 | 加工具 | ScenarioRunner + 验证 fixture | `teamagent verify` 输出 PRR/KP 报告 |

**Phase 1 明确不做**（留给 Phase 2）：MCP Server、Session Monitor 旁路进程、本地嵌入模型、知识衰减引擎、/teamagent override/rules。

### Milestone 组件依赖关系

```
M0  types / ports / Fake adapters / AttributionBus / Renderer  (基石)
 │
 ├─→ M1  JsonlStore ─┬─ MarkdownCompiler (读/写 CLAUDE.md)
 │                   └─ pitfall CLI / stats CLI
 │
 ├─→ M2  Matcher (core) ─── PreToolUse Hook (复用 M1 的 Store)
 │                              └─ events.jsonl schema (M6 复用)
 │
 ├─→ M3  ClaudeSessionSource ─── CorrectionDetector / SuccessDetector
 │                                  └─ analyze CLI (dry-run，复用 M1 Store)
 │
 ├─→ M4  ClaudeCodeLLMClient ─── Extractor (core)
 │           └─ Pipeline（组合 M3 detector + M4 extractor + M1 store + M1 compiler）
 │
 ├─→ M5  RuleImporter ─── Init orchestrator
 │           组合: M1 store + M1 compiler + M2 hook 注册 + M4 extractor (结构化导入)
 │
 ├─→ M6  PostToolUse Hook (消费 M2 events.jsonl)
 │           └─ Calibrator → 更新 M1 store
 │
 └─→ M7  ScenarioRunner
             组合: 几乎所有前置 Milestone，端到端跑场景
```

每个 Milestone 只依赖箭头指向的前置 Milestone。并行可能性有限——推荐严格顺序推进。

---

## 五、目录结构

```
teamagent/
├── package.json                       # pnpm workspace root
├── pnpm-workspace.yaml
├── tsconfig.base.json
├── vitest.config.ts
├── CLAUDE.md                          # 从 M1 起含 TEAMAGENT 区块
│
├── packages/
│   ├── types/                         # 共享类型（无业务逻辑）
│   │   └── src/
│   │       ├── knowledge-entry.ts     # KnowledgeEntry schema (zod)
│   │       ├── session-log.ts         # Claude Code JSONL 类型
│   │       ├── attribution.ts         # AttributionEvent 类型
│   │       └── config.ts
│   │
│   ├── ports/                         # 接口契约（无实现）
│   │   └── src/
│   │       ├── knowledge-store.ts
│   │       ├── compiler.ts
│   │       ├── correction-detector.ts
│   │       ├── success-detector.ts
│   │       ├── extractor.ts
│   │       ├── retriever.ts
│   │       ├── matcher.ts
│   │       ├── session-source.ts
│   │       ├── llm-client.ts
│   │       ├── attribution-bus.ts
│   │       ├── renderer.ts
│   │       └── rule-importer.ts
│   │
│   ├── core/                          # 核心域（纯函数）
│   │   └── src/
│   │       ├── matcher/
│   │       ├── correction-detector/
│   │       ├── success-detector/
│   │       ├── extractor/
│   │       ├── compiler/              # MarkdownCompiler 纯函数
│   │       ├── retriever/
│   │       ├── calibrator/
│   │       ├── pipeline/              # 组合上面的 pure functions
│   │       └── scorer.ts
│   │
│   ├── adapters/                      # 边界实现
│   │   └── src/
│   │       ├── storage/
│   │       │   ├── in-memory-store.ts      # M0
│   │       │   └── jsonl-store.ts          # M1
│   │       ├── attribution/
│   │       │   ├── in-memory-bus.ts        # M0
│   │       │   └── stdout-renderer.ts      # M0/M1
│   │       ├── session-source/
│   │       │   └── claude-session-source.ts # M3
│   │       ├── llm/
│   │       │   └── claude-code-client.ts   # M4 默认（spawn `claude -p`）
│   │       │   # anthropic-client.ts       # 可选，Phase 2 或需要时再加
│   │       ├── importer/
│   │       │   ├── claude-md-importer.ts   # M5
│   │       │   └── cursor-rules-importer.ts # M5
│   │       └── hook/
│   │           ├── pre-tool-use.ts         # M2
│   │           └── post-tool-use.ts        # M6
│   │
│   ├── cli/                           # CLI 入口，组装 core + adapter
│   │   └── src/
│   │       ├── bin.ts
│   │       ├── commands/
│   │       │   ├── skeleton-demo.ts   # M0
│   │       │   ├── pitfall.ts         # M1
│   │       │   ├── stats.ts           # M1
│   │       │   ├── analyze.ts         # M3, M4
│   │       │   ├── init.ts            # M5
│   │       │   └── verify.ts          # M7
│   │       └── container.ts           # 依赖组装（DI）
│   │
│   └── skills/                        # Claude Code skill 命令文件
│       ├── pitfall.md                 # M1
│       ├── teamagent-stats.md         # M1
│       └── teamagent-analyze.md       # M3
│
├── knowledge-packs/
│   └── meta-principles.jsonl          # M1（4 条）
│
├── fixtures/
│   ├── sessions/                      # M3
│   └── scenarios/                     # M7
│
└── docs/
    ├── specs/
    │   └── 2026-04-13-teamagent-design.md
    └── dogfood/                       # M7.pre 生成
        └── 自举报告.md
```

---

## 六、Milestone 详细

> 每个 Milestone 结构: **目标 / DoD / 架构增量 / 测试先行 / 端到端验证路径 / 实现任务 / 自举切入 / Commit 节奏**

---

### Milestone 0: Walking Skeleton

**目标**: 把所有核心 Port 定义好，提供每个 Port 的 Fake 实现，贯通一条"录入→编译→归因"的内存回路。后续每个 Milestone 替换其中一个 Fake 为真实实现。

**能体验什么**: 运行 `pnpm teamagent skeleton-demo` 会看到内存里模拟的"添加一条知识 → 编译成 CLAUDE.md 片段 → 打印归因块"的完整过程，和真实 M1 的外观几乎一致，只是数据在内存里。

**架构增量**:
- Port 接口全部定义完成（12 个 port）
- Fake 实现: `InMemoryKnowledgeStore` / `InMemoryAttributionBus` / `InMemoryCompiler`（调用 core 的纯函数）
- 核心域: `scorer.ts` / 最小的 `compiler/markdown.ts` 纯函数
- CLI: `skeleton-demo` 命令，演示端到端
- AttributionBus + Renderer（`StdoutRenderer` v0）

**DoD**:
- [ ] 12 个 Port 接口定义完成、有 JSDoc、类型被 `tsc --noEmit` 接受
- [ ] 每个 Port 至少有一个 Fake/内存实现
- [ ] `pnpm test` 全绿，覆盖 Port 契约测试 + Renderer 快照测试
- [ ] `pnpm teamagent skeleton-demo` 输出包含归因块
- [ ] 归因块格式和本计划"三、归因总线"章节一致
- [ ] 自举切入已完成（见下方）

**测试先行清单**:
- [ ] `ports/__tests__/contracts.test.ts` — 为每个 Port 定义"契约测试套件"（传入任意实现都该通过），Fake 先通过这套契约
- [ ] `core/scorer.test.ts` — 纯函数，边界值、归一化
- [ ] `adapters/attribution/stdout-renderer.test.ts` — 快照测试每种模式输出
- [ ] `cli/__tests__/skeleton-demo.test.ts` — 子进程运行 CLI，检查 stdout 含"归因块"标识

**端到端验证路径**:
```bash
pnpm install
pnpm build
pnpm teamagent skeleton-demo
# 预期输出（smart 模式，默认）：
#   ━━━━━━━━━━━━━━━━━━━━━━━━━━━━
#   ✨ TeamAgent · 本次操作归因
#   ━━━━━━━━━━━━━━━━━━━━━━━━━━━━
#   ▸ 做了什么: [skeleton] 添加模拟知识 + 模拟编译
#   ▸ 知识库变化: 0 → 1 条
#   ▸ 传播到: (内存中) 3 行 markdown
#   ━━━━━━━━━━━━━━━━━━━━━━━━━━━━

# 切换渲染模式
TEAMAGENT_VISIBILITY=verbose pnpm teamagent skeleton-demo   # 多输出 counterfactual + 附加原始 event JSON
TEAMAGENT_VISIBILITY=silent pnpm teamagent skeleton-demo    # 无任何输出（所有信息走 Bus 被 Renderer 吞掉）
```

注意：skeleton-demo 内部的所有"系统做了什么"信息都通过 AttributionBus 发 event；**没有任何直接 console.log**。`silent` 模式下系统完全无声——这是原则 6 的强制落地。

**实现任务**（按 TDD 顺序）:

1. **脚手架** — 初始化 pnpm workspace、tsconfig、vitest、tsup；创建 `packages/types` `packages/ports` `packages/core` `packages/adapters` `packages/cli` 五个包
2. **定义 types** — KnowledgeEntry schema (zod) / ParsedSession / AttributionEvent / VisibilityMode
3. **定义 ports** — 12 个 Port 接口文件，每个写 JSDoc
4. **实现 Fake adapters** — InMemoryKnowledgeStore / InMemoryAttributionBus / StdoutRenderer
5. **实现 core 函数** — `scorer.ts`（从设计文档的评分公式转换）/ `compiler/markdown.ts`（最小能产出 `<!-- TEAMAGENT:START --> ...` 的纯函数）
6. **契约测试** — `ports/__tests__/contracts.test.ts`，为每个 Port 写"任何实现都该通过"的测试
7. **CLI skeleton-demo** — 组装 Fake store + core compiler + in-memory bus + stdout renderer，跑一次端到端
8. **视觉检查归因块** — 人工对照设计规范检查输出格式

**自举切入**:
- 统一 commit message 格式："feat(m{N}): <主体>"，让 Milestone 产出在 git 历史里可溯
- 在 teamagent 仓库根创建或追加 `CLAUDE.md`，写下第一条元约束："**开发过程中任何新的 Port 必须先写契约测试再实现 Fake**"
- M0 阶段不引入 TEAMAGENT:START/END 区块，M1 第一次真实编译时由 Compiler 首次注入

**Commit 节奏**:
- Commit 1: 脚手架 — package.json / pnpm-workspace.yaml / tsconfig.base.json / vitest.config.ts / tsup / .gitignore / .editorconfig；创建 5 个 workspace package 目录
- Commit 2: types 包（KnowledgeEntry schema / ParsedSession / AttributionEvent / VisibilityMode）
- Commit 3: ports 包（12 个接口 + JSDoc）
- Commit 4: contracts.test.ts + Fake adapters 通过契约
- Commit 5: core/scorer + core/compiler/markdown 纯函数 + 测试
- Commit 6: AttributionBus + StdoutRenderer + 快照测试
- Commit 7: CLI skeleton-demo + E2E 测试
- Commit 8: CLAUDE.md 追加第一条元约束（人工写，不经 TEAMAGENT 区块）

---

### Milestone 1: 真实存储与编译

**目标**: 把 M0 的两个 Fake（InMemoryStore、InMemoryCompiler）换成真实实现；增加 `/pitfall` 和 `/teamagent stats` 两个 CLI 命令。从此刻起，TeamAgent 可以在自己的仓库里被 dogfood。

**能体验什么**:
1. `pnpm teamagent pitfall`（交互式）录入一条知识 → 写进 `~/.teamagent/personal/knowledge.jsonl` → `CLAUDE.md` 的 TEAMAGENT 区块自动更新
2. 下一次开 Claude Code 时，AI 的 prompt 里已含这条知识
3. `pnpm teamagent stats` 终端显示当前知识库统计

**架构增量**:
- **换 adapter**: `JsonlKnowledgeStore` 替换 Fake（实现 `KnowledgeStore` Port）
- **换 adapter**: `MarkdownCompiler` 从 core 层变为 adapter（因为要 IO—写文件），纯函数仍在 core，adapter 只管读写 `CLAUDE.md`
- **加 adapter**: CLI commands `pitfall` / `stats`
- **精化 AttributionBus**: 真实发 `pitfall.added` / `compiler.updated` 事件
- **精化 Renderer**: smart 模式样式定稿（对照设计规范）

**DoD**:
- [ ] JsonlKnowledgeStore 通过 M0 写好的 KnowledgeStore 契约测试（无改动契约）
- [ ] MarkdownCompiler adapter 能读改写真实 `CLAUDE.md`，保留用户在 TEAMAGENT 区块外的内容
- [ ] `pitfall` 命令交互录入 → 写盘 → 触发编译 → 渲染归因块
- [ ] `stats` 命令展示 "总数 / 按 category 分布 / Top 5 高频 / 最近 5 条新增"
- [ ] 归因块包含 **counterfactual**（"如果没有 TeamAgent 你会..."）
- [ ] 自举切入完成：teamagent 仓库自己的 CLAUDE.md 已经通过 pitfall 加入至少 3 条真实开发中的坑
- [ ] `pnpm test` 全绿，JSONL 读写含 fsync/并发安全测试

**测试先行清单**:
- [ ] `adapters/storage/jsonl-store.test.ts` — 通过 KnowledgeStore 契约 + 额外的 IO 失败/损坏文件恢复测试
- [ ] `core/compiler/markdown.test.ts` — 纯函数：给定 entries 和旧 CLAUDE.md，输出新 CLAUDE.md；测边界（空知识库、超过 50 行预算、用户区块保留）
- [ ] `adapters/compiler/markdown-adapter.test.ts` — IO 版：真实临时目录读写
- [ ] `cli/__tests__/pitfall.test.ts` — 模拟 stdin 输入，检查文件落盘和归因输出
- [ ] `cli/__tests__/stats.test.ts` — 构造知识库状态，验证 stats 输出

**端到端验证路径**:
```bash
# 清零状态
rm -rf ~/.teamagent

# 录入第一条知识（交互式）
pnpm teamagent pitfall
# 问：什么情况下会触发？  答：npm install moment
# 问：错误的做法？         答：moment
# 问：正确的做法？         答：dayjs
# 问：为什么？             答：moment 已停止维护
# 预期输出归因块：
#   ▸ 做了什么: 添加知识条目 pers-xxx (E/tech-choice)
#   ▸ 知识库变化: 0 → 1 条
#   ▸ 传播到: ~/.teamagent/personal/knowledge.jsonl / CLAUDE.md 第 N 行
#   ▸ 下次体验: AI 遇到 "npm install moment" 时会改用 dayjs

# 查看状态
pnpm teamagent stats
# 预期: 总数 1 / E:1 / Top 1: ...

# 检查 CLAUDE.md
grep -A 5 "TEAMAGENT:START" CLAUDE.md
```

**实现任务**:

1. **JsonlKnowledgeStore** — 实现 load/persist/CRUD/query，解决并发写（用 lock file 或 fs.renameSync 原子替换）
2. **MarkdownCompiler core** — 纯函数，复用设计文档"编译策略"
3. **MarkdownCompiler adapter** — 包装 core 函数，负责读写实际 `CLAUDE.md`
4. **pitfall 命令** — 交互式 prompt（用 `@inquirer/prompts` 或简单 readline）+ 写 store + 触发编译
5. **stats 命令** — 读 store，格式化输出
6. **AttributionBus 精化** — event 类型真实化，Renderer smart 模式出具最终格式
7. **Skill 文件** — `packages/skills/pitfall.md` 和 `teamagent-stats.md`。这些是给 Claude Code 读的 skill 定义文件（用户在 Claude Code 里打 `/pitfall` 时触发），其内容只是指示 AI 调用底层 CLI：执行 `pnpm teamagent pitfall`（或 init 阶段被复制到 `.claude/commands/` 后，skill 直接 exec CLI 二进制）。**Skill 是入口，CLI 是真正逻辑**——两者是入口→实现的关系，不重复实现业务

**自举切入**:
- 在 teamagent 仓库根运行一次 `pnpm teamagent pitfall`，录入第一条自己项目的开发约定，比如：
  - "新增 Port 时必须先写契约测试"
  - "Hook 脚本严禁 console.log（会污染 hook stdin/stdout 协议）"
  - "core/ 目录内禁止 import fs（保持纯函数）"
- 接下来几天使用 Claude Code 写 M2 代码时，AI 会在 CLAUDE.md 里看到这些约定
- M1 的 Commit 最后一个包含 `CLAUDE.md` 更新为证据

**Commit 节奏**:
- Commit 1: JsonlKnowledgeStore + 契约测试通过
- Commit 2: core/compiler/markdown 纯函数 + 测试
- Commit 3: Compiler adapter + 保留用户区块的集成测试
- Commit 4: AttributionBus event 定义 + Renderer smart 格式定稿
- Commit 5: pitfall CLI 实现 + 测试（全绿）
- Commit 6: stats CLI + skill 文件（pitfall.md / teamagent-stats.md）
- Commit 7: 自举录入—在 teamagent 仓库运行 pitfall 录入至少 3 条项目约定（改动 `~/.teamagent/personal/knowledge.jsonl` + `CLAUDE.md`）。此 commit 仅含 CLAUDE.md 更新和开发笔记，是"系统首次被真实使用"的历史证据

---

### Milestone 2: Hook 入口（第一次真正拦截）

**目标**: 让 Claude Code 在执行工具调用前询问 TeamAgent。Hook 匹配到规则时拦截或警告。这是"安全护栏"帮助方式的落地。

**能体验什么**:
1. 手动在 teamagent 仓库的 `.claude/settings.json` 注册 TeamAgent hook
2. 让 Claude Code 执行一个命中 M1 录入的规则的命令，比如 `npm install moment`
3. Hook 返回 block/warn，Claude Code 真的不执行或改用替代方案
4. 归因块告诉我们"已拦截 X，原本会 Y，改用 Z"

**架构增量**:
- **加 core**: `matcher/keyword-matcher.ts` 纯函数 — 输入 `{toolName, input}` + `rules[]`，输出命中的 rule 列表
- **加 adapter**: `adapters/hook/pre-tool-use.ts` — Claude Code hook 入口，读 stdin JSON → 调 matcher → 写 stdout JSON
- **加 adapter**: 离线模拟命令 `teamagent demo hook <tool> <json-input>`，用于开发时不用实际触发 Claude Code 也能测试
- **AttributionBus 新事件**: `hook-pre.matched` / `hook-pre.blocked` / `hook-pre.warned`

**DoD**:
- [ ] Hook 协议验证完成（见实现任务 step 0）
- [ ] keyword-matcher 纯函数通过契约测试（空规则、单命中、多命中、scope 过滤）
- [ ] Hook 延迟 < 50ms（在 Windows/Git Bash 上实测；纯本地匹配）
- [ ] `teamagent demo hook` 能离线模拟一次命中流程
- [ ] 真实 Claude Code 中测试：执行触发规则的命令，被真实拦截
- [ ] 归因块含 counterfactual（"如果没有 TeamAgent 你会执行 `npm install moment` 并装上已停止维护的库"）
- [ ] 自举切入：teamagent 仓库自己注册本 Hook（后续每次开发 teamagent 都会被自己的 Hook 守护）

**测试先行清单**:
- [ ] `core/matcher/keyword-matcher.test.ts` — 纯函数各种边界
- [ ] `adapters/hook/pre-tool-use.test.ts` — 子进程启动 hook 脚本，stdin 喂 JSON，检查 stdout JSON
- [ ] `cli/__tests__/demo-hook.test.ts` — 离线模拟
- [ ] 性能测试：100 条规则时 matcher 耗时 < 5ms

**端到端验证路径**:
```bash
# 前置：M1 录入的 moment→dayjs 规则已在知识库里

# 1. 离线模拟
pnpm teamagent demo hook Bash '{"command":"npm install moment"}'
# 预期：decision=block/warn, reason 含 dayjs，归因块

# 2. 注册到 Claude Code（在 teamagent 仓库自己）
pnpm teamagent install-hook  # 临时命令，M5 会整合进 init

# 3. 打开 Claude Code，让它尝试 npm install moment
# Claude Code 的 hook 机制会拦截，AI 自动改用 dayjs
# 用户看到 smart 模式归因块

# 4. 清理
pnpm teamagent uninstall-hook
```

**实现任务**:

0. **Hook 协议验证（Day 1 第一件事）** — 注册一个 echo hook，让它把真实收到的 stdin 内容 dump 到临时文件，在 Claude Code 里执行简单命令观察实际协议。修正 `adapters/hook/pre-tool-use.ts` 的输入输出类型以匹配实际协议
1. **keyword-matcher 纯函数** — 支持 wrong_pattern/trigger 关键词匹配、scope.file_types/paths 过滤、enforcement 聚合
2. **pre-tool-use adapter** — 启动时加载个人/项目/全局知识库（M1 已有 Store），执行 matcher，构造 hook 返回 JSON
3. **events.jsonl schema 一次定完**（M6 不再改）— 每行一个事件，包含完整字段：
   ```ts
   interface PersistedEvent {
     id: string;              // 事件唯一 id (uuid)
     intervention_id?: string; // Hook 拦截/建议的唯一 id，供 PostToolUse 关联
     kind: 'hook-pre.matched' | 'hook-pre.blocked' | 'hook-pre.warned'
         | 'hook-post.result' | 'pitfall.added' | ...;
     session_id?: string;     // Claude Code 会话 id
     knowledge_id?: string;   // 涉及的知识条目 id
     tool?: { name: string; input: Record<string, unknown> };
     result?: { succeeded: boolean; stderr?: string };
     timestamp: string;       // ISO 8601
     schema_version: 1;       // 写死 1，未来加字段通过可选项
   }
   ```
   Hook 每次匹配都发事件，即使 hook 自己的进程短命，也要把事件写到 `~/.teamagent/events.jsonl` 供 stats/Portal/Calibrator 消费。**M6 的 PostToolUse 和 Calibrator 直接复用此 schema 不修改结构。**
4. **demo hook CLI** — 本地开发用，绕过 Claude Code 直接测 hook 逻辑
5. **install-hook / uninstall-hook 临时 CLI** — 修改 `.claude/settings.json`。归属计划：
   - `install-hook`: M5 时并入 `teamagent init`，M5 后删除独立命令
   - `uninstall-hook`: M5 时并入 `teamagent uninstall` / `teamagent disable`，M5 后删除独立命令
   M2 期间这两个独立命令仅用于开发自测和自举
6. **性能测试** — 保证 <50ms

**自举切入**:
- `pnpm teamagent install-hook` 在 teamagent 仓库自身
- 录入（用 M1 的 pitfall）几条项目约定作为 block/warn 规则，例如：
  - 禁止在 `packages/core/` 下 import `fs`（wrong_pattern = `^import.*\"fs\"` + scope.paths = `packages/core/**`）
  - 禁止 `rm -rf` 通过 Hook 触达（wrong_pattern = `rm -rf`，enforcement = warn）
- 之后开发 M3 时，AI 如果尝试违反这些约定会被自己的 Hook 挡住 —— **这是产品有效性的第一次真实证明**

**Commit 节奏**:
- Commit 1: Hook 协议调查记录 + types 修正
- Commit 2: keyword-matcher core + 测试
- Commit 3: pre-tool-use adapter + 性能测试
- Commit 4: events.jsonl 落盘机制 + AttributionBus 增强
- Commit 5: demo hook + install-hook CLI
- Commit 6: 自举注册 + 补充几条项目规则到知识库

---

### Milestone 3: 感知通道（看见纠正时刻）

**目标**: 解析 Claude Code 的会话日志，识别纠正时刻和成功模式。只识别，不入库（入库要到 M4）。这让用户先验证识别准确率。

**能体验什么**:
1. 昨天纠正过 AI 的会话结束后，今早 `pnpm teamagent analyze`
2. 系统列出识别到的每个纠正时刻和成功信号
3. 用户可以对每条打勾/打叉反馈，数据进入识别器的回归测试集

**架构增量**:
- **加 adapter**: `ClaudeSessionSource` — 读 `~/.claude/projects/{project-id}/*.jsonl` 并解析成 `ParsedSession`
- **加 core**: `correction-detector/rule-based.ts`（多信号融合的规则版实现），纯函数
- **加 core**: `success-detector/rule-based.ts`，纯函数
- **加 adapter**: CLI `analyze` 命令（dry-run，不写知识库）
- **AttributionBus 新事件**: `detector.scanned` / `detector.corrections-found` / `detector.successes-found`

**DoD**:
- [ ] ClaudeSessionSource 能读取实际日志并转换为 ParsedSession（字段对齐设计文档）
- [ ] rule-based correction detector 覆盖设计文档"纠正时刻"表中的所有信号类型
- [ ] success detector 覆盖设计文档"成功信号"表
- [ ] 对一组人工标注的 20 段会话：纠正识别精确率 > 85%、召回率 > 70% **或** 如未达标，附 root-cause 分析（哪些信号漏识别、哪类误报）+ 下一步改进计划（可推进到 M4，改进项记入 tech debt）
- [ ] `analyze` 命令 dry-run 输出每条候选 + 置信度 + 支持信号
- [ ] 自举切入：用本 Milestone 实现自己的开发会话分析，得出"开发 M3 的过程中我纠正了 AI 多少次"的数据

**测试先行清单**:
- [ ] `adapters/session-source/claude-session-source.test.ts` — 用 fixture JSONL 测试解析
- [ ] `core/correction-detector/rule-based.test.ts` — 20 条 fixture 各触发对应信号
- [ ] `core/success-detector/rule-based.test.ts` — 同上
- [ ] `cli/__tests__/analyze-dry-run.test.ts` — 端到端

**端到端验证路径**:
```bash
# 用真实会话（昨天的开发会话）
pnpm teamagent analyze

# 或用 fixture
pnpm teamagent analyze --session fixtures/sessions/correction-explicit-deny.jsonl

# 预期输出:
#   扫描了 1 个会话，含 47 条 turn
#   ▸ 识别到纠正时刻 3 个 (显式否定 2, 失败重试 1)
#   ▸ 识别到成功信号 5 个 (一次成功 4, 显式表扬 1)
#   详情:
#   [1] turn 12 (显式否定, w=0.95): 用户 "不对，我们用 fetch 不用 axios"
#       AI 之前: 使用 axios 写 API 请求
#   [2] ...
#   ━━━━━━━━━━━━━━━━━━━━━━━━━━
#   归因块: 如要学习这些，加 --commit
```

**实现任务**:

1. **fixture 准备** — 放到 `fixtures/sessions/`。来源分三批：
   - **手工构造 10 条**：覆盖设计文档中每种纠正/成功信号权重的典型样本（开发 M3 时产出）
   - **M0-M2 开发期收集的真实会话**：至少 5 条脱敏版
   - **M3 上线后补充**：M3 开发完成后，每天开发 M4+ 时发现的 FP/FN 会被加入 fixture 作为回归样本
   M3 Milestone 完成时至少需要 20 条（含手工 10 + 真实 10）

   **脱敏规则**（真实会话入 fixture 前必过一遍）:
   - 删除：API keys / tokens / 绝对路径中的用户名（`/Users/xxx/` → `/Users/USER/`）/ 邮箱 / URL 里的敏感参数
   - 保留：消息结构（user / assistant / tool_use / tool_result）/ 工具名 / 命令形态 / 代码片段的结构
   - 替换：真实项目名和文件名可保留（对本项目开发而言不敏感），其他项目涉及的路径改占位符
   - 做法：手动扫一遍即可，不必写自动脱敏工具——脱敏工具本身也是 tech debt 的来源
2. **ClaudeSessionSource** — 读取 JSONL，处理版本差异，输出 `ParsedSession`
3. **correction-detector 纯函数** — 按信号权重表实现，返回含信号类型和权重的 `CorrectionMoment[]`
4. **success-detector 纯函数** — 同上
5. **analyze CLI dry-run** — 读 source → 调 detector → 渲染报告
6. **评测脚本** — 在 fixture 上计算 precision/recall；不达标时产出 root-cause 报告，允许继续 M4（记债务）

**自举切入**:
- 当天收工前跑 `pnpm teamagent analyze`（扫当天的开发会话）
- 把识别器的 false positive / false negative 手动录为 detector 的新测试 fixture
- 连续一周做下来，识别器就在自己的开发数据上迭代升级

**Commit 节奏**:
- Commit 1: fixture 会话 + 人工标注表
- Commit 2: ClaudeSessionSource + 测试
- Commit 3: correction-detector core + 测试
- Commit 4: success-detector core + 测试
- Commit 5: analyze CLI + 评测脚本
- Commit 6: 评测达标报告 + 自举切入记录

---

### Milestone 4: 自动提取（完整闭环自动运转）

**目标**: 引入 LLM 版 Extractor，把 M3 识别的纠正时刻自动结构化成知识条目；用 Pipeline 把 parser→detector→extractor→store→compiler 串成一条龙。`analyze --commit` 触发完整写入。

**能体验什么**:
1. 昨天我纠正了 AI 5 次
2. 今早 `pnpm teamagent analyze --commit`
3. 5 条新知识被提取进知识库，CLAUDE.md 自动更新
4. 今天开 Claude Code，AI 已知这 5 条经验

**架构增量**:
- **加 adapter**: `ClaudeCodeLLMClient` — spawn 本机 `claude -p "<prompt>" --output-format json` 进程，不需要 API Key（复用用户已有 Claude Code 订阅）。这是 Phase 1 唯一的 LLM adapter
- **架构自举**: TeamAgent 用 Claude Code 实现 Claude Code 的智能补强——反身性的美感
- **加 core**: `extractor/llm-based.ts`（实现 `KnowledgeExtractor` Port），纯函数（`callLLM` 通过依赖注入传入，便于 mock）
- **加 core**: `pipeline/extract-pipeline.ts` — 组合 detector + extractor + store.add + compiler.recompile
- **加 CLI**: `analyze --commit` 触发 pipeline
- **AttributionBus 新事件**: `extractor.extracted` / `pipeline.completed`

**DoD**:
- [ ] Extractor 纯函数签名：`(input, callLLM) => Promise<Partial<KnowledgeEntry> | null>`，callLLM 可注入。返回只含 LLM 能提取的字段（category / tags / type / nature / trigger / wrong_pattern / correct_pattern / reasoning），其余字段（id / confidence / enforcement / timestamps / evidence）由 Pipeline 补全
- [ ] Pipeline 编排器端到端测试（用 mock LLM 返回预定义 JSON）
- [ ] `analyze --commit` 把纠正转成知识条目 → 写入 store → 触发编译 → CLAUDE.md 更新
- [ ] 对 M3 的 20 段 fixture 执行 commit，输出知识条目人工评分均分 ≥ 3.5/5
- [ ] 归因块展示"从 N 次纠正学到 M 条知识，已注入到 K 处分发通道"
- [ ] 自举切入：系统已经"吃"到自己开发 M4 时的纠正数据

**测试先行清单**:
- [ ] `core/extractor/llm-based.test.ts` — mock LLM 返回各种 JSON 响应，测 parsing 鲁棒性（嵌入 markdown block、多余文本、格式错误）
- [ ] `core/pipeline/extract-pipeline.test.ts` — 端到端（mock LLM + in-memory store）
- [ ] `adapters/llm/claude-code-client.test.ts` — 集成测试（spawn 真实 `claude -p`；CI 跳过，本地手跑；同时 mock 版测 parsing 鲁棒性）
- [ ] Claude Code 可执行检测：`which claude` 找不到时友好报错并建议安装路径
- [ ] `cli/__tests__/analyze-commit.test.ts` — 真实 store / 真实 compiler / mock LLM

**端到端验证路径**:
```bash
# 清零
rm -rf ~/.teamagent/personal ~/.teamagent/sessions

# 手动纠正一次 AI（在 Claude Code 里让 AI 用 axios，然后说"不对用 fetch"）
# 结束会话

# 分析并提交
pnpm teamagent analyze --commit

# 预期:
# ▸ 识别 1 个纠正时刻
# ▸ LLM 提取: category=E/tech-choice, trigger=API调用方式选择, ...
# ▸ 知识库: 0 → 1 条
# ▸ CLAUDE.md: 已更新 (1 条新增)
# ▸ 下次体验: AI 提出 axios 方案时会先考虑 fetch

# 验证闭环
# 再开 Claude Code，让它写新的 API 请求
# 期望：AI 直接用 fetch（或在建议 axios 时提及 "TeamAgent 经验: 优先 fetch"）
```

**实现任务**:

1. **ClaudeCodeLLMClient** —
   - spawn `claude -p "<prompt>" --output-format json`（用 `node:child_process`）
   - stdout 解析出响应文本
   - 超时处理（默认 30s）、进程清理
   - `which claude` 或 `where claude` 做可执行检测，提供清晰错误
   - 错误类型：not-installed / timeout / non-zero-exit / unparseable-output
2. **Extraction prompt 模板** — 把设计文档"知识条目"字段做成 structured output prompt
3. **Extractor 纯函数** — 接受 callLLM 依赖，返回 `Partial<KnowledgeEntry> | null`（null = 提取失败）；Pipeline 补全剩余字段
4. **Parse 响应** — 多种鲁棒解析（直接 JSON / markdown code block / 含多余说明）
5. **Pipeline 编排** — 按"correction → extract → validate → store.add → compile"顺序；失败处理（LLM 返回异常的条目被跳过，AttributionBus 上报）
6. **analyze --commit CLI**
7. **人工评分工具** — `teamagent review`（简易 CLI）展示新增知识 + 允许打分进改进队列

**自举切入**:
- 开发 M4 过程中，每天收工跑一次 `analyze --commit`
- 一周后查看自己的知识库，记录前 10 条的质量
- 把低分条目作为 Extractor prompt 的反例补充进 prompt 测试

**Commit 节奏**:
- Commit 1: ClaudeCodeLLMClient + mock 测试 + 真实 spawn 集成测试（可跳过）
- Commit 2: Extraction prompt 模板
- Commit 3: Extractor 纯函数 + 响应解析
- Commit 4: Pipeline 编排 + 测试
- Commit 5: analyze --commit CLI + review CLI
- Commit 6: 自举切入记录 + prompt 优化

---

### Milestone 5: 安装闭环（新项目一键接入）

**目标**: 实现 `RuleImporter` 把 CLAUDE.md / .cursorrules 的文本规则转为结构化知识；用 `Init orchestrator` 把所有 adapter 组装成 `npx teamagent init` 一键流程。

**能体验什么**:
1. 拿一个已存在团队约定的新项目
2. `npx teamagent init`
3. 所有安装步骤一次完成
4. 立即用 Claude Code 开始工作，AI 已知团队约定

**架构增量**:
- **加 adapter**: `ClaudeMdRuleImporter` - 解析 CLAUDE.md 的 bullet 规则
- **加 adapter**: `CursorRulesImporter` - 解析 .cursorrules
- **加 core**: `importer/rule-structurer.ts` - 调 LLM 把每条文本规则转结构化（复用 M4 的 Extractor）
- **加 CLI**: `init` 命令（orchestrator，串 detect-stack + import + load meta-principles + install hooks + compile CLAUDE.md）
- **加 CLI**: `disable` / `enable` / `uninstall`

**DoD**:
- [ ] 给定含 CLAUDE.md 的测试项目：init 后所有规则被导入为 personal scope 知识
- [ ] 安装日志（由 AttributionBus 聚合）清晰列出每一步做了什么
- [ ] 归因块展示"加载元原则 N + 导入已有 M + 总共 K 条"
- [ ] disable/enable 可往返；uninstall 默认保留数据（需 `--delete-data` 才删）
- [ ] 自举切入：对 teamagent 仓库自身再跑一次 init（模拟新人加入团队），确认和之前手动搭的状态等价

**测试先行清单**:
- [ ] `core/importer/rule-structurer.test.ts` — mock LLM 测试文本→结构化
- [ ] `adapters/importer/claude-md-importer.test.ts` — 解析各种 bullet / numbered / 跳过 TEAMAGENT 区块
- [ ] `adapters/importer/cursor-rules-importer.test.ts` — .cursorrules 格式
- [ ] `cli/__tests__/init.test.ts` — 在临时目录端到端
- [ ] `cli/__tests__/disable-enable-uninstall.test.ts`

**端到端验证路径**:
```bash
# 对一个新项目（有 CLAUDE.md 里 5 条团队约定）
cd /path/to/fresh-project
npx teamagent init

# 预期输出:
# Step 1/7: 识别技术栈... TypeScript + React（仅记录，不影响加载）
# Step 2/7: 创建目录... ✓
# Step 3/7: 加载元原则... 4 条
# Step 4/7: 扫描已有规则... 发现 5 条 in CLAUDE.md
# Step 5/7: 结构化导入... ✓ 5/5 成功
# Step 6/7: 注册 Hook... ✓
# Step 7/7: 更新 CLAUDE.md... ✓
# ━━━━━━━━━━━━━━━━━━━━━━━━━━
# ✨ TeamAgent · 安装归因
# ▸ 做了什么: 完整安装到 /path/to/fresh-project
# ▸ 知识库: 0 → 9 条 (4 元原则 + 5 导入)
# ▸ 下次体验: 开 Claude Code，AI 已知这 9 条经验

# 验证
pnpm teamagent stats
# 应看到 9 条，source 分布: preset=4 / imported=5
```

**实现任务**:

1. **ClaudeMdRuleImporter** — 正则 + 行扫描，跳过 TEAMAGENT 区块
2. **CursorRulesImporter** — 类似
3. **Rule structurer** — 复用 M4 Extractor，prompt 改为"文本规则 → 结构化"
4. **detect-stack** — 从设计文档抄过来（仅日志用途）
5. **Init orchestrator** — 按 DoD 顺序串所有步骤。支持 `--dry-run`：只输出"会做什么"，不写任何文件，方便对新项目先看后装。失败处理策略是"**先检查后执行，能回滚就回滚，不能则报告残留状态**"：
   - **Phase A Pre-check**: 先做一遍所有前置检查（权限、已有的 .claude/settings.json 是否 parseable、CLAUDE.md 是否可写），任一失败直接退出不动任何文件
   - **Phase B 执行**: 顺序执行 8 步；每步成功后记录到 `~/.teamagent/.install-log`
   - **Phase C 失败处理**: 某步失败时，尽力回滚已执行的步骤（能回滚的：临时文件删除；难回滚的：settings.json 改动、CLAUDE.md 写入保留，通过 `.install-log` 报告给用户"以下步骤已生效、以下未生效，你可以 `teamagent uninstall` 清理"）
   不承诺原子性——这是文件系统操作的现实约束。诚实胜过吹嘘。
6. **disable/enable/uninstall** — 操作 `.claude/settings.json` 的 hooks 块（注释/取消注释）和 CLAUDE.md 区块

**自举切入**:
- 备份 teamagent 仓库当前的 `~/.teamagent/personal/knowledge.jsonl`
- 清空，重跑 `npx teamagent init`（把 teamagent 自己当新项目）
- 验证：之前手动录的规则 + CLAUDE.md 里的约定是否都被正确导入
- 如果有差异，说明 importer 或 init 有 bug

**Commit 节奏**:
- Commit 1: ClaudeMdRuleImporter + 测试
- Commit 2: CursorRulesImporter + 测试
- Commit 3: rule-structurer + mock LLM 测试
- Commit 4: detect-stack + 测试
- Commit 5: Init orchestrator + E2E 测试
- Commit 6: disable/enable/uninstall
- Commit 7: 自举：对 teamagent 仓库自身重跑 init 并记录结果

---

### Milestone 6: 反馈回路（知识自我修正）

**目标**: 加上 PostToolUse Hook 关联执行结果、intervention_id 端到端贯通、ConfidenceCalibrator 自动调整。这让知识库实现"好知识变强、坏知识淘汰"。

**能体验什么**:
1. 录入一条规则 "不要用 moment"
2. Claude Code 连续 5 次被 Hook 成功引导改用 dayjs（每次都没 override）
3. 一周后 `teamagent stats` 显示该规则 confidence: 0.70 → 0.95
4. 某次我手动 override 它（情境不合适）
5. stats 显示 confidence 降到 0.75

**架构增量**:
- **加 adapter**: `adapters/hook/post-tool-use.ts` — PostToolUse Hook，关联 intervention_id + 执行结果
- **加 core**: `calibrator/default.ts`（实现 ConfidenceCalibrator 的规则版），按设计文档置信度校准表
- **加 core**: `pipeline/calibration-pipeline.ts` — 周期性扫描 events.jsonl，触发 calibrator 更新 store
- **加 CLI**: `teamagent calibrate` 手动触发（也会被 analyze 自动调用）
- **AttributionBus 新事件**: `hook-post.recorded` / `calibrator.adjusted`

**DoD**:
- [ ] intervention_id 从 PreToolUse 生成 → PostToolUse 关联 → Calibrator 消费 端到端打通
- [ ] Calibrator 规则完全对齐设计文档"置信度校准"表
- [ ] 同一规则被成功应用 5 次后 confidence 上升；override 1 次后下降；均匹配预期公式
- [ ] stats 新增"本周 confidence 变化 top 5"模块
- [ ] 自举切入：开发 M6 过程中让 M2 注册的自身规则被真实触发/override 若干次，观察 confidence 随时间变化的曲线

**测试先行清单**:
- [ ] `core/calibrator/default.test.ts` — 表驱动测试，每种事件对应 delta
- [ ] `core/pipeline/calibration-pipeline.test.ts` — 给定 events.jsonl 和 store，验证更新后状态
- [ ] `adapters/hook/post-tool-use.test.ts` — 子进程 + stdin/stdout
- [ ] `cli/__tests__/calibrate.test.ts`

**端到端验证路径**:
```bash
# 前置：M5 已完成，teamagent 已装在 teamagent 自己的仓库

# 人为制造若干干预
# （在 Claude Code 里触发 M1 录入的 "禁 rm -rf" 规则 5 次，不 override）

pnpm teamagent calibrate
# 预期:
# ▸ 扫描 events.jsonl 最近 7 天
# ▸ 处理 intervention 5 个 (全部成功)
# ▸ 规则 rule-xxx: confidence 0.70 → 0.75 → 0.80 → 0.85 → 0.90

pnpm teamagent stats
# "本周 confidence 变化 top 5" 模块含该条记录
```

**实现任务**:

1. **PostToolUse Hook adapter** — 读 stdin 的 tool output，关联 intervention_id（M2 hook 写 events 时已含该 id）；复用 M2 已定的 events.jsonl schema（kind='hook-post.result'），不改结构
2. **Calibrator core** — 规则版，遍历 events，对每条知识算 delta，返回 patch
3. **calibration-pipeline** — 组合 store.update + events.jsonl 归档
4. **calibrate CLI** — 手动触发
5. **analyze 集成** — `analyze --commit` 末尾自动调 calibrate
6. **stats 增强** — top 5 confidence 变化模块

**自举切入**:
- 开发过程中故意在自己的仓库 override 一次自己录的规则，观察 confidence 真的下降
- 记录一周的规则价值变化，整理成附录供 M7 报告使用

**Commit 节奏**:
- Commit 1: PostToolUse Hook adapter（复用 M2 已定的 events.jsonl schema）
- Commit 2: Calibrator core + 表驱动测试
- Commit 3: calibration-pipeline + analyze 集成
- Commit 4: calibrate CLI + stats 增强
- Commit 5: 自举观察记录

---

### Milestone 7: 验证套件（系统测自己）

**目标**: 构造 5 个"有坑的任务"场景，用 `ScenarioRunner` 自动化跑完整闭环（踩坑→学习→避坑），输出 PRR/KP 量化报告。

**能体验什么**:
```bash
pnpm teamagent verify
# 10 分钟后看到一份报告，说明系统在哪些场景有效、哪些失败
```

**架构增量**:
- **加工具**: `packages/cli/src/commands/verify.ts` — `verify` CLI 入口
- **加工具**: `packages/cli/src/scenario/runner.ts` — ScenarioRunner，从 `fixtures/scenarios/` 读场景定义
- **加工具**: `packages/cli/src/scenario/dsl.ts` — 场景的 mini-DSL（步骤序列：mock 会话 → analyze → 检验某条知识被学到 → mock 新工具调用 → 检验 Hook 拦截）
- **加 CLI**: `verify --report` 生成 Markdown 报告

**DoD**:
- [ ] 5 个场景通过（含 python-version / tech-choice / api-hallucination / security / workflow-order）
- [ ] 每个场景定义："初始状态 / 踩坑会话 / 学习触发 / 验证拦截 / 预期指标"
- [ ] 报告格式：每个场景的 before/after、学到的知识条目、Hook 命中次数、PRR / KP 指标
- [ ] 自举切入：**M7.pre 报告** —— 整理整个 Phase 1 开发过程中自举产生的数据（自己知识库的最终状态、各 Milestone 被自身规则拦截的次数、confidence 变化曲线），放入 `docs/dogfood/自举报告.md`

**测试先行清单**:
- [ ] `packages/cli/src/scenario/__tests__/dsl.test.ts` — DSL 解析 / 执行
- [ ] 每个场景本身先写断言（空实现会失败）
- [ ] 报告渲染快照测试

**端到端验证路径**:
```bash
pnpm teamagent verify
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# 场景 1/5: python-version
#   Phase A (踩坑): 喂入含 "python script.py" 的会话 ... ✓
#   Phase B (学习): analyze --commit ... ✓ 1 条新知识
#   Phase C (避坑): 模拟新 Bash("python foo.py") ... ✓ Hook 拦截
#   PRR = 100%, KP = 5/5
# ...
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# 总体: 5/5 通过, 平均 PRR = 96%, KP = 4.6/5
# 报告已写入 dist/verify-report.md

# 查看自举报告
open docs/dogfood/自举报告.md
```

**实现任务**:

1. **场景 DSL 设计** — YAML 或 TS 对象，表达 phase A/B/C 三段结构
2. **5 个场景 fixture** — 按上述编号
3. **ScenarioRunner** — 读 DSL，逐场景执行，collect 指标
4. **报告渲染** — Markdown 表格 + 场景详情
5. **自举报告** — 另一个命令 `teamagent dogfood-report` 扫描 teamagent 仓库自己的 events.jsonl + knowledge.jsonl + git log，生成 `docs/dogfood/自举报告.md`
6. **CI 集成** — GitHub Actions 每日跑**不需要真实 LLM 的部分**：M0-M3 测试 + Matcher/Compiler/Pipeline（LLM 用 mock）。真实 LLM 集成测试（spawn 本机 `claude -p`）用 `test:llm` 脚本本地/定期人跑——CI 环境没有已登录的 Claude Code，跑不了

**自举切入**:
- 最后一次整体跑 verify 时，把 teamagent 自己的仓库作为"待测项目"，看自己的闭环保护是否真的有效
- dogfood-report 统计：
  - Phase 1 开发期间我纠正了 AI 多少次
  - 其中多少被 detector 识别（召回率）
  - 多少被 extractor 变成知识
  - 多少条知识真的在后续开发中被 Hook 命中
  - confidence 上升最多/下降最多的 top 5
- 这份报告本身是 Phase 1 最有说服力的交付物

**Commit 节奏**:
- Commit 1: 场景 DSL + 1 个示例场景通过
- Commit 2: 剩余 4 个场景
- Commit 3: ScenarioRunner + verify CLI + 报告渲染
- Commit 4: dogfood-report 工具
- Commit 5: CI 集成
- Commit 6: 最终 verify 跑完 + dogfood 报告生成

---

## 七、自举（Dogfood）总体策略

每个 Milestone 都有"自举切入"步骤。总体形成一条"自我增强"的曲线：

```
M1:  /pitfall 录入 3 条项目约定 → CLAUDE.md 含约定 → 开发 M2 时 AI 自觉遵守
M2:  安装自己的 Hook → 违反约定的操作被自己拦住 → 开发 M3 时被守护
M3:  每天 analyze 开发会话 → 识别率反馈到 detector 测试集
M4:  analyze --commit → 自己每天犯的错变成知识 → 明天不犯同样错
M5:  对自己的仓库跑 init → 验证 init 等价性
M6:  observe confidence 真实涨落 → 生成 top 5 报告
M7:  dogfood-report 整理全 Phase 1 的自举数据 → 变成产品说服力证据
```

**关键约束**:
- 任一 Milestone 如果"自举切入"难做，说明系统本身难用——是产品问题，不是开发问题
- 开发期间禁用自己的 TeamAgent 需要留 commit message 说明原因，作为可用性的反向信号
- M7 的 dogfood 报告是 Phase 1 的"**第三方独立证据**"：报告由系统自动生成，不经过任何手动修饰

**预期产出**（截至 M7 结束；实际数值取决于开发时长和密度，以下为参考区间）:
- 60-300 条 personal 知识条目（按 1-2 人开发 1-2 月、每天提取 2-5 条估算）
- 若干 Hook 拦截记录（真实避坑；无硬下限）
- ≥ 3 条 confidence 上升 > 0.2 的"经过验证的高质量规则"
- ≥ 1 条 confidence 归零的"学错了但被自纠"的规则（证明系统会校准）
- 1 份自举报告（`docs/dogfood/自举报告.md`）

具体数字不作为 DoD 硬指标——是"展示"而非"承诺"。核心是**报告本身存在且由系统自动生成**，数字给读者看分布形状。

---

## 八、Milestone 间并行度

虽然 Milestone 是顺序推进（每个依赖前者），但在一个 Milestone 内部：

- **多个 Port 的 Fake 实现**可以并行写
- **单元测试 + 实现**可以交替，但 Milestone 内部推荐线性完成以控制复杂度
- **自举切入**总是放在 Milestone 最后，验收之前

不推荐跨 Milestone 并行，因为后者依赖前者的 Port 契约稳定。

---

## 九、启动 Checklist

准备开始 M0 前确认:

- [ ] 已阅读 `docs/specs/2026-04-13-teamagent-design.md` v5.1 全文
- [ ] 已阅读本计划全文
- [ ] Node.js >= 20 已安装
- [ ] pnpm 已安装
- [ ] Claude Code 已安装并登录（M4 起 LLM 调用通过 spawn `claude -p` 实现，无需 ANTHROPIC_API_KEY）
- [ ] 理解本计划的 7 条开发原则（见一、开发原则）
- [ ] 理解 Walking Skeleton + Ports & Adapters + Functional Core 的组合含义

OK 后开始 M0。
