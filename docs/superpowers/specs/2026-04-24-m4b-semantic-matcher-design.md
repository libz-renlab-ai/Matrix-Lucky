# M4-B — 语义匹配引擎替换 substring matcher 设计文档

> 日期: 2026-04-24
> 状态: Draft（待用户 review spec → 进入 plan 阶段）
> 作者: tianhaoxuan + Claude (Opus 4.7 1M)
> 父路线图: [`2026-04-22-product-roadmap-v3.md`](../../backup/phase2-superseded/2026-04-22-product-roadmap-v3.md) (archived)
> 上一里程碑: [M4-A 输出层拦截](./2026-04-23-m4a-output-layer-interception-design.md)

---

## 一、背景与问题

### 0.9.3 版本实测的根本缺陷

端到端扫描线上数据（`.teamagent/knowledge.db` + `events.db` 4785 条事件）暴露三条致命链：

1. **学到的有用规则全躺在 dormant 墓场**。事件流里真正触发过 17-29 次的 4 条 `team-*` 规则当前状态都是 `dormant`；140 条 `active` 规则的 `hit_count` 合计 **0**。校准器按现行降级规则（任何 ignore 都扣分 + 时间衰减）在 73% 合规率的规则成熟前就把它们杀了。
2. **substring matcher 的信号-规则错配**。规则库 297 条里 ~200 条是 passive-knowledge（只进 CLAUDE.md 不参与运行时匹配）；剩下可拦规则的 `wrong_pattern` 要么是项目内部路径（不可跨项目泛化），要么是 AI 话术（走错通道，M4-A 已部分修复但源头未变），要么是散文化描述（matcher 完全无法命中）。
3. **抽取 prompt 的 18 类白名单悖论**。LLM 被强制产出"跨项目通用关键词"，但语料是单个项目内部的自开发对话；抽取器要么硬塞项目字面量被 L0 校验拒收，要么降级为 `practice` 类（`wrong_pattern=""`）进不了 matcher。两条出路都不通，结果就是"规则很少真正触发"。

### 为什么不再修修补补

M4-A 已经把 block/warn 通道按能力分拣过一轮。继续在 substring matcher 上加规则只会继续积累**无法被字面匹配命中的知识**。根因在于"**人类纠正是语义的，substring 匹配是字面的**"——这个错配用任何 wrong_pattern 校验、再多的抽取 prompt 调优都无法消除。

M4-B 放弃 substring matcher，用**语义相似度 + 双描述 soft-AND + hard-negative 反例**替换它；同时把校准器从"按时间衰减杀规则"改为"**按滑动窗口内的效用证据**调整规则"。

---

## 二、目标与非目标

### 2.1 目标

1. **让规则从"含此关键词就命中"升级到"在相似情境下才命中"**，把 140 条现在只能进 CLAUDE.md 的 passive-knowledge 规则也纳入运行时匹配。
2. **所有判断 <50ms 完成**（端到端 PreToolUse hook 耗时），无云 API 调用。
3. **误触发率下降 ≥50%**（相对 M4-A 实测基线），通过 soft-AND 双向量 + 每规则自动累积的 hard-negative 反例实现。
4. **dormant 墓场的证据型规则可被复活并重新校准**，通过新的滑动窗口校准器。
5. **全自动化**：无任何"等用户点头"的人工 review 环节；所有决策点都接一个算法化的证据信号。

### 2.2 非目标（本里程碑不做）

- ❌ 不做团队级跨用户同步（M5 范围）
- ❌ 不引入云端 embedding API
- ❌ 不接入 GPU / CUDA（Windows/Mac CPU-only 前提）
- ❌ 不做 skill 自动生成（保持现有 CLAUDE.md + skill 双出口逻辑）
- ❌ 不引入 MCP/Task/TodoWrite 的新拦截点
- ❌ 不改 hook 协议（对 Claude Code 端仍是 PreToolUse/Stop/UserPromptSubmit）

---

## 三、核心设计

### 3.1 知识条目的新形态

**旧结构**（简化）：
```
trigger: "需要发起 HTTP 请求"
wrong_pattern: "axios"                   ← substring 命中 key
correct_pattern: "fetch"
type: avoidance | practice               ← 决定是否走 matcher
channel: tool-action | ai-narrative | ...  ← 决定生效点
```

**新结构**：
```
trigger_description: "在项目代码里新发起一次 HTTP 请求的场景"
pattern_description: "引入或调用 axios 库做请求"
correct_pattern: "用 fetch (Node 18+ 原生支持，项目零依赖偏好)"
reasoning: "..."

trigger_vec: float16[256]        ← 预计算
pattern_vec: float16[256]        ← 预计算
hard_negatives: float16[256][]   ← 最多保留 20 条上下文反例
threshold_a, threshold_b: REAL   ← Thompson 采样的 Beta(α, β) 参数
observation_window: JSON         ← 最近 N 次命中结果 [{outcome, ts}]
```

**死掉的字段**：`wrong_pattern`（原 substring key，现在用 `pattern_description` 的语义嵌入替代）、`type`（avoidance/practice 的二分，所有规则都参与匹配）、`channel`（tool-action/ai-narrative/passive-knowledge 的三分，按**上下文来源**自动路由而非固定字段）。

**保留的字段**：`scope`、`enforcement`、`current_tier`、`confidence`、`evidence`、`created_at`，保持 M3/M4-A 的校准/展示语义兼容。

### 3.2 上下文的双向量构造

每次 PreToolUse hook 到达时，从 hook payload 构造**两个**查询向量：

| 向量 | 内容 | 用途 |
|---|---|---|
| `context_vec` | 当前任务上下文 + 最近 1-2 轮 AI 文本（不含工具调用） | 和规则的 `trigger_vec` 比 |
| `action_vec` | 本次工具名 + 参数（command/file_path/content/new_string 等） | 和规则的 `pattern_vec` 比 |

这两个向量分开算的意义：
- `context` 告诉系统 **AI 在干什么任务**
- `action` 告诉系统 **AI 这次要做什么具体操作**
- 两者都要命中相应规则描述才触发——单一命中不够

### 3.3 匹配算法：Soft-AND + Hard-Negative

直觉上的硬 AND-gate（`sim(ctx, trigger) > θ AND sim(act, pattern) > θ`）有三个坑（研究参考 Vespa/BGE-M3 多字段匹配实践 + SIGIR 2025 hard-negative 论文）：

1. 两向量高相关时 AND 退化为 OR
2. trigger（长/情境）和 pattern（短/字面）的相似度分布不同，单一 θ 卡不住两者
3. 硬边界让召回崩塌：边际命中全丢

**采用 soft-AND 打分**（权重记作 w₁..w₄ 避免与 3.5 的 Thompson Beta 参数混淆）：

```
score = w₁ · sim(ctx, trigger_vec)
      + w₂ · sim(act, pattern_vec)
      - w₃ · max(0, τ_floor - min(sim(ctx, trigger_vec), sim(act, pattern_vec)))
      - w₄ · max(sim(ctx, hard_neg) for hard_neg in rule.hard_negatives)

初始参数: w₁=w₂=0.4, w₃=0.3, w₄=0.5, τ_floor=0.50
```

- 前两项：两个相似度的加权和
- 第三项：floor penalty——任一向量低于底线 τ_floor 时扣分，保留 AND 的"两边都得像"约束但不硬砍
- 第四项：hard-negative 惩罚——当前上下文接近这条规则**曾经误触发过**的情境（见 3.6），减分

`score > fire_threshold`（Thompson 采样出来的，见 3.5）才触发。

**为什么不纯语义检索**：项目的规则库里有大量带字面锚点的模式（库名、命令、API 符号）——这些 BM25 比密集检索更准。第一阶段检索用 **BM25 + 密集 RRF 融合**（RRF k=60，业界默认）拿 top-20，然后 soft-AND 只在 top-20 上算打分，绝不在全库算。

### 3.4 完整匹配流水线（PreToolUse 每次耗时拆解）

```
PreToolUse hook 到达（~0ms）
  ↓
[阶段 0] 缓存命中判断（~1ms）
  - 同轮对话 context 未变化 → 复用 context_vec 缓存
  - 同一工具+参数出现 → 复用 action_vec 缓存
  ↓
[阶段 1] embed(context + action)（~30-60ms）
  - 本地 ONNX-INT8 模型 (Snowflake arctic-embed-m-v2.0，256-dim 截断)
  - 两次 embedding 可并行（Node Worker）
  ↓
[阶段 2] 候选召回（~5-10ms）
  - BM25 (sqlite FTS5 对 trigger_description + pattern_description) → top-20
  - 密集 kNN (sqlite-vec 对 trigger_vec + pattern_vec 各取 top-20) → top-20
  - RRF 融合 → 最终 top-20 候选
  ↓
[阶段 3] soft-AND 打分（~3-5ms）
  - 对每个候选规则算 score（见 3.3 公式）
  - 按 score 降序，取 score > fire_threshold 的规则
  ↓
[阶段 4] 执行强度映射（~1ms）
  - 最高 score 规则的 enforcement 决定动作（block / warn / suggest / passive）
  - 同分时 enforcement 严者优先
  ↓
[阶段 5] 发事件 + 返回决策（~2ms）
  - PreToolUse decision (allow / deny / warn)
  - 归因事件写入 events.db（含 intervention_id 用于后续回溯）

总耗时: ~45-80ms p50，~100ms p99（上限靠 embedding cache 维持在 40ms）
```

> **⚠️ 延迟数字是外推而非实测**。上述数字基于公开 benchmark（BGE-small 在 Intel CPU 上亚毫秒 → arctic-embed-m 体积 ~3.5x → 推测 30-80ms），**尚未在用户本机实测**。Phase A 第一件事是在 Windows 11 + 实际 CPU 上跑 20 次真实 embedding 测 p50/p99。如果实测 >100ms 单次，设计需要调整（详见 §10.1）。

### 3.5 每规则自适应阈值：CONFLARE 冷启动 + Thompson 在线

每条规则有独立的 `fire_threshold`。初始值用 **CONFLARE 共形预测**（arxiv 2511.17908，2025-11）在规则入库时校准：

**冷启动**：规则入库时用 LLM 生成 10-20 条"该规则应该触发"的正例 + "不该触发但可能被误判"的负例；对每条正负例算 `score`；取正例 5% 分位作为初始 `fire_threshold`，保证 ≥90% 正例覆盖。

**在线自适应**：每条规则维护 Beta(α, β) 分布（α, β 存在 schema 里），代表"这条规则的 fire 决策过去是否有用"：
- AI 在 warn 后 complied → α += 1
- AI override ignored → β += 1
- 被用户显式修正（git revert 相关 commit） → β += 2

每次打分时对 `fire_threshold` 做 **Thompson 采样**——从 Beta(α, β) 采样得到当次决策的"信心分"，乘到 θ 上做微调。这样：
- 高信心规则门槛收紧（少触发但准）
- 低信心规则门槛放松（多观察，收集数据）

α+β 达到 20 以上后进入稳态，α/(α+β) < 0.3 的规则自动归档。

### 3.6 Hard-Negative 自动积累

每次规则 fire 后 24 小时内，如果满足以下任一条件，就把当次的 `context_vec` + `action_vec` 作为该规则的 **hard negative** 存入 rule.hard_negatives（限 20 条 LRU）：

1. AI override ignored（AI 看到 warn 后仍然执行了原操作）
2. `ai.override.blocked_circumvented`（block 被拦后 AI 换工具绕过且成功执行）
3. 用户 UserPromptSubmit 中出现对 AI 判断的**支持性否定**（"不用拦"、"这里应该允许"、"规则太严"）——与规则立场一致的负反馈
4. 被规则拦下的上下文后被 `git revert` 或后续 commit 里用相同手段完成（说明当次拦错了）

下次匹配时 soft-AND 公式里的第四项自动扣分——**被这条规则误触发过的上下文不会再误触发第二次**。这是纯语义检索不靠 LLM judge 也能高精度的关键机制（参考 DPR/NV-Retriever/SyNeg 系列论文）。

> **诚实提示 — 冷启动期慢**。上述 4 个信号全部低频。单条规则要攒够 5-10 条 hard-negative 预估需要 **2-4 周真实使用**。首版发布后第 1 个月，系统主要靠 soft-AND 的 floor penalty 防误触发，**hard-negative 不是上线即生效的精度保护**。接受的代价：用时间换精度，不装腔作势。冷启动期若某类规则误触发率偏高，可通过 `teamagent add-negative <rule_id> <context>` CLI 手动灌入反例加速（该 CLI 本身不违反"全自动化"——它只是应急工具，常态不使用）。

### 3.7 校准器：用 AutoManual 操作集替换 Wilson 降级

现行校准器用 Wilson 置信下界 + demerit 死链，按时间衰减降级。问题在前面诊断过——它会把 73% 合规率但不频繁触发的规则杀死。

新校准器用 **AutoManual 风格的 CREATE/UPDATE/MERGE/DELETE** 四操作（arxiv 2405.16247）：

- **CREATE**：Extractor 产出候选，通过 L0 后创建 `experimental` tier 规则
- **UPDATE**：Thompson 参数更新；滑动窗口内事件 ≥5 且 α/(α+β) ≥ 0.7 → 升级一档
- **MERGE**：新规则入库时 `sim(new.trigger_vec, existing.trigger_vec) > 0.88 && sim(new.pattern_vec, existing.pattern_vec) > 0.85` → 触发 LLM 合并判官（离线，Stop hook 尾）；合并产物保留两条规则 hit_count 之和
- **DELETE**：α/(α+β) < 0.3 且观察数 ≥ 20 → 归档；**不再按时间衰减删除**

关键变更：**只有证据显示规则错了才降级；低频但正确的规则永久存活**。这直接修掉了 dormant 墓场的死亡螺旋。

### 3.8 通道的消失

M4-A 引入的 `channel` 字段（tool-action / ai-narrative / user-input / passive-knowledge）在新架构下**不再存为字段**，而是**由上下文来源隐式决定**：

| 触发点 | 构造 context_vec 的来源 | 构造 action_vec 的来源 |
|---|---|---|
| PreToolUse | 最近 AI 文本 + 当前任务 | 工具名 + 参数 |
| Stop（AI 话术扫描） | 用户最近一轮 prompt + 上下文 | AI 最新 message 全文 |
| UserPromptSubmit | 用户本轮 prompt | 用户本轮 prompt（同） |

三个触发点共用同一批规则、同一个 embedding、同一个 soft-AND matcher；差别只在构造查询向量时喂进去的原文。通道不再是规则属性，而是**运行时的 routing 选择**。

向后兼容：迁移脚本读老 rule 的 channel 字段 → 决定迁移时 `pattern_description` 从哪个源头合成（tool-action 用 wrong_pattern，ai-narrative/user-input 用 wrong_pattern + 1-2 个上下文锚句，passive-knowledge 用 correct_pattern + reasoning）。

---

## 四、数据模型

### 4.1 Schema 迁移（v5 → v6）

新增列（sqlite `ALTER TABLE knowledge`）：
```sql
ALTER TABLE knowledge ADD COLUMN trigger_description TEXT;
ALTER TABLE knowledge ADD COLUMN pattern_description TEXT;
ALTER TABLE knowledge ADD COLUMN trigger_vec BLOB;       -- 256 × int8 = 256 bytes
ALTER TABLE knowledge ADD COLUMN pattern_vec BLOB;       -- 256 × int8
ALTER TABLE knowledge ADD COLUMN hard_negatives BLOB;    -- JSON array of base64-encoded int8 vectors
ALTER TABLE knowledge ADD COLUMN threshold_alpha REAL DEFAULT 1.0;
ALTER TABLE knowledge ADD COLUMN threshold_beta REAL DEFAULT 1.0;
ALTER TABLE knowledge ADD COLUMN fire_threshold REAL DEFAULT 0.55;
ALTER TABLE knowledge ADD COLUMN observation_window BLOB; -- JSON: last 50 observations
```

新增 sqlite-vec 虚表：
```sql
CREATE VIRTUAL TABLE knowledge_trigger_vec USING vec0(
  id TEXT PRIMARY KEY,
  vec FLOAT[256]
);
CREATE VIRTUAL TABLE knowledge_pattern_vec USING vec0(
  id TEXT PRIMARY KEY,
  vec FLOAT[256]
);
```

新增 FTS5 全文索引（BM25 用）：
```sql
CREATE VIRTUAL TABLE knowledge_fts USING fts5(
  id UNINDEXED,
  trigger_description,
  pattern_description,
  tokenize='porter unicode61'
);
```

**保留不动**：`wrong_pattern`、`type`、`channel`（留字段但不再被新 matcher 读取，留给向后兼容和迁移工具）。

### 4.2 Migration 脚本（`teamagent migrate v6`）

一次性跑：
1. 对每条 active/dormant 规则用本地 LLM 生成 `trigger_description` 和 `pattern_description`（离线批跑，预估 ~2min for 297 rules）
2. 用 arctic-embed 批量 embed 两段描述 → 存 trigger_vec / pattern_vec
3. 同步填充 FTS5 索引
4. 跑 CONFLARE 冷启动生成初始 `fire_threshold`
5. 旧规则 channel 信息用来启发 pattern_description 构造（见 3.8）
6. **dormant 规则特殊处理**：hit_count ≥ 3 的 dormant 规则强制恢复到 `probation` tier 并**清空 Thompson 参数（α=β=1 重置）**。旧 hit_count 是 substring matcher 下产生的——语义 matcher 下同一条规则可能命中完全不同的情境，不能继承信心。复活只是"给规则被语义 matcher 重新评估的机会"，不是"信用分加成"。

### 4.3 Events 表无变化

继续记录 `hook-pre.blocked` / `ai.override.complied` 等事件（见 M3/M4-A）；新增 kind：
- `semantic-match.fired` — 规则命中时写入 score 详情
- `semantic-match.suppressed-by-negatives` — 曾经的误触发因 hard-negative 被抑制（用于指标）

---

## 五、模型选型与工程实现

### 5.1 Embedding 模型

**最终选型**：`Snowflake/snowflake-arctic-embed-m-v2.0`
- 参数: 113M
- 原生维度: 768，Matryoshka 截断到 **256**（官方测试 <1 MTEB 点损失）
- 许可: Apache 2.0
- 多语言: 中英在内 20+ 语言（MIRACL/CLEF 成绩强）
- 预估 CPU 延迟: 30-80ms/次（ONNX-INT8，单线程；依赖 CPU）
- 模型体积: ~230MB 原始，INT8 量化后 ~60MB

**分发方式**：`teamagent init` 时从 HuggingFace 拉一次（或发布时 bundle 到 tarball），落到 `~/.teamagent/models/arctic-embed-m-v2-int8.onnx`。

**运行时**：`onnxruntime-node` 跑 ONNX-INT8 推理。不引入 Python 依赖。

**备选**：若 INT8 在某些 CPU 上慢到 >100ms，降级到 `BAAI/bge-small-en-v1.5`（33M，只英文，<10ms）+ 轻量中文翻译层（可选，M5）。

### 5.2 Rerank 模型（本里程碑不用，留接口）

设计允许插入 cross-encoder rerank 层（在 soft-AND 和 enforcement 之间）。首版不启用。若后续发现 soft-AND 还是漏掉了 edge case，可接 `jina-reranker-v2-base-multilingual` 或 `mxbai-rerank-base-v2`（ONNX INT8，<100ms for top-5）。

### 5.3 sqlite-vec

继续用 v0.1.9 稳定版。3000 条规则 × 256 维 float32 = 3MB——**暴力 cosine 扫 1-3ms**，不需要 ANN。v0.1.10 的 ANN 实验特性先不用。

### 5.4 新 Port 接口

```ts
// packages/ports/src/embedder.ts (新增)
export interface Embedder {
  embed(text: string): Promise<Float32Array>;   // 256-dim normalized
  embedBatch(texts: string[]): Promise<Float32Array[]>;
}

// packages/ports/src/semantic-retriever.ts (新增)
export interface SemanticRetriever {
  retrieve(
    contextVec: Float32Array,
    actionVec: Float32Array,
    options: { topK: number; scope: Scope }
  ): Promise<ScoredRule[]>;
}

// packages/ports/src/matcher.ts (既有接口)
// match() 内部实现变为 semantic-retriever + soft-AND，对上层透明
```

### 5.5 代码迁移表（DELETE / REPLACE / MODIFY / KEEP）

摘要（完整版见本文第十一节附录）：
- **DELETE**: `packages/core/src/matcher/keyword-matcher.ts`, `ast-context.ts`, `narrative-scanner/`, L0 的 `wrong_pattern_not_in_source` 检查, 抽取 prompt 的 18 类白名单
- **REPLACE**: `matcher/match.ts`（内部改调 semantic-retriever）, `extractor/prompt.ts`（产出 trigger_description + pattern_description 双描述）
- **MODIFY**: `types/knowledge-entry.ts`（新增向量字段）, `calibrator/v2/index.ts`（改为 Thompson + AutoManual 四操作）, `adapters/storage/sqlite/schema.ts`（v6 迁移）
- **KEEP**: pipeline 编排、pitfall CLI、events logging、hook bundling、compile、MMR 选择器

---

## 六、自动化保证逐点对照

用户铁律：**全自动化**。每个决策点要有算法化的证据信号，不能引入人工 review。

| 决策点 | 现状 | 新方案 | 自动化信号 |
|---|---|---|---|
| 规则抽取 | LLM 按 18 类白名单出 wrong_pattern（常失败） | LLM 产出 trigger_description + pattern_description（自由自然语言） | L0 校验仅查非空 + 长度；失败自动重试，2 次后丢弃 |
| 规则入库 | L0 substring 校验 | L0 schema-only + CONFLARE 冷启动 | CONFLARE 阈值校准完全离线批跑 |
| 规则触发 | substring 命中 | BM25+dense RRF → soft-AND 打分 > fire_threshold | 纯算法，无 LLM judge |
| 误触发抑制 | 无 | hard-negative 自动积累（见 3.6） | 事件信号（override_ignored、revert）自动转成反例向量 |
| 规则升降级 | Wilson + 时间衰减 | Thompson 采样 + AutoManual 四操作 | 滑动窗口 outcome 事件纯机械计数 |
| 冲突合并 | 字面相似度判定 | 双向量相似度 > 0.85 触发 LLM 合并判官 | 合并由 LLM 跑，但触发条件纯机械 |
| dormant 规则复活 | 无（一旦 dormant 不可自动复活） | 迁移时 hit_count≥3 的 dormant 强制升到 probation | 无人工点头 |
| CLAUDE.md 编译 | MMR + 评分排序 | 同（评分改用语义相似度做多样性度量） | 保持自动 |
| 团队规则同步 | 不在本里程碑 | —— | M5 处理 |

**零人工环节**。用户开新 session / 关 session 都是自动，所有决策都有算法回路关闭。

---

## 七、关键指标与验证

### 7.1 发布前验证场景

跑 `teamagent verify --profile=m4b`，包含：

1. **精确匹配场景**（10 个）：规则该 fire 时 fire，测 recall
2. **近义误触发场景**（20 个）：相似但不同的操作，测 precision（新增 hard-negative 检查）
3. **延迟基线**（50 次随机触发）：p50 < 50ms，p99 < 100ms
4. **复活场景**：把那 4 条 team-* dormant 规则用迁移脚本处理后，构造匹配情境看能否再次 fire

### 7.2 线上指标

新增仪表板（`teamagent stats --m4b`）：

- **真命中率** = `semantic-match.fired` ∩ `ai.override.complied` / `semantic-match.fired`
- **误触发率** = `ai.override.ignored` / `semantic-match.fired`，按 rule 分桶
- **hard-negative 抑制率** = `semantic-match.suppressed-by-negatives` / 候选 top-20 总数
- **平均 fire_threshold 分布**：每 tier 的阈值分布直方图
- **冷启动健康**：新入库规则过 CONFLARE 校准的成功率

**红线**：发布 1 周后整体误触发率 > M4-A 基线 → 立即回滚到 M4-A matcher。

**回滚实现**：旧 substring matcher 代码在 M4-B 上线后**不删除**，移到 `packages/core/src/matcher/legacy/` 目录，通过环境变量 `TEAMAGENT_MATCHER=legacy` 切回。Phase D（见 §9）的"清理老 code"改为仅清理不可恢复的相关死代码（例如 channel enum 的运行时 normalizeChannel 调用点）；legacy matcher 至少保留**到 M4-B 线上稳定 4 周 + 一次版本号 minor bump 之后**才允许删。

---

## 八、故障模式与缓解

| 故障 | 缓解 |
|---|---|
| 本地 ONNX 启动慢（首次 ~2s 加载模型） | Stop hook 里预加载模型到内存；PreToolUse 用共享内存 handle |
| 中文任务上 arctic-embed 质量不稳 | 发布前用真实中文 session 语料跑 MTEB-zh 子集做 smoke test；不过线即降级到 bge-small + 翻译层 |
| sqlite-vec 在 Windows 某些 libc 上 crash | 检测失败自动降级到纯 JS 暴力 cosine（3000 条 × 256 维仍 <50ms） |
| 两向量意外高相关（某些规则写得太像） | 入库时检查 `sim(trigger_vec, pattern_vec) > 0.88` → 自动拒收 + 通知 extractor 重写 |
| Thompson 参数被少数异常事件污染 | 引入 trimmed Beta：丢弃最大最小 5% observation，防极端值 |
| 迁移失败使线上瘫痪 | v5 → v6 迁移跑在影子表上，完成后原子 rename；失败可一键回滚 |
| 模型文件本地被破坏 | `teamagent doctor` 检查 ONNX 哈希；不对则重新下载 |

---

## 九、分阶段 rollout

**Phase A（2 天）**：
- Embedder port + ONNX 本地推理
- schema v6 迁移脚本
- 297 条存量规则批量重描述 + 重 embedding
- 新 matcher 在 **feature-flag 下并行运行**（和旧 substring matcher 同时跑，记录两边决策差异，不改线上行为）

**Phase B（2 天）**：
- Soft-AND + hard-negative + Thompson 阈值全套上线
- CONFLARE 冷启动脚本跑完所有规则
- 切 feature-flag 到新 matcher 主路径；旧 matcher 降为 fallback

**Phase C（3 天）**：
- 新校准器（AutoManual 四操作）上线，旧 Wilson 校准器退役
- dormant 规则复活任务跑完
- 观察线上指标一周

**Phase D（1 天，延后到 M4-B 线上稳定 ≥4 周之后再启动）**：
- 清理死代码引用（normalizeChannel 调用点、narrative-scanner 的引入等）
- keyword-matcher.ts / ast-context.ts 移至 `legacy/` 目录但**保留可编译**，供 env var 回滚路径使用
- 废弃字段（wrong_pattern / channel / type）保留列不删——回滚路径需要它们

总周期 ~1 周跑到 Phase C 尾；Phase D 滚动观察期后执行。每个 phase 独立 revertable。

**时间估计说明**：以上 phase 天数是乐观估计，仅作相对节奏参考；实际各 phase 可能按 2-3x 膨胀。用户 `破釜沉舟` 的约束下不按天数限制实施，但按**phase 顺序**严格不跳。

---

## 十、未解决问题（Open Questions）

### 10.1 须在 Phase A 开始前澄清的问题

- **❗ Embedding 实测延迟未验证**。§3.4 的 "~45-80ms p50" 是基于外推（BGE-small 亚毫秒 → arctic-embed 3x 更大 ≈ 30-80ms），**不是在本机实测数据**。需要在用户的 Windows 11 + 当前 CPU 上实测 arctic-embed-m ONNX-INT8 单次 embedding 的 p50/p99。如果实测 >60ms，设计要调整（候选路径：切到更小模型 bge-small + 机翻层，或 BM25-only 同步路径 + 异步 embedding 补足）。
- **CONFLARE 冷启动的 LLM 成本**。297 条存量 × 20 正负例生成 ≈ 6000+ LLM calls。估算（Haiku: ~$15-30；Sonnet: ~$100-150）。用户要不要承担？是否接受先用更粗的冷启动（群体平均阈值 0.55），牺牲第一个月的精度换成本？
- **Embedding 模型分发方式**：bundle 进 npm tarball（+60MB 安装体积） vs `teamagent init` 时从 HuggingFace 拉（首次初始化慢 10-30s）。倾向后者，但这会让离线安装不可用。

### 10.2 可以边做边决定的问题

- **团队共享 hard-negative 反例**是否有隐私风险？（反例包含代码片段的 embedding——不可逆但统计上可能泄露信号。）M5 团队同步时评估。
- **CLAUDE.md 依然必要吗？** 如果语义 matcher 对 passive-knowledge 规则也能触发，CLAUDE.md 的"基线"能力价值下降。暂时保留但在 M5 考虑移除或降级为"只给极高置信度的 canonical 规则"。
- **AI 判官合并（3.7 MERGE 操作）的成本**：Stop hook 尾部跑 LLM 合并每次估计 ~3-5s。频率 < 1 次/会话可接受，但需要监控。

### 10.3 M4-B **明确不处理**的问题（但必须说清楚）

- **抽取来源偏置（dogfood bias）未解决**。现状是 297 条规则绝大多数来自 TeamAgent 自开发对话。M4-B 让语义匹配更准、更易触发——但**更易触发一批本来就只在 TeamAgent 项目内有用的规则**，对用户部署到别的项目帮助依然有限。这个问题需要 M4-C（错误学习放宽）+ 未来的结果回路改造（M6 候选）。**M4-B 不承诺"对任意项目有帮助"**，只承诺"对 TeamAgent 项目以及类似的 TypeScript/monorepo 项目内的学到经验，真的能触发、能避坑"。

### 10.4 本设计跨出的 4 件大事

审视范围时，本 milestone 实际包含 4 个独立子系统，每一个都可独立 ship：

- **M4-B.1 Embedding 基建 + schema v6 + 存量迁移** （最底盘）
- **M4-B.2 语义 matcher（BM25+dense RRF + soft-AND + hard-negative）**（替换 matcher，保留旧校准器也能先跑起来）
- **M4-B.3 CONFLARE 冷启动 + Thompson 在线阈值自适应**（精度优化层）
- **M4-B.4 AutoManual 四操作校准器重写**（修死亡螺旋）

一起做的好处：一次破釜沉舟不回头。
一起做的风险：上线后出问题，不知道是哪一层的锅；回滚颗粒度只有"回到 M4-A 全量"。

**用户决定**：是一个 milestone 一起上（默认），还是拆成 4 个小 milestone 按顺序上？

---

## 十一、代码迁移清单（附录）

### DELETE（纯删）

| 文件 | 理由 |
|---|---|
| `packages/core/src/matcher/keyword-matcher.ts` | substring 匹配引擎整体废弃 |
| `packages/core/src/matcher/ast-context.ts` | AST 过滤（注释/字符串排除）不再需要，语义匹配自带情境识别 |
| `packages/core/src/matcher/__tests__/keyword-matcher.test.ts` | 对应测试 |
| `packages/core/src/matcher/__tests__/ast-context.test.ts` | 对应测试 |
| `packages/core/src/narrative-scanner/` 全目录 | 并入统一 semantic matcher（按上下文来源 routing） |
| `packages/core/src/validator/l0.ts` 的 `wrong_pattern_not_in_source` 检查 | substring 校验不再成立 |
| `packages/core/src/extractor/prompt.ts` 的 18 类白名单段 | 改为双描述 prompt |

### REPLACE（保持接口、重写内部）

| 文件 | 接口保留 | 内部变化 |
|---|---|---|
| `packages/core/src/matcher/match.ts` | `match(context, rules)` 签名不变 | 调 semantic-retriever + soft-AND 打分 |
| `packages/ports/src/matcher.ts` | Port interface 保留 | 参数语义变更，文档更新 |
| `packages/core/src/extractor/prompt.ts` | `buildExtractionPrompt()` 签名不变 | 输出 schema 改为 trigger/pattern_description 双字段 |
| `packages/core/src/extractor/llm-based.ts` | 返回 `Partial<KnowledgeEntry>` | 新字段 |
| `packages/adapters/src/storage/sqlite/sqlite-knowledge-store.ts` | CRUD 接口保留 | 加新字段映射，废字段保留列读旧数据 |

### MODIFY（小改）

| 文件 | 改动 |
|---|---|
| `packages/types/src/knowledge-entry.ts` | 加 `trigger_description`, `pattern_description`, `trigger_vec`, `pattern_vec`, `hard_negatives`, `threshold_alpha/beta`, `fire_threshold`, `observation_window` 字段；废字段 `channel`/`type`/`wrong_pattern` 保留但注释 @deprecated |
| `packages/adapters/src/storage/sqlite/schema.ts` | 加 v6 迁移：ALTER TABLE + 新 vec 虚表 + FTS5 表 |
| `packages/core/src/calibrator/v2/index.ts` | 改为 Thompson Beta + AutoManual 四操作 |
| `packages/core/src/calibrator/v2/wilson.ts` | 可保留供 confidence 计算参考，但不再决定 tier 转移 |
| `packages/core/src/compiler/markdown.ts` | MMR 多样性计算改用 trigger_vec Jaccard→cosine |

### NEW（新增）

| 文件 | 作用 |
|---|---|
| `packages/ports/src/embedder.ts` | Embedder Port |
| `packages/ports/src/semantic-retriever.ts` | SemanticRetriever Port |
| `packages/adapters/src/embedding/local-onnx-embedder.ts` | arctic-embed ONNX 本地实现 |
| `packages/adapters/src/retriever/sqlite-vec-retriever.ts` | BM25 + sqlite-vec RRF 融合 |
| `packages/core/src/matcher/soft-and-scorer.ts` | soft-AND 打分 + hard-negative 惩罚 |
| `packages/core/src/matcher/threshold/thompson.ts` | 每规则 Thompson 阈值采样 |
| `packages/core/src/matcher/threshold/conflare-calibrate.ts` | CONFLARE 冷启动脚本 |
| `packages/core/src/calibrator/automan/operators.ts` | CREATE/UPDATE/MERGE/DELETE 算子 |
| `packages/cli/src/commands/migrate-v6.ts` | 存量规则迁移 CLI |

### KEEP（不动）

- `packages/core/src/pipeline/*` — 编排稳定
- `packages/cli/src/commands/pitfall.ts`, `scan-errors.ts`, `ingest.ts` — 抽取入口不变
- `packages/adapters/src/hook/*` — hook bundling 逻辑无关匹配实现
- `packages/adapters/src/attribution/*` — 事件广播不变
- `packages/adapters/src/session-source/*` — session 捕获不变
- `packages/cli/src/commands/compile.ts` — 编译出口接口不变（内部评分来源换了）
- `knowledge.jsonl` 外部文件格式 — JSONL 仍旧，embedding 在入库时算，不进 JSONL

---

**设计结束。待用户 review 后进入 writing-plans 阶段生成实施计划。**
