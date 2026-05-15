# TeamAgent Phase 2 设计文档（已被取代）

> ⚠️ **STATUS: SUPERSEDED (2026-04-15)**
>
> 本文档基于已 supersede 的 `product-roadmap.md` 撰写，其 7 个 sub-project 中大多数（记忆存储、语义检索、多工具支持、团队同步等）已被 mxLore / OpenMemory MCP / Claude Auto-Memory 等 2025-2026 出现的竞品直接实现。
>
> **取代它的文档**：`2026-04-15-phase2-design-v2.md`（专注 Hook-based Governance + 底层记忆整合策略）。
>
> 本文档作为决策历史保留，不再是真相源。

> 创建日期：2026-04-15
> 状态：~~Draft（待审）~~ → Superseded
> 父文档：~~`docs/superpowers/specs/2026-04-15-product-roadmap.md`~~（已 superseded）
> 前置背景：`docs/specs/2026-04-15-phase2-backlog.md`（Phase 1 遗留漏洞清单，仍有效）

---

## 一、Phase 2 的单句目标

> **把本地单用户的体验做到无可挑剔，并用硬数据证明"装 vs 不装"存在显著差距。**

Phase 2 **不扩范围**（不请新用户、不接新工具、不做团队同步）——所有扩张留给 Phase 3+。Phase 2 把 Phase 1 剩下的漏洞堵完，并**首次给系统装上度量尺**。

---

## 二、Phase 2 的设计哲学

1. **先尺子再优化** — 没有 benchmark 数据的情况下，任何"改进"都是盲调。Phase 2 的第一个 sub-project 必须是 benchmark 基础设施。
2. **所有参数可实时观察** — 新增的每一个权重、阈值、策略都要能在运行时被用户看到并微调，不写死在代码里。
3. **继承 Phase 1 的保护机制** — Stage A hotfix 的 log2 归一 + 自反检测是硬约束，Phase 2 的所有新信号都必须经过同一套保护。
4. **YAGNI 延后的仍然坚决延后** — MCP / 团队同步 / 互联网知识即便实现起来吸引人，Phase 2 一概不做。
5. **成功经验捕获是 Phase 2 才能真正说自己"落地"** — Phase 1 M3 的成功模式捕获器是框架，没有抽取 + 存储 + 投递闭环。Phase 2 补齐闭环。

---

## 三、Sub-Project 清单（7 个）

### SP-1. Benchmark & Signal Infrastructure

**目的**：造 Phase 2 及之后所有 Phase 的"度量尺"。

**Scope（in）**：
- 标准任务集（≥ 30 个"容易踩坑"的 Claude Code 任务，涵盖技术选型、API 幻觉、路径错误、工作流顺序等）
- A/B 测试 runner：同一任务在"装 vs 不装"下跑，记录 AI 行为差异
- AI override signal（PreToolUse warn 后 AI 是否改了行为；详见 SP-1.md）
- 真实 LLM 规则质量评测管道（非 mock）——M4 的 avg 4.6/5 需要真 LLM 复现

**Scope（out）**：
- 自动化 CI 跑 benchmark（手动触发即可，成本高）
- 跨模型对比（Claude vs GPT-4）——Phase 6 再做

**Dependencies**：无，是 Phase 2 的基石。

**Deliverable**：`pnpm benchmark` 命令能跑出 JSON 报告，含"重复犯错率、规则 PRR、override signal 分布"。

**Success criteria**：
- 能跑通 ≥ 30 个任务，给出定量差距
- AI override signal 实测在真实 dogfood 数据里有可分辨的正/负样本
- 真实 LLM 评测复现 M4 的 avg 4.6/5 结果（±0.3 可接受）

---

### SP-2. Calibrator 深化

**目的**：让规则自我管理更鲁棒，避免 Stage A 类 hotfix 再次出现。

**Scope（in）**：
- 时间衰减：长时间（> N 天）未命中的规则 confidence 自动下降
- Over-archive 保护：防止新生规则因初始数据少而被快速归档
- 信号体系精细化（以 SP-1 的 AI override signal 为新增强信号）
- Dry-run 与 real-run 的 delta 对比强制落盘（审计）

**Scope（out）**：
- 基于 ML 的权重学习——Phase 5 再看
- 多维度 confidence（precision / recall 分拆）——本 Phase 先单维

**Dependencies**：
- **硬依赖**：SP-1（没有 benchmark 无法验证调参是否真的改善了 system behavior）
- **软依赖**：建议等 SP-3/4/5/7 全部完成后再做——让所有新信号（override signal、新纠正信号等）都接入 Calibrator 后，一次性调参比多次调参更有效。

**Deliverable**：升级后的 `DefaultCalibrator`，加权参数表全部可通过 config 热加载。

**Success criteria**：
- 时间衰减测试覆盖率 ≥ 90%
- 连续 dogfood 2 周无"规则反噬"事件（"反噬"= 规则对自己相关文档/测试 fire 导致 confidence 异常）

---

### SP-3. Scope Intelligence

**目的**：消除"规则对自己被讨论的文档命中"这类 false positive。

**Scope（in）**：
- 让 M4 的 LLM extractor 在抽规则时**直接推断** `scope.paths` 与 `scope.file_types`
- 默认 code-file-types 作为兜底（Phase 1 已有）保留，但不再是唯一依赖
- 新增"scope 自检"：规则入库前自动检测是否对自己 fixture 反向命中

**Scope（out）**：
- 运行时动态 scope 调整（静态推断足够）
- 用户编辑规则 scope 的 UI（直接改 JSONL 即可）

**Dependencies**：无（可和 SP-2/SP-4/SP-5 并行）。

**Deliverable**：新规则入库的 scope 字段由 LLM 推断填写，准确率 ≥ 80%。

**Success criteria**：
- Benchmark 上的 false positive 率相比 Phase 1 下降 ≥ 50%
- 新规则的 scope.paths 人工检查 ≥ 80% 合理

---

### SP-4. Matcher Hardening

**目的**：让 matcher 区分"使用 X" vs "讨论 X"——Phase 1 无法区分的核心痛点。

**Scope（in）**：
- 代码上下文感知：匹配到的字符串在注释 / 字符串字面量 / Markdown 内 → 不算命中
- 针对主流语言（TS / JS / Python / Go）的轻量 lexer
- Fallback：语言未识别时回退到当前子串匹配

**Scope（out）**：
- 完整 AST 解析（成本太高）
- 语义向量相似度（Phase 5 再做）
- 跨语言语法树（Phase 5）

**Dependencies**：无。

**Deliverable**：`ContextAwareMatcher` 类，测试覆盖 ≥ 85%。

**Success criteria**：
- Benchmark 上含"讨论 X 的注释"样本的 false positive 率 = 0
- 正常使用 X 的代码仍被 100% 命中

---

### SP-5. Detector 升级 + 成功经验真落地

**目的**：Phase 1 M3 的成功模式捕获器只是框架——Phase 2 让它真工作。

**Scope（in）**：
- 增加纠正信号种类（新增：test-passed-after-retry、diff-applied-by-user、explicit-praise）
- 成功经验的 LLM 抽取 prompt（separate from 失败经验的 prompt）
- 成功经验入库路径（保留现有 jsonl schema，只是 `type: "success"`）
- 成功经验的 CLAUDE.md 编译区块（与避坑规则分开渲染）

**Scope（out）**：
- 跨会话成功经验聚合（Phase 4）
- 成功经验自动降权（Phase 5）

**Dependencies**：无。

**Deliverable**：真实 dogfood 中累积 ≥ 10 条成功经验，CLAUDE.md 有专门的"成功模式"区块。

**Success criteria**：
- Benchmark 上 AI 能主动复用 ≥ 3 条成功模式
- 成功经验的规则质量 avg ≥ 4.0/5（真 LLM 评测）

---

### SP-6. Proactive Injection v1

**目的**：在 Phase 1 的"被动拦截"之外，加上"主动补充"这个**新激活维度**的最简可用版本。

**Scope（in）**：
- `/teamagent brief` 命令：手动触发，列当前项目最相关的 Top-N 规则
- Session 开场简报：检测到 Claude Code 新 session 启动时，自动输出本次最可能涉及的规则（可关闭）
- 简报内容仅包含**高置信**规则（≥ 0.7）
- 简报频率限制：每 session 最多一次，避免打扰

**Scope（out）**：
- 基于对话语义的动态介入（Phase 5 v2 再做）
- 基于"用户似乎不知道 X"的推断式介入（Phase 5）
- 主动补充与团队知识联动（Phase 4+）

**Dependencies**：SP-5 的"成功经验入库路径"子步骤完成（至少有 ≥ 5 条成功经验在库，才有可 brief 的内容；不需要等 SP-5 的 CLAUDE.md 编译区块完成）。

**Deliverable**：`/teamagent brief` 命令 + session-start hook。

**Success criteria**：
- 实测作者自己连续用 1 周，每次 session 开场简报命中率（含"我后来用到了简报提到的规则"）≥ 30%
- 用户主观反馈"不打扰"

---

### SP-7. Hook Resilience + Ops Basics

**目的**：系统长期跑不出问题。

**Scope（in）**：
- Bundle 自动重建：source 变动时 `pnpm build:hook` 自动触发（通过 husky 或 pnpm install hook）
- Events.jsonl 轮转：> N MB 或 > N 天自动滚动到 events.archive/
- PII scrub：LLM 抽规则前先扫 trigger / wrong_pattern，删除看起来像 token / API key 的内容
- Hook 协议错误诊断：输出 JSON 非法时写 debug log 到 `.teamagent/hook-errors.jsonl`

**Scope（out）**：
- 分布式追踪（单机无意义）
- 告警系统（Phase 4 团队层再考虑）

**Dependencies**：无（可并行）。

**Deliverable**：长期运行 30+ 天无手动干预。

**Success criteria**：
- Events 轮转测试覆盖率 ≥ 90%
- PII scrub 对常见 API key 模式（sk-/ghp_/xoxb- 等）命中率 = 100%
- Bundle 过期导致的静默失效事件数 = 0

---

## 四、Sub-Project 之间的依赖关系

```
         SP-1 Benchmark (必须第一)
           ↓
  ┌────────┼────────┬────────┐
  ↓        ↓        ↓        ↓
SP-3     SP-4     SP-5     SP-7
Scope    Matcher  Detector Ops
  │        │        │        │
  └────────┴────────┴────────┘
           ↓
         SP-2 Calibrator (需要 benchmark 验证调参)
           ↓
         SP-6 Proactive v1 (需要 SP-5 有成功经验)
```

**关键点**：
- SP-1 必须**最先**完成——它是后续所有 sub-project "是否真的改进了系统" 的裁判
- SP-2 放在**最后**是有意为之——它是 meta-level 调整，需要前面 sub-projects 先把信号都接上
- SP-3/4/5/7 可**并行**（四条独立的改进线）
- SP-6 依赖 SP-5

---

## 五、Phase 2 整体退出标准

必须**全部**满足才能宣告 Phase 2 完成：

1. **Benchmark 硬数据**：装 vs 不装在标准任务集上，**重复犯错率**相对下降 ≥ 30%（绝对阈值首次 benchmark 后定）
2. **False positive**：相比 Phase 1 下降 ≥ 50%
3. **成功经验**：从真实 dogfood 中累积 ≥ 10 条 `type: "success"` 条目，CLAUDE.md 有专门区块
4. **主动补充 v1**：作者连续用 1 月，开场简报命中率 ≥ 30% 且主观"不打扰"
5. **长期稳定性**：连续 dogfood ≥ 30 天无手动干预、无规则反噬事件
6. **所有 7 个 sub-project 的 success criteria 全部达成**

---

## 六、本 Phase 不做的事（明确延后）

| 诉求 | 延后到 | 原因 |
|------|------|------|
| 请第 2 个用户 | Phase 3 | 没 benchmark 数据前请用户等于让用户帮 debug |
| 团队知识同步 | Phase 4 | 单用户价值证实前做团队同步是空中楼阁 |
| 互联网前沿知识 RAG | Phase 5 | 需要 Phase 4 的团队层基础 |
| 主动补充 v2（语义感知） | Phase 5 | v1 机制跑稳再深化 |
| MCP server | Phase 6 | 独立大块，现在做会分散精力 |
| Tech taste 抽取 | Phase 5 | 属于"前沿知识"范畴 |
| Cross-platform 充分测试 | Phase 3 | 第二个用户时才有真实需求 |

---

## 七、Phase 2 内部里程碑建议（不承诺时间）

| Milestone | 含义 | 完成标志 |
|-----------|------|---------|
| M2.1 | 度量尺就位 | SP-1 完成 |
| M2.2 | 四条并行线收口 | SP-3/4/5/7 完成 |
| M2.3 | Calibrator 调优完毕 | SP-2 完成 |
| M2.4 | 主动补充上线 | SP-6 完成 |
| M2.5 | Phase 2 数据验证期 | dogfood 1 月，数据达标 |

**注意**：以上 Milestone 不绑定时间——按 Phase 2 的"做到最好"原则推进，每个 Milestone 完成即可启动下一个。

---

## 八、待用户确认的点

1. **7 个 sub-project 的划分是否合理？** 有没有应该合并或拆分的？
2. **依赖关系是否正确？** SP-2 放最后、SP-6 依赖 SP-5 这两个判断你同意吗？
3. **退出标准的阈值**：30% 重复犯错率下降、50% false positive 下降、10 条成功经验、30% 简报命中率——这些数字 OK 吗？还是初次 benchmark 后再定？
4. **是否有我漏掉的 sub-project？** 对比 `phase2-backlog.md` 的 11 大类，我把 F (Multi-tool)、H (Cross-platform)、J (Team)、K (Spec v5.3) 排除在 Phase 2 外——排除对吗？
5. **第一个动手的 sub-project 是 SP-1 (Benchmark)——有异议吗？**
