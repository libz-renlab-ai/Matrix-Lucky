# TeamAgent 系统技术文档: 2. 核心概念词典

Source index: [SYSTEM.md](../SYSTEM.md)

## 2. 核心概念词典

### KnowledgeEntry（知识条目）

知识库的最小单元，代表一条"AI 应该知道的经验"。每条知识记录了触发条件、错误模式、正确做法和置信度。

关键字段：

| 字段 | 含义 |
|------|------|
| `category` | C（代码层）/ E（工程层）/ S（策略层）/ K（认知层）——坑属于哪个层面 |
| `type` | `avoidance`（避坑：不要做 X）/ `practice`（最佳实践：做 Y） |
| `nature` | `objective`（客观可验证）/ `subjective`（主观偏好，如团队风格约定） |
| `confidence` | 0.0~1.0，表示这条知识有多可靠，由 Calibrator 根据实际命中结果自动调整 |
| `enforcement` | 由 confidence 自动推导：`block`(≥0.9) / `warn`(0.7-0.9) / `suggest`(0.5-0.7) / `passive`(<0.5) |
| `tier` | experimental → probation → stable → canonical → enforced，知识的"成熟度" |
| `scope.level` | `personal`（仅自己）/ `team`（本项目团队）/ `global`（所有项目） |
| `source` | `preset`（预置元原则）/ `imported`（从已有规则导入）/ `accumulated`（使用中积累） |

类型定义：`packages/types/src/knowledge-entry.ts`

示例：
```json
{
  "id": "team-015",
  "scope": { "level": "personal" },
  "category": "E",
  "tags": ["tech-choice", "state-management"],
  "type": "avoidance",
  "nature": "subjective",
  "trigger": "状态管理方案选择",
  "wrong_pattern": "引入 Redux/MobX",
  "correct_pattern": "使用 Zustand",
  "confidence": 0.82,
  "enforcement": "warn",
  "current_tier": "stable"
}
```

### DualLayerStore（双层知识存储）

TeamAgent 当前将知识分两个 SQLite 数据库存储，而非一个，原因是：**个人知识和全局知识有不同的生命周期和隐私边界**。

- **project 层**（`personal` / `team` scope）：存于 `{project}/.teamagent/knowledge.db`，项目本地个人知识和本地团队知识。
- **global 层**（`global` scope）：存于 `~/.teamagent/global.db`，跨所有项目生效的机器环境知识（如"本机 python3 指向 python3，不是 python"）。

查询时两层合并返回，写入时按 `scope.level` 自动路由到正确的 DB。`team` scope 已在本地 project DB 保留；跨机器共享留待 Phase 4 的 transport / redaction / review gates 实现。

实现：`packages/adapters/src/storage/sqlite/dual-layer-store.ts`

数据库物理位置：
```
~/.teamagent/
  global.db        ← scope.level=global 的知识
  events.db        ← 所有事件日志（hook 命中、校准事件等）

{project}/.teamagent/
  knowledge.db     ← scope.level=personal 的知识 + wiki_meta + 候选规则
```

### Hook（Claude Code 钩子）

Claude Code 提供了一个 Hook 机制：在特定生命周期节点（工具调用前后、会话结束等），向注册的外部进程发送 stdin JSON，并读取该进程 stdout 返回的 JSON 来决定是否阻断或注入信息。TeamAgent 注册了 4 个 Hook：

| Hook 类型 | 触发时机 | TeamAgent 的用途 |
|-----------|---------|-----------------|
| `PreToolUse` | AI 每次调用 Bash/Write/Edit/WebFetch 之前 | 匹配知识库规则，命中则注入警告或阻断 |
| `PostToolUse` | 工具执行完成后 | 记录执行结果到 `events.db`，为后续置信度校准提供反馈数据 |
| `UserPromptSubmit` | 用户每次提交 prompt 时 | 从 wiki 知识库检索相关条目，注入到上下文（Inline Wiki Injection） |
| `Stop` | 会话结束时 | 依次执行 analyze→calibrate→compile 三阶段流水线，自动更新知识库和 CLAUDE.md |

Hook 注册配置：`.claude/settings.local.json`（本地机器，不入 git）

### AttributionBus（归因总线）

组件不直接调用 `console.log`，而是通过 `bus.emit(event)` 发送结构化 `AttributionEvent`，由 `StdoutRenderer` 统一渲染给用户。

**为什么这么设计**：
1. 支持 `silent/smart/verbose` 三种显示模式——`smart` 模式只在系统真正帮到用户时显示提示，避免噪音
2. 结构化事件便于测试（用 `InMemoryAttributionBus` 断言事件），而不是匹配字符串输出
3. 每个事件携带 `userFacingValue`（有感价值）和 `counterfactual`（反事实），`verbose` 模式下可展示完整决策链

接口：`packages/ports/src/attribution-bus.ts`
实现：`packages/adapters/src/attribution/in-memory-bus.ts` 和 `stdout-renderer.ts`
类型：`packages/types/src/attribution.ts`

### WikiEntry（前沿知识条目）

WikiEntry 是通过 `teamagent wiki:pull` 从外部源（GitHub Releases、npm 更新日志、RSS、arXiv 等）拉取的**前沿技术知识**，存储在 `knowledge.db` 的 `wiki_meta` 表中，关联到 `knowledge` 主表。

与 KnowledgeEntry 的区别：
- KnowledgeEntry 来自用户实际开发中的经验积累（纠正时刻、手动录入等）
- WikiEntry 来自互联网信息源，经 AI（claude-haiku）判断价值后入库，附有向量嵌入（384 维），通过 `UserPromptSubmit` Hook 在用户每次提问时做语义匹配，自动注入相关前沿知识
- WikiEntry 有 `tldr`、`keywords`、`source_url`、`user_thumbs_down` 等专属字段

Wiki 系统：`packages/core/src/wiki/`，`packages/adapters/src/wiki/`

### Calibration（置信度校准）

校准是指根据知识被实际应用的结果，自动调整其 `confidence` 值的过程。每次 Hook 命中一条知识规则后，事件落盘到 `events.db`；会话结束的 `Stop` Hook 触发 `teamagent calibrate` 重算。

校准规则（节选）：

| 事件 | confidence 变化 |
|------|----------------|
| 干预成功（建议被采纳且执行成功） | +0.05 |
| 用户显式确认有效 | +0.10 |
| 用户 override（绕过规则） | −0.15 |
| 干预后仍失败 | −0.10 |
| 超过 90 天未命中 | −0.05（被动衰减） |

核心算法：`packages/core/src/calibrator/v2/`（v2 Tier + Demerit 系统）

校准触发：`teamagent calibrate` 命令，或 `Stop` Hook 流水线自动调用。

### Tier（知识成熟等级）

Tier 是 v2 校准系统引入的五级成熟度体系，比单一 `confidence` 更稳定（避免噪声波动触发降级）：

| Tier | confidence 阈值 | 含义 |
|------|----------------|------|
| `experimental` | < 0.30 | 刚入库，待观察 |
| `probation` | 0.30~0.55 | 试用期，有初步证据 |
| `stable` | 0.55~0.75 | 稳定有效 |
| `canonical` | 0.75~0.90 | 经充分验证的权威知识 |
| `enforced` | ≥ 0.90 | 强制级，objective 知识才可达此级 |
| `dormant` | - | 因 demerit 累积被休眠，resurrect_count≥3 则永久归档 |

晋升条件：confidence 跨越阈值 **且** 在当前 Tier 驻留够长时间（hysteresis，防止快速抖动）。
降级/休眠：通过 Demerit 系统——每次被 AI 忽略（override）或验证失败会累加 demerit；demerit≥5 软降 1 级，≥15 硬降 2 级，≥30 进入 dormant。Demerit 本身按指数半衰期自然衰减（experimental tier 半衰期 7 天，enforced 28 天）。

实现：`packages/core/src/calibrator/v2/tier.ts`，`packages/core/src/calibrator/v2/demerit.ts`

---
