# TeamAgent 产品路线图 v2

> 创建日期：2026-04-15
> 版本：v2（取代 v1 `2026-04-15-product-roadmap.md`）
> 状态：Draft（待用户审）
> 作用：所有后续 Phase / Sub-project spec 的**父文档**

---

## 零、v2 对 v1 的核心修正

v1 默认 "我们的方法独特"，后续竞品调研（2026-04-15 WebSearch）发现：

- Claude Code 内建 **Auto-Memory + Auto-Dream**（2026-03 落地）已实现"从纠正中自动学习"
- **mxLore / OpenMemory MCP / mcp-memory-service** 等多个 MCP 记忆服务覆盖了 v1 Phase 4-6 的大部分能力
- **Microsoft Agent Governance Toolkit**（2026-04，MIT）提供生产级策略引擎，含 5-tier 信任评分 + trust decay
- **Codacy Guardrails** 成熟的 MCP 集成 + 实时代码拦截

v2 采用 **D + C 混合战略**：
- **D（愿景完整）**：5 轴坐标系 + 6 Phase 不变
- **C（不重造轮子）**：底层基础设施全部**使用 2026 最成熟的开源模块**
- **独立价值**：只保留"**自动捕获 + 实时拦截**"这个市场真空组合，作为 TeamAgent 的独家位置

---

## 一、产品愿景（用户原话）

> 开发出一款类似**团队智脑**的自进化 AI。最终目的是让团队有人踩过的坑只踩一次、别人不再踩；走过的弯路只走一次、别人不再走；有最新的知识和经验都**实时同步**到团队中每一个人的 Claude Code 里。

**核心机制**：系统在运行中自己完善自己，实现**自我进化**。对用户**无需任何主动操作**——系统自动记住错误、自动记住经验、自动把用户产生的知识上传到团队。整个系统**越用越聪明、越快、错误越少、token 消耗越少**。

---

## 二、系统的 5 个维度（坐标系）

| 轴 | 含义 | Phase 1 状态 | 终态 |
|---|---|---|---|
| **知识类型** | wiki / taste / 前沿 + 成功经验 + 失败经验 | ❌ 只有失败经验（避坑） | wiki + 成功 + 失败 |
| **知识来源** | 个人 / 团队 / 互联网 | ❌ 只有个人 | 三源融合 |
| **激活方式** | 主动补充（inline 对话注入）+ 被动运用（运行时拦截） | ❌ 只有被动 | 主动 + 被动 |
| **工具范围** | Claude Code / Cursor / Windsurf / 其它 | ✓ Claude Code | 多工具 |
| **用户范围** | 本地单人 / 团队共享 | ✓ 本地单人 | 团队 |

**Phase 1 = 5D 空间的一个角落**（失败经验 × 个人知识 × 被动 × Claude Code × 本地单人）。

---

## 三、自我进化的 4 个子能力

"自我进化"不是单一 feature，是贯穿 5 轴的**元能力**：

1. **自动记忆错误** — 捕获纠正时刻并抽成规则（Phase 1 M3/M4 已具备）
2. **自动记忆经验** — 成功模式捕获（Phase 1 M3 有框架，Phase 2+ 真落地）
3. **自动置信度管理** — Wilson LB（升）+ Demerit 积分（降）+ 5-tier（Phase 2 v2 升级）
4. **自动知识传播** — 个人高置信规则 → 自动提议同步团队（Phase 4）

"越用 token 越少" = 以上 4 能力跑通后的**自然结果**：规则更准 → AI 少走弯路 → 少消耗 → 复利效应。

---

## 四、竞品地图与 TeamAgent 的差异化位置

```
                   ┌──── HAND-WRITTEN RULES ────┬──── AUTO-CAPTURED RULES ────┐
                   │                            │                             │
REAL-TIME          │ Microsoft AGT              │ ⚠️ 空白                      │
INTERVENTION       │ Codacy Guardrails          │                             │
                   │ OWASP Agentic runtime      │ ← TeamAgent 唯一占位         │
                   ├────────────────────────────┼─────────────────────────────┤
RETROSPECTIVE /    │ .cursorrules (classic)     │ Claude Auto-Memory          │
CONTEXT ONLY       │ CLAUDE.md (static)         │ claude-mem / memsearch      │
                   │                            │ /insights                   │
                   │                            │ Self-Learning Code Review   │
                   └────────────────────────────┴─────────────────────────────┘
```

TeamAgent 的**唯一独立位置** = **自动捕获 + 实时拦截**的组合。市场上其他产品每条都只占一边。

### 可借鉴的成熟模块（Phase 2 v2 全部引入）

| 借鉴点 | 来源 | 
|--------|------|
| 策略引擎思想（stateless, sub-ms） | Microsoft AGT |
| 信任评分 0-1000 + 5 tier + trust decay | Microsoft AGT |
| 规则"死亡链"（demerit 积分） | 驾照扣分制 |
| Log-loss 非对称惩罚（高 tier 错一次更惨） | Penalized Brier Score 研究 |
| 用户否决强信号（Not Spam 按钮模式） | Gmail 垃圾邮件过滤 |
| MCP Server 集成模式 | Codacy Guardrails |
| 规则格式 WHAT/HOW/WHY 子字段 | Self-Learning Code Review (Shapira) |
| Agent Skills 标准兼容 | Anthropic 2025-12 开放标准 |
| Wilson Score Lower Bound（小样本下界） | Reddit / Evan Miller 经典 |
| 指数衰减 + 重要性加权（Ebbinghaus） | FadeMem 2026 论文 |

### 不借鉴的部分（刻意独立）

- OPA Rego / Cedar 策略语言（对我们 overkill）
- Microsoft AGT 的 mesh / compliance / marketplace（重企业场景，不是我们目标）
- Codacy 的 SAST 规则（他们关心 security，我们关心 domain knowledge）
- RL 自我纠正（SCoRe）训练方法（需 GPU，与 local-first 理念冲突）

---

## 五、技术栈选型总原则

**Phase 2 v2 技术栈标准**：
- 只用 **2026 仍在维护**的主流库
- **优先 npm/Node.js 原生**，避免跨语言桥接
- **本地优先**，无云依赖即可跑
- 所有 license 必须是 **MIT / Apache 2.0**（禁 BSL / 商业限制）

### 选定的 2026 技术栈

```
存储       node:sqlite (Node 22+) / better-sqlite3 (降级)
向量       sqlite-vec
AST        web-tree-sitter (WASM)
Hook       @anthropic-ai/claude-agent-sdk
LLM        @anthropic-ai/sdk + zod v4
Token      js-tiktoken
Web 抓取   @mozilla/readability + rss-parser (+ Firecrawl optional)
CEL 条件   @google/cel-js
事件总线   mitt
CLI UI     cli-table3 + picocolors
```

详见 `phase2-design-v2.md` 的基础设施替换章节（SP-1 项 1）。

---

## 六、6 个 Phase 分段

**原则**：一个 Phase 把一个轴推到尽头或一个角落深挖到极致，不横展铺摊。

### Phase 1 — Walking Skeleton（已完成，2026-04-15）

**版本**：v0.1.0  
**角落**：失败经验 × 个人知识 × 被动 × Claude Code × 本地单人  
**产出**：13/13 设计承诺交付；32 条活跃知识；168 次真实 Hook 拦截；Calibrator 自修正闭环  
**遗留**：`docs/specs/2026-04-15-phase2-backlog.md` 的 30+ 条漏洞

### Phase 2 — 把本地单用户做到无可挑剔 + 加 Wiki

**目标**：深挖当前角落，把单人本地体验**从"能用"做到"好用"**，并**首次引入 wiki 维度**（内部对话 inline 注入）。

**覆盖轴**：
- **工具范围 / 用户范围 / 知识来源：保持不动**
- **知识类型：加入 wiki** 这一子轴（前沿技术 + taste）
- **激活方式：加入 inline 主动补充 v1**（UserPromptSubmit hook）

**核心产出**：
- 3 个 Sub-project（SP-1 好用化 / SP-2 A/B 评估 / SP-3 Wiki），详见 `phase2-design-v2.md`
- Calibrator v2：**Wilson LB（升）+ Demerit 积分（降）+ 5-tier + 4 级死亡链**
- 基础设施全部换成熟开源库（SQLite、tree-sitter、Claude Agent SDK...）
- 6 源规则摄入（Detector + /insights + npm audit + PR + git log + CI）
- Wiki inline 注入（sqlite-vec 相关性匹配）

**退出标准**（必须全部满足）：
1. Benchmark 4 组对比（裸 / Auto-Memory / Codacy / TeamAgent）：重复犯错率相对下降 ≥ 30%
2. False positive 率相比 Phase 1 下降 ≥ 50%
3. 成功经验累积 ≥ 10 条
4. Wiki 条目累积 ≥ 30 条且 inline 注入月均 ≥ 5 次/session 且"不打扰"主观评估通过
5. 连续 dogfood ≥ 30 天无规则反噬事件

**版本**：v0.3.0

### Phase 3 — Ready for User #2（第一次跨越作者）

**目标**：**用户范围**从"只有作者" → **"任何一个朋友能自己装上"**。

**覆盖轴**：用户范围从 1 → 2-3 人（各自独立使用，未联通）。

**核心产出**：
- `teamagent init` 在陌生项目跑通
- `teamagent doctor` 诊断安装问题
- 错误消息友好化
- README + 5 分钟上手指南
- 跨平台充分测试（macOS / Linux）
- 邀请 2-3 位朋友实测

**退出标准**：至少 3 位非作者朋友独立装上并持续使用 ≥ 2 周。

**版本**：v0.5.0

### Phase 4 — 团队层真正落地

**目标**：**用户范围**→ 同一团队共享知识；**知识来源**加入"团队"。

**覆盖轴**：
- 用户范围：独立少数人 → 团队
- 知识来源：只个人 → 个人 + 团队

**核心产出**：
- Git-backed 知识同步（`scope=team` / `scope=global` 真正工作）
- 冲突处理（两人规则矛盾）
- 隐私 / 敏感信息自动过滤
- 团队仪表盘
- 自动上传机制（个人高置信 → 提议同步到团队）
- 团队成员加入/退出流程

**退出标准**：5-10 人真实团队共用 ≥ 1 月，"有人踩过的坑别人不再踩"可验证。

**版本**：v0.7.0

### Phase 5 — 前沿知识 + 主动补充深化

**目标**：**知识来源**加互联网 RAG；**激活方式** v1 → v2 语义感知；**知识类型**加 taste。

**覆盖轴**：
- 知识来源：个人 + 团队 → + 互联网
- 激活方式：v1 关键词触发 → v2 语义上下文感知
- 知识类型：失败 + 成功 → + wiki/taste

**核心产出**：
- RAG 前沿技术（paper / blog / 官方文档 / 新 API changelog 自动抓取）
- Tech taste 抽取（"现在最佳实践是 Y"）
- Matcher v3：全语义相似度（向量）
- 主动补充 v2：根据对话语义判断**何时 / 补充什么**
- 预置领域知识包（TS / React / Python 等）

**退出标准**：系统能主动带团队走别人走过的更好的路；用户报告学到过去不知道的最新技术。

**版本**：v0.9.0

### Phase 6 — 多 AI 工具（MCP）

**目标**：**工具范围** → 多工具。

**覆盖轴**：Claude Code → Claude Code + Cursor + Windsurf + ...

**核心产出**：
- MCP server
- 工具间知识共享
- 统一事件模型

**退出标准**：至少 2 个非 Claude Code 的 AI 工具接入并真实使用。

**版本**：v1.0.0（公开发布）

---

## 七、Phase 之间的关键依赖

```
Phase 1 (done)
    ↓
Phase 2 (benchmark 成为 Phase 3+ 所有 A/B 判断的尺子)
    ↓
Phase 3 (第二个用户为 Phase 4 的"团队"铺垫)
    ↓
Phase 4 (团队层为 Phase 5 的"前沿知识注入团队"铺垫)
    ↓
Phase 5 (知识类型 + 来源扩展到互联网)
    ↓
Phase 6 (工具扩展，靠前面稳定性支撑)
```

**关键承诺**：每个 Phase 的 benchmark 数据都对比**前一个 Phase**，用同一把尺子验证实质进步。

---

## 八、不在 Roadmap 范围内的事

- 商业化 / 定价 / 企业版本（Phase 6 后再考虑）
- 云端托管服务（本系统本地优先，同步只走 Git）
- IDE 原生插件（只做 MCP server）
- UI / 仪表盘（Phase 4 极简团队看板外，CLI + Markdown 即全部界面）
- WSL / BSD 等非主流平台（Phase 6 后评估）

---

## 九、文档生命周期

- 本 roadmap 是**活文档**：每 Phase 结束回看并更新下一 Phase 细节
- 每个 Phase 有独立 spec：`docs/superpowers/specs/YYYY-MM-DD-phase{N}-design-v{M}.md`
- 每个 Sub-project 可有独立 spec：`docs/superpowers/specs/YYYY-MM-DD-<sub>-design.md`
- 实现计划在 spec 审完后写：`docs/superpowers/plans/YYYY-MM-DD-<sub>-plan.md`

---

## 十、本文档待用户确认的点

1. D + C 混合战略是否匹配你的真实意图？
2. "自动捕获 + 实时拦截"这个差异化定位是否足够独立？
3. 5 维坐标系 + 4 子能力拆解是否贴合愿景？
4. 6 Phase 的边界清晰吗？Phase 2 的单句目标（"单人本地无可挑剔 + wiki"）是否完整？
5. 不做清单里有没有漏掉应该明确延后的？
