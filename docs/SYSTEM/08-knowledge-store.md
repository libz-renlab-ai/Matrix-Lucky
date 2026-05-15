```text
   ┌──────────────────────────────────────────────────────────────┐
   │  Knowledge store — physical layout vs scope routing          │
   │                                                              │
   │   personal ──→  <cwd>/.teamagent/knowledge.db                │
   │   global   ──→  ~/.teamagent/global.db                       │
   │   team     ─×→  THROW (Phase 4 — git-synced .mdc)            │
   │                                                              │
   │   write router:  DualLayerStore.add(entry) {                 │
   │     switch (entry.scope.level) ...                           │
   │   }                                                          │
   │   read router:   PreToolUse Promise.all([P, T, G])           │
   │                  T retriever runs but T DB has 0 rows        │
   └──────────────────────────────────────────────────────────────┘
```

# TeamAgent 系统技术文档: 8. 知识库设计

Source index: [SYSTEM.md](../SYSTEM.md)

## 8. 知识库设计

### 数据库 Schema 简述

`knowledge.db`（和 `global.db`）包含以下主要表：

**`knowledge` 表（核心）**

| 列 | 类型 | 说明 |
|----|------|------|
| id | TEXT PK | 唯一标识 |
| scope_level | TEXT | personal/team/global（CHECK 约束） |
| category | TEXT | C/E/S/K |
| current_tier | TEXT | experimental/.../enforced/dormant |
| confidence | REAL | 0.0~1.0 |
| demerit | REAL | 累计扣分（指数衰减） |
| enforcement | TEXT | block/warn/suggest/passive |
| status | TEXT | active/conflict/stale/archived/dormant |
| hit_count | INTEGER | 被命中次数 |
| override_count | INTEGER | 被绕过次数 |

**`wiki_meta` 表（Wiki 专用）**

关联 `knowledge.id`，额外存储 `source_url`、`source_type`、`tldr`、`keywords`、`user_thumbs_down`、`inline_injection_count` 等 Wiki 专属字段。

**`events` 表（事件日志，append-only）**

存储所有 hook 命中事件（kind 如 `hook-pre.matched`、`hook-post.result`），供 Calibrator 读取用于置信度更新。

**`observations` 表**

Calibrator V2 用，存储 `(knowledge_id, outcome=success|failure)` 细粒度观察记录，供 Wilson Score 算法计算置信区间。

**`rule_candidates` 表**

`scan-errors` 命令生成的候选规则，status=pending，等待 `review-candidates` 命令人工审核。

完整 DDL：`packages/adapters/src/storage/sqlite/schema.ts:19`，`scope_level CHECK IN ('personal','team','global')` 在 `:24`，`idx_knowledge_scope` 在 `:67`。

### personal / team / global scope 的路由逻辑

`DualLayerStore.add(entry)` 根据 `entry.scope.level` 路由：
- `personal` → `project.add(entry)` → `{project}/.teamagent/knowledge.db`
- `team` → `project.add(entry)` → `{project}/.teamagent/knowledge.db`（本地 team scope）
- `global` → `global.add(entry)` → `~/.teamagent/global.db`

查询时 `findActive()` 合并两层结果；按 scope 过滤时 personal/team/global 分别保留。跨机器 team sharing 仍是 Phase 4。

### confidence 计算

v2 系统使用 **Wilson Score 置信区间**（`packages/core/src/calibrator/v2/wilson.ts`）替代简单增减：

```
wilson_lower = (successes + z²/2) / (total + z²) - z × √(successes×failures/total + z²/4) / (total + z²)
```

其中 z=1.645（90% 置信区间），successes/failures 来自 `observations` 表。这比直接 ±0.05 更稳健——小样本时下界更保守，大样本时更接近真实成功率。

### Tier 晋升/降级条件

**晋升**（confidence 驱动 + hysteresis 防抖）：
- confidence 超过阈值（experimental<0.30 → probation<0.55 → stable<0.75 → canonical<0.90）
- 在当前 Tier 驻留时间满足 `hysteresis` 要求（防止噪声导致的快速抖动）
- 实现：`packages/core/src/calibrator/v2/hysteresis.ts`

**降级**（Demerit 系统）：
- 每次 AI override（绕过规则）或 validator 验证失败，累加 demerit
- demerit≥5：强制 Tier 降 1 级（soft demote）
- demerit≥15：强制 Tier 降 2 级（hard demote）
- demerit≥30：进入 dormant（休眠）
- demerit 按指数半衰期自然衰减（experimental: 7天，enforced: 28天）
- dormant 状态可被 resurrect，`resurrect_count≥3` 则永久归档，防止"僵尸知识"反复复活

---
