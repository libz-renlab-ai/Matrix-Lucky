# TeamAgent Phase 2 设计文档 v2

> 创建日期：2026-04-15
> 版本：v2（取代 v1 `2026-04-15-phase2-design.md`）
> 状态：Draft（待用户审）
> 父文档：`2026-04-15-product-roadmap-v2.md`
> 前置背景：`docs/specs/2026-04-15-phase2-backlog.md`

---

## 一、Phase 2 的单句目标

> **把本地单用户的体验从"能用"做到"好用"，并首次引入 wiki 维度（inline 对话注入）。**

Phase 2 **不扩范围**（不请新用户、不接新工具、不做团队同步），专注两件事：
1. **把避坑的机制从"拍脑袋权重"做到"业界严谨水平"**
2. **加入前沿 wiki 知识维度**

---

## 二、设计哲学（6 条铁律）

1. **不造轮子**：每个可以用 2026 成熟开源库做的事，都用库；我们只写业务逻辑
2. **RAG-first**：所有规则按相关性动态注入，**禁止把全部规则塞进 CLAUDE.md**
3. **降分重于升分**：false positive 的代价远高于 true positive 的收益（非对称惩罚）
4. **Tier 驱动行为**：规则当前 tier 决定它出现在哪些通道、用什么惩罚权重
5. **实时观察可调参**：新加的每个权重、阈值、策略都要有 CLI 命令 inspect + config 热加载
6. **Phase 1 信号不继承**：v2 从零重学，Phase 1 32 条规则作为经验教训而非评分

---

## 三、3 个 Sub-project 清单

```
SP-1 [好用化]        把能用做到好用                   ← 最大块
SP-2 [A/B 评估]      用硬数据证明效果                  ← 度量尺
SP-3 [Wiki + Inline] 开新维度                         ← 新能力
```

### 依赖关系

```
                 SP-1 基础设施 + Calibrator v2
                  ↓
   ┌──────────────┼──────────────┐
   ↓              ↓              ↓
SP-2 Benchmark  SP-3 Wiki      SP-3 Inline
                               (依赖 SP-3 Wiki 先有数据)
```

- **SP-1 必须最先**：所有其它 sub-project 都依赖 SQLite/Hook/Calibrator 新架构
- SP-2 / SP-3 可并行
- SP-3 内部：Wiki 存储 → Inline 注入

---

## 四、核心机制：Calibrator v2 规格

### 4.1 双轨分数

每条规则维护**两个独立数值**：

| 数值 | 范围 | 负责 | 公式 |
|------|------|------|------|
| `confidence` | [0, 1] | 晋升决策 | Wilson Score Lower Bound + 时间衰减 |
| `demerit` | [0, ∞) | 降级决策 | 驾照扣分制 + log-loss 放大 + 时间衰减 |

**`effective_tier = min(tier_from_confidence, tier_from_demerit)`** — 悲观者赢。

### 4.2 Confidence 公式（Wilson LB + 指数衰减）

```typescript
function computeConfidence(rule: Rule, now: Date): number {
  // 1. 时间衰减加权每个观察
  const halfLife = HALF_LIFE_BY_MAX_HISTORICAL_TIER[rule.maxTierEver]; // 防复发
  const lambda = Math.LN2 / halfLifeInDays(halfLife);
  
  let weightedSuccess = 0;
  let weightedFailure = 0;
  
  for (const obs of rule.observations) {
    const daysAgo = (now - obs.timestamp) / DAY;
    const weight = Math.exp(-lambda * daysAgo);
    if (obs.outcome === "success") weightedSuccess += weight;
    else weightedFailure += weight;
  }
  
  const n = weightedSuccess + weightedFailure;
  if (n === 0) return 0;
  
  // 2. Wilson Score Lower Bound (95% confidence)
  const p = weightedSuccess / n;
  const z = 1.96;
  return (p + z*z/(2*n) - z*Math.sqrt(p*(1-p)/n + z*z/(4*n*n))) / (1 + z*z/n);
}
```

**HALF_LIFE_BY_MAX_HISTORICAL_TIER**（Q4 决策：按历史最高 tier 防复发）：
```
experimental:  30 days
probation:     45 days
stable:        60 days
canonical:     75 days
enforced:      90 days
```

### 4.3 Demerit 公式（驾照扣分 + log-loss）

```typescript
function addDemerit(rule: Rule, event: FalsePositiveEvent, now: Date): void {
  // 1. 先按"上次更新到现在"衰减现有 demerit
  const demeritLambda = Math.LN2 / demeritHalfLifeDays(rule.currentTier); // Q4 决策: 按当前 tier
  const daysSince = (now - rule.demeritLastUpdated) / DAY;
  rule.demerit *= Math.exp(-demeritLambda * daysSince);
  
  // 2. 计算新增惩罚
  const baseByTier = {
    experimental: 1,
    probation: 2,
    stable: 3,
    canonical: 5,
    enforced: 10
  };
  
  // log-loss 放大：越自信错得越惨
  const multiplier = rule.confidence > 0.5
    ? -Math.log(1 - rule.confidence)
    : 1.0;
  
  // 用户显式 reject 额外 +10
  const userOverride = event.source === "user_reject" ? 10 : 0;
  
  const delta = baseByTier[rule.currentTier] * multiplier + userOverride;
  rule.demerit += delta;
  rule.demeritLastUpdated = now;
  
  // 3. 检查死亡链阈值
  checkDeathChain(rule);
}

const DEMERIT_HALF_LIFE_BY_CURRENT_TIER = {
  experimental: 7,    // 实验规则允许快速改过
  probation: 10,
  stable: 14,
  canonical: 21,
  enforced: 28        // 高 tier 的污点记得久一点
};
```

### 4.4 5-Tier 映射

| Tier | Conf 阈值 | Hook 行为 | CLAUDE.md | Agent Skills 导出 | Demerit half-life (天) |
|------|---------|----------|-----------|-----------------|----------------------|
| experimental | [0.00, 0.30) | 不 fire（只 trace） | ❌ | ❌ | 7 |
| probation | [0.30, 0.55) | warn only（不 block） | ❌ | ❌ | 10 |
| stable | [0.55, 0.75) | warn，按配置可 block | ❌ | ✅ | 14 |
| canonical | [0.75, 0.90) | 所有 enforcement 可用 | ✅ 候选 top-N | ✅ | 21 |
| enforced | [0.90, 1.00] | 强制 block 允许，最高优先级 | ✅ 优先 top-N | ✅ | 28 |

### 4.5 Hysteresis（防抖）

```
晋升条件（同时满足）：
  1. confidence 跨上界阈值
  2. 当前 tier 已停留 ≥ 10 obs
  3. demerit < 降级阈值的 50%

降级条件（任一满足）：
  1. confidence 跨下界阈值 AND 上次 tier transition ≥ 7 天
  2. demerit 跨死亡链阈值（立即触发，无延迟）
```

### 4.6 4 级死亡链

```
demerit ≥ 5   → 软降级 1 tier       (立即)
demerit ≥ 15  → 硬降级 2 tier       (立即 + 锁在 experimental 至少 14 天)
demerit ≥ 30  → 自动归档 dormant    (hook 停 fire，CLAUDE.md/Skills 移除)
demerit ≥ 50  → 提示用户删除        (永不自动删，等 `teamagent delete <id>` 确认)
```

### 4.7 复活路径

- `dormant` 状态 180 天无手动干预 + 无相似规则冲突 → 进"冷藏"（保留学习数据但完全不参与决策）
- 用户可用 `teamagent revive <id>` 把 dormant 拉回 experimental，demerit=0，`resurrect_count +=1`
- 累计 3 次 resurrect 的规则 → 永久归档不再允许 revive（防止用户死循环挽救错规则）

### 4.8 透明化：Calibrator 事件日志

每次 calibrate 写**完整 delta 分解**：

```json
{
  "rule_id": "axios-to-fetch",
  "timestamp": "2026-04-15T10:30:00Z",
  "confidence_before": 0.68,
  "confidence_after": 0.72,
  "tier_before": "probation",
  "tier_after": "probation",
  "demerit_before": 3.2,
  "demerit_after": 2.9,
  "delta_breakdown": [
    { "type": "obs_added", "outcome": "success", "weight": 1.0, "conf_delta": +0.04 },
    { "type": "demerit_decay", "days_since": 2, "delta": -0.3 }
  ],
  "tier_transition": null,
  "reason_for_no_transition": "hysteresis: current tier duration 3 days < required 7 days"
}
```

用户可 `teamagent stats --explain <rule-id>` 看完整解释。

---

## 五、SP-1 好用化 — 详细设计

### 5.1 10 项改进清单

| # | 项目 | 优先级 | 估时 |
|---|------|:---:|:---:|
| 1 | 基础设施替换（SQLite / tree-sitter / Agent SDK 等） | 🔴 极高 | 5-7 天 |
| 2 | **Calibrator v2**（Wilson + Demerit + 5-tier） | 🔴 极高 | 4-5 天 |
| 3 | 规则质量 Validator（分级：机械 / Haiku / Sonnet） | 🔴 极高 | 2-3 天 |
| 4 | **AI Override Signal 闭环**（Post hook 分析 + Calibrator 新信号） | 🔴 极高 | 2 天 |
| 5 | 结构化 Auto-Repair 输出（含 tier / confidence / regex） | 🟠 高 | 1-2 天 |
| 6 | **多源规则摄入**（6 源） | 🟠 高 | 4-5 天 |
| 7 | 双出口编译（Agent Skills + Hook config） | 🟡 中 | 2 天 |
| 8 | correct_pattern 加 code_example / import_path / tldr | 🟡 中 | 1 天 |
| 9 | 规则冲突自动检测（sqlite-vec + LLM） | 🟡 中 | 2 天 |
| 10 | CEL `when_expression`（复杂条件可选字段） | 🟢 低 | 1 天 |

**总工作量**：~25-30 天有效工作

### 5.2 基础设施替换（项 1 详细）

**存储迁移**：JSONL → SQLite

```sql
-- 知识表（替代 JsonlKnowledgeStore）
CREATE TABLE knowledge (
  id TEXT PRIMARY KEY,
  scope_level TEXT,              -- personal / team / global
  category TEXT,                 -- C/E/S/K/W (新加 W 表 wiki)
  type TEXT,                     -- avoidance / success / wiki / fact
  trigger TEXT,
  wrong_pattern TEXT,
  correct_pattern_code_example TEXT,   -- Q: 新 sub-field
  correct_pattern_import_path TEXT,    -- Q: 新 sub-field
  correct_pattern_tldr TEXT,           -- Q: 新 sub-field (Shapira WHY)
  reasoning TEXT,
  when_expression TEXT,          -- CEL 可选
  confidence REAL,
  demerit REAL,
  demerit_last_updated TEXT,
  current_tier TEXT,             -- experimental/probation/stable/canonical/enforced/dormant
  max_tier_ever TEXT,            -- 防复发用（Q4）
  tier_entered_at TEXT,
  resurrect_count INTEGER DEFAULT 0,
  source TEXT,                   -- detector / insights / npm_audit / pr / git_log / ci / imported
  tags TEXT,                     -- JSON array
  scope_paths TEXT,              -- JSON array
  scope_file_types TEXT,         -- JSON array
  created_at TEXT,
  last_validated_at TEXT
);

CREATE INDEX idx_tier ON knowledge(current_tier);
CREATE INDEX idx_scope ON knowledge(scope_level);

-- 观察表（替代部分 Event Log）
CREATE TABLE observations (
  id TEXT PRIMARY KEY,
  knowledge_id TEXT,
  timestamp TEXT,
  outcome TEXT,                  -- success / failure
  source_event TEXT,             -- 关联的 event_id
  tool_use_id TEXT
);

CREATE INDEX idx_obs_knowledge ON observations(knowledge_id, timestamp DESC);

-- 向量表（sqlite-vec 扩展）
CREATE VIRTUAL TABLE knowledge_vec USING vec0(
  knowledge_id TEXT PRIMARY KEY,
  embedding float[384]  -- all-MiniLM-L6-v2
);

-- 事件表（全历史）
CREATE TABLE events (
  id TEXT PRIMARY KEY,
  kind TEXT,                     -- hook-pre.* / hook-post.* / calibrator.* / ai.override.*
  knowledge_id TEXT,
  tool_use_id TEXT,
  timestamp TEXT,
  payload TEXT                   -- 结构化 JSON
);

CREATE INDEX idx_events_kind ON events(kind, timestamp DESC);
```

**Hook 层替换**：手写协议 → `@anthropic-ai/claude-agent-sdk`

```typescript
import { PreToolUseHook, PostToolUseHook } from "@anthropic-ai/claude-agent-sdk";

const preHook: PreToolUseHook = async ({ tool_name, tool_input, tool_use_id }) => {
  const rules = await matcher.match({ tool_name, tool_input });
  const decisions = rules.map(r => rule_to_decision(r));
  return { permissionDecision: worstDecision(decisions), reason: formatReason(decisions) };
};
```

**Matcher 升级**：子串 → **tree-sitter 上下文感知**

```typescript
// 对 TypeScript/JS/Python/Go/Rust/Bash 解析 AST
// 跳过 string literal / comment / markdown code block / doc context
function matcher(toolInput: ToolInput, rule: Rule): MatchResult {
  const ast = await parseWithTreeSitter(toolInput.content, detectLanguage(toolInput));
  const matches = findMatches(ast, rule.wrongPattern);
  const realMatches = matches.filter(m => !isInCommentOrString(m));
  return { matched: realMatches.length > 0, locations: realMatches };
}
```

### 5.3 规则质量 Validator（项 3，Q2 决策 D 分级）

```
┌─────────────────────────────────────────────────────────────────┐
│ Level 0 — 机械检查（入库前，对所有规则，免费，毫秒级）              │
│                                                                  │
│  1. wrong_pattern 在源 diff 里 grep 真存在？                      │
│  2. correct_pattern.import_path 解析存在？                       │
│  3. scope.file_types 与项目 stack 一致？                          │
│  4. 与现有规则 trigger 有字面冲突？                                │
│  5. scope.paths 不为空且合法路径？                                 │
│                                                                  │
│  5 项通过 → 入 experimental tier                                  │
│  任一失败 → 丢弃 + 写 rejection log 给用户 review                  │
└─────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────┐
│ Level 1 — Haiku 语义检查（晋升 stable 时触发）                     │
│                                                                  │
│  - 规则是否 specific enough？trigger 是否会误报大量场景？           │
│  - correct_pattern 是否 compilable？（tree-sitter 尝试）          │
│  - 和 top-5 相似规则用 embedding 比较，有矛盾吗？                  │
│                                                                  │
│  通过 → 允许晋升到 stable                                         │
│  失败 → 规则降回 probation + 标记 validation_failure              │
└─────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────┐
│ Level 2 — Sonnet 深度检查（晋升 canonical+ 时触发）                │
│                                                                  │
│  - 综合分析最近 20 次命中的真实 tool_input 样本                    │
│  - 检测是否有"过拟合到特定项目"的风险                              │
│  - 规则与团队最佳实践是否一致                                       │
│                                                                  │
│  通过 → 允许晋升到 canonical                                      │
│  失败 → 规则停在 stable + 要求用户手动 review                     │
└─────────────────────────────────────────────────────────────────┘
```

**成本估计**：
- 90% 规则只用 Level 0（零 API 成本）
- 7% 升到 stable 走 Level 1（Haiku ~$0.001/次）
- 3% 升到 canonical+ 走 Level 2（Sonnet ~$0.05/次）
- **总增量约原 Extractor 成本的 +5-10%**

### 5.4 AI Override Signal 闭环（项 4）

**新增事件 kind**：
- `ai.override.complied` — Hook warn 后 AI 改了做法
- `ai.override.ignored` — Hook warn 后 AI 原样重来

**检测逻辑**（在 PostToolUse hook 里）：

```typescript
async function detectOverrideSignal(toolUseId: string) {
  const recent = await db.events.readLast({ limit: 20 });
  const warnEvent = recent.find(e => 
    e.kind === "hook-pre.warned" && 
    isSameToolSession(e.tool_use_id, toolUseId)
  );
  if (!warnEvent) return;
  
  const currentEvent = await db.events.read({ tool_use_id: toolUseId });
  const sameRuleStillMatches = await matcher.matches(currentEvent.tool_input, warnEvent.knowledge_id);
  
  const signal = sameRuleStillMatches 
    ? "ai.override.ignored" 
    : "ai.override.complied";
  
  await db.events.append({ kind: signal, knowledge_id: warnEvent.knowledge_id, tool_use_id: toolUseId });
  
  // 喂 Calibrator
  if (signal === "ai.override.ignored") {
    addDemerit(rule, { source: "ai_ignored_warn" });
  } else {
    addObservation(rule, { outcome: "success" });
  }
}
```

**实时观察**：`teamagent stats --override-signals --live` 流式显示每次 override 事件。

### 5.5 多源规则摄入（项 6，Q3 决策 B）

**自动管道（4 源）**：
```
┌────────────────────────────────────────────────────────────────┐
│ Detector (现有 4 信号)                                          │
│   denial / multi_failure / code_edit / suggestion_override     │
│      ↓                                                         │
│ /insights 报告                                                 │
│   命令: teamagent ingest --from-insights <report.json>         │
│      ↓                                                         │
│ npm/pip audit                                                  │
│   命令: teamagent ingest --from-audit                          │
│      ↓                                                         │
│ PR review comments                                             │
│   命令: teamagent ingest --from-pr <pr-number>                 │
│      ↓                                                         │
│ LLM Extractor (Claude Sonnet)                                  │
│      ↓                                                         │
│ Validator Level 0 (机械检查)                                    │
│      ↓                                                         │
│ 入库 experimental tier                                         │
└────────────────────────────────────────────────────────────────┘
```

**半自动管道（2 低 SNR 源）**：
```
┌────────────────────────────────────────────────────────────────┐
│ teamagent ingest --from-git --since=30d --dry-run              │
│ teamagent ingest --from-ci --since=30d --dry-run               │
│                                                                │
│   输出候选列表:                                                 │
│   [  ] Candidate 1: "src/utils/path.ts 90 天内被修 5 次..."     │
│          建议规则: ...                                          │
│   [  ] Candidate 2: ...                                        │
│                                                                │
│   用户 review → 勾选接受 → 进入自动管道                         │
└────────────────────────────────────────────────────────────────┘
```

### 5.6 双出口编译（项 7，Q6 决策 A）

```typescript
async function compileRules() {
  const rules = await db.knowledge.findAll({ current_tier: { $in: ACTIVE_TIERS }});
  
  // 出口 1：CLAUDE.md（只 canonical+，token 预算制）
  const claudeMdRules = rules
    .filter(r => ["canonical", "enforced"].includes(r.current_tier))
    .sort(byScoreDesc);
  const claudeMd = budgetedCompile(claudeMdRules, { maxTokens: 2000 });
  await fs.writeFile("CLAUDE.md", claudeMd);
  
  // 出口 2：Agent Skills（只 stable+，Q6 决策）
  const skillsRules = rules
    .filter(r => ["stable", "canonical", "enforced"].includes(r.current_tier));
  for (const r of skillsRules) {
    const skillPath = `~/.claude/skills/teamagent/${r.id}/SKILL.md`;
    await fs.writeFile(skillPath, formatAsAgentSkill(r));
  }
  
  // 出口 2 反向：删除降级规则的 skill 文件
  const demotedRules = await getRecentlyDemoted("stable+");
  for (const r of demotedRules) {
    const skillPath = `~/.claude/skills/teamagent/${r.id}/SKILL.md`;
    await fs.unlink(skillPath).catch(() => {}); // 方案 1: 直接删
  }
}
```

---

## 六、SP-2 A/B 评估 — 详细设计

### 6.1 4 组对比目标

对比**相同任务集在 4 种环境**下的 AI 表现：

| 组 | 环境 | 作用 |
|---|------|------|
| 1 | 裸 Claude Code（无任何规则/记忆） | 基线 |
| 2 | Claude Code + 内建 Auto-Memory | Anthropic 官方方案 |
| 3 | Claude Code + Codacy Guardrails | 代表"手写规则实时拦截"流派 |
| 4 | Claude Code + TeamAgent v2 | 我们 |

### 6.2 标准任务集

**≥ 30 个任务**，覆盖：
- 技术选型（axios vs fetch、Zustand vs Redux 等）
- API 幻觉（虚构不存在的函数）
- 路径错误（Windows 反斜杠、绝对/相对路径）
- 工作流顺序（测试前构建、迁移前备份）
- 依赖安全（旧版库、已弃用 API）
- 项目规范（文件命名、代码风格）
- 框架特定坑（React useEffect 死循环等）
- Bash / shell 陷阱
- TypeScript 类型陷阱
- 性能反模式

任务定义：
```typescript
interface BenchmarkTask {
  id: string;
  name: string;
  category: "tech_choice" | "api_hallucination" | "path" | "workflow" | ...;
  prompt: string;                    // 给 AI 的任务描述
  expected_wrong_patterns: string[]; // 典型错误做法
  expected_correct_patterns: string[]; // 正确做法
  evaluator: (output: string) => { correct: boolean, reason: string };
}
```

### 6.3 Benchmark Runner

```bash
# 一次性跑所有组
pnpm benchmark --task-set=standard --runs=3 --output=benchmark-report.json

# 只跑我们组
pnpm benchmark --groups=teamagent-v2

# 逐组对比报告
pnpm benchmark --report benchmark-report.json
```

### 6.4 度量指标

| 指标 | 定义 |
|------|------|
| **PRR** (Pitfall Reduction Rate) | 相对基线组，犯同类错误次数的相对下降比 |
| **FP Rate** | 规则错误地阻止了正确做法的比率 |
| **Override Ignore Rate** | AI 被 warn 后仍原样执行的比率 |
| **Token Overhead** | 每任务平均 token 消耗 vs 基线 |
| **Task Completion Time** | 从 prompt 到完成的平均时长 |
| **Unsolicited Knowledge Hits** | inline wiki 被 AI 实际采纳的次数 |

### 6.5 报告格式

```
BenchmarkReport {
  generated_at: "2026-XX-XX"
  task_set: "standard v1"
  runs_per_task: 3
  total_tasks: 30
  
  groups: [
    { name: "baseline", prr: 0.00, fp_rate: 0.00, token_overhead: 1.00 },
    { name: "auto-memory", prr: 0.18, fp_rate: 0.05, token_overhead: 1.15 },
    { name: "codacy", prr: 0.25, fp_rate: 0.12, token_overhead: 1.22 },
    { name: "teamagent-v2", prr: 0.42, fp_rate: 0.06, token_overhead: 1.08 }
  ],
  
  per_task: [...],
  
  summary: "TeamAgent v2 PRR 0.42 vs 0.18 (Auto-Memory): +24pp absolute improvement."
}
```

### 6.6 退出标准

Phase 2 完成需要 benchmark 满足：
- TeamAgent v2 PRR **≥ max(Auto-Memory, Codacy) + 10pp**
- TeamAgent v2 FP Rate **≤ max(Auto-Memory, Codacy)**
- TeamAgent v2 Token Overhead **≤ 1.15×** 基线

---

## 七、SP-3 Wiki + Inline 注入 — 详细设计

### 7.1 Wiki 摄入 Pipeline

```
┌──────────────────────────────────────────────────────────────────┐
│ 源                                                                │
│  ├─ GitHub releases API（用户订阅的 repo）                         │
│  ├─ npm registry 版本更新                                         │
│  ├─ RSS feeds（官方 blog / changelog）                            │
│  ├─ 用户手动 seed: teamagent wiki:add <url>                       │
│  └─ arxiv RSS（学术前沿，可选）                                    │
└──────────────────────────────────────────────────────────────────┘
      ↓
┌──────────────────────────────────────────────────────────────────┐
│ 抓取                                                              │
│  ├─ rss-parser（Atom/RSS）                                        │
│  ├─ @mozilla/readability（网页正文）                              │
│  └─ Firecrawl（可选，应付 JS-rendered 页面）                       │
└──────────────────────────────────────────────────────────────────┘
      ↓
┌──────────────────────────────────────────────────────────────────┐
│ LLM 判断（Claude Haiku）                                          │
│  - 该内容对 <detect-stack 结果的项目> 有价值吗？                   │
│  - 抽核心 1-2 句话（"TL;DR: axios 0.30 新增 AbortSignal 原生"）    │
│  - 标关键词列表（axios / fetch / AbortSignal ...）                 │
└──────────────────────────────────────────────────────────────────┘
      ↓
┌──────────────────────────────────────────────────────────────────┐
│ 存储到 SQLite（type=wiki）                                        │
│  - sqlite-vec 嵌入 TL;DR 入向量表                                  │
│  - 标记 source=<feed-name>、published_at、confidence=0.7(默认)    │
│  - 用户也可 thumbs-down 标记 → demerit +5                         │
└──────────────────────────────────────────────────────────────────┘
```

**触发**：
- 手动 `teamagent wiki:pull`
- Cron（每日 3am）
- Session start hook（每周一次补充）

### 7.2 Inline 注入 Pipeline

```
User types prompt → Claude Code
      ↓
UserPromptSubmit hook fires
      ↓
我们的 hook:
  1. 从 tool_input.prompt 提取关键词（代码块、库名、函数名）
  2. 同时扫 last_assistant_turn 内容
  3. sqlite-vec 查 wiki 表，筛选:
     - cosine similarity > 0.75
     - published_at < 90 天
     - user_thumbs_down 为 false
     - 本 session 内未注入过（频控）
  4. Top-3 匹配结果
      ↓
  5. stdout 输出注入上下文:
     ---
     📚 [WIKI HINT — 若本次回答涉及以下主题，请在末尾添加
         "💡 Latest Wiki" 小节（每条 1-2 行，引用来源）：]
       - axios 0.30: 新增 AbortSignal 原生支持 (npm changelog 2026-03)
       - Zustand v5: createStore API 破坏性变更 (zustand docs)
     ---
      ↓
  6. 无匹配 → 输出空
      ↓
Claude 正常回答，若相关则自带 "💡 Latest Wiki" 小节
```

### 7.3 Wiki 数据模型

```sql
-- Wiki 条目作为 knowledge 的一种特殊类型
-- type='wiki', category='W'
-- 复用 knowledge 表 schema + 以下专用字段通过 tags 编码:
--   ["source:github:anthropics/claude-code", "published:2026-03-15", "topic:axios"]

-- Wiki 专用 metadata 表
CREATE TABLE wiki_meta (
  knowledge_id TEXT PRIMARY KEY,
  source_url TEXT,
  source_type TEXT,         -- github_release / rss / manual / npm / arxiv
  published_at TEXT,
  tldr TEXT,                -- 1-2 句核心摘要
  keywords TEXT,            -- JSON array
  user_thumbs_down BOOLEAN DEFAULT FALSE,
  inline_injection_count INTEGER DEFAULT 0
);
```

### 7.4 频控与 token 预算

```typescript
const INLINE_WIKI_BUDGET = {
  max_per_prompt: 3,            // 单次最多注入条数
  max_per_session: 15,          // 每 session 上限
  min_similarity: 0.75,         // 余弦相似度门槛
  max_age_days: 90,             // 太老的 wiki 不注入
  token_budget_per_injection: 200,  // 每条 wiki 压缩到 200 tokens 以内
  cooldown_per_wiki: 3          // 同一条 wiki 3 轮内不重复
};
```

---

## 八、4 通道知识交付（RAG-native 架构）

```
┌──────────────────────────────────────────────────────────────────┐
│ 通道 1: CLAUDE.md (always-on 静态)                                │
│   每 session 启动加载                                             │
│   💰 token 预算: < 2,000 tokens (硬上限)                         │
│   📦 只 canonical+ 的 top N 条                                   │
└──────────────────────────────────────────────────────────────────┘
┌──────────────────────────────────────────────────────────────────┐
│ 通道 2: Agent Skills (pull-based)                                │
│   Claude 根据对话决定何时 invoke                                   │
│   💰 token 成本: 0 基线 + 仅调用时 ~200 tokens/skill             │
│   📦 所有 stable+ 导出到 ~/.claude/skills/teamagent/             │
└──────────────────────────────────────────────────────────────────┘
┌──────────────────────────────────────────────────────────────────┐
│ 通道 3: Hook 拦截 (push-based)                                   │
│   每次 tool_use 时 SQLite 查匹配                                  │
│   💰 token 成本: 0 基线 + 命中时 ~300 tokens                     │
│   📦 所有 experimental+ 规则都参与 query                         │
└──────────────────────────────────────────────────────────────────┘
┌──────────────────────────────────────────────────────────────────┐
│ 通道 4: UserPromptSubmit Wiki 注入                               │
│   用户发言时 sqlite-vec 语义匹配                                   │
│   💰 token 成本: 0 基线 + 命中时 ≤ 600 tokens                    │
│   📦 wiki 类条目，阈值 + 频控严格                                 │
└──────────────────────────────────────────────────────────────────┘
```

**基线 session token**：
- 启动：< 2,000 tokens（CLAUDE.md 硬上限）
- 每条消息：0 额外（Wiki 不命中时）
- 命中时增量：≤ 900 tokens（3×300 tool-call match 或 3×200 wiki × 预算比例）

**可扩展性**：即便规则/wiki 总数涨到 500 条，**每条消息的静态 overhead 仍是 2k**。

---

## 九、存储架构（混合双层，Q1 决策 C）

```
<project>/.teamagent/knowledge.db       ← Personal 作用域（project-specific）
                                          规则标记 scope.level="personal"

~/.teamagent/global.db                  ← Global 作用域（cross-project）
                                          规则标记 scope.level="global"

[Phase 4+ 新增]
~/.teamagent/team/<team-id>.db         ← Team 作用域（团队同步）
                                          规则标记 scope.level="team"
```

**查询时合并**：

```typescript
async function findMatchingRules(toolInput: ToolInput): Promise<Rule[]> {
  const [personal, global] = await Promise.all([
    projectDb.findActive({ scope_level: "personal" }),
    userDb.findActive({ scope_level: "global" })
  ]);
  return [...personal, ...global]
    .filter(r => matcher.match(r, toolInput));
}
```

**迁移规则**：
- Phase 1 所有规则**默认 scope.level="personal"**，存 project 级 DB
- 用户可用 `teamagent promote <rule-id> --to=global` 升级到 user 级
- Phase 4 时加入 `--to=team`

---

## 十、Phase 1 → v2 数据迁移（Q5 决策 B：干净重启）

```typescript
async function migratePhase1ToV2() {
  const oldRules = await readJsonl("~/.teamagent/personal/knowledge.jsonl");
  
  for (const old of oldRules) {
    const newRule = {
      ...old,
      confidence: 0.0,          // 从零起步（0.30 是 probation 下界，experimental tier 起点必须 < 0.30）
      demerit: 0,
      demerit_last_updated: now(),
      current_tier: "experimental",
      max_tier_ever: "experimental",
      tier_entered_at: now(),
      resurrect_count: 0,
      // hit_count / success_count 作为历史参考存 tags
      tags: [...(old.tags || []), `phase1_hit_count:${old.hit_count}`, `phase1_last_hit:${old.last_hit_at}`],
      // observations 表清空，v2 从零积累
    };
    
    // 运行 Validator Level 0 机械检查
    if (await validatorLevel0(newRule)) {
      await db.knowledge.insert(newRule);
    } else {
      await writeToRejectionLog(old, "L0 check failed on migration");
    }
  }
}
```

**迁移后**：
- Phase 1 规则全部落在 experimental tier
- **Hook 暂时不 fire**（experimental tier 不参与 Hook）
- 用户正常使用过程中，规则按 v2 的 Wilson + Demerit 机制重新积累 obs
- 1-2 周后高质量规则会自然晋升 probation/stable 等
- 用户**不选 fast-track 命令**（决策：不要）—— 相信新机制自己爬

---

## 十一、Phase 2 整体退出标准

**必须全部满足**：

1. ✅ **Benchmark 硬数据**：4 组对比显示 TeamAgent v2 PRR ≥ max(Auto-Memory, Codacy) + 10pp
2. ✅ **False Positive**：benchmark 中 FP Rate ≤ Codacy 的 FP Rate
3. ✅ **Token Overhead**：benchmark 中 ≤ 1.15×
4. ✅ **成功经验**：从真实 dogfood 累积 ≥ 10 条 type=success
5. ✅ **Wiki 条目**：累积 ≥ 30 条，inline 注入月均 ≥ 5 次/session，用户主观评估"不打扰"
6. ✅ **长期稳定性**：连续 dogfood ≥ 30 天无规则反噬、无手动干预
7. ✅ **SP-1 10 项**全部完成，Phase 1 遗留的 30+ 漏洞覆盖 ≥ 80%

---

## 十二、待确认点

1. **Calibrator v2 的公式细节**（Wilson + Demerit + 各权重）完整可行吗？有没有该调的参数？
2. **4 通道知识交付**的 token 预算分配（CLAUDE.md 2000 / wiki 每条 200）是否合理？
3. **Benchmark 30 个任务集**的 categorization（10 类）有遗漏吗？
4. **Wiki 的 5 个源**（GitHub releases / npm / RSS / 手动 / arxiv）有要删或加的吗？
5. **3 SP 的开发顺序**（SP-1 优先 → SP-2/3 并行）你认可吗？
6. **退出标准的 7 条**量化阈值（10pp PRR、30 个 wiki 条等）合理吗？

---

## 十三、实施顺序与里程碑

**Phase 2 建议执行顺序**（不绑定时间，按"做好"原则）：

```
M2.1 基础设施就位
  ├─ SQLite 迁移 + schema 完整
  ├─ tree-sitter 集成
  ├─ Claude Agent SDK 接入
  └─ 从 Phase 1 干净迁移数据

M2.2 Calibrator v2 核心
  ├─ Wilson LB 实现 + 测试
  ├─ Demerit 积分 + 4 级死亡链
  ├─ 5-tier 映射 + hysteresis
  └─ 透明化 event log

M2.3 多源摄入 + Validator
  ├─ 4 自动源管道
  ├─ 2 半自动 CLI 命令
  └─ 分级 Validator (L0/L1/L2)

M2.4 双出口编译
  ├─ CLAUDE.md 预算制
  └─ Agent Skills 导出 + 降级删除

M2.5 AI Override Signal 闭环
  └─ PostToolUse 检测 + Calibrator 信号

M2.6 Wiki Pipeline
  ├─ 5 源抓取
  ├─ LLM 价值判断
  └─ SQLite + sqlite-vec 存储

M2.7 Inline 注入
  ├─ UserPromptSubmit hook
  ├─ 关键词提取 + 相关度匹配
  └─ 频控 + 预算

M2.8 A/B Benchmark
  ├─ 30 任务集构建
  ├─ 4 组环境搭建
  └─ Runner + 报告

M2.9 Dogfood 验证期
  └─ ≥ 30 天真实使用 + 数据达标
```
