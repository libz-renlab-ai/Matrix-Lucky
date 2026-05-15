# Wiki 自动化 + 过时清理 设计文档

- **日期**：2026-04-21
- **状态**：Draft（待用户评审）
- **前置**：`docs/superpowers/specs/2026-04-15-product-roadmap.md` M2.6 已落地（手动 `wiki:pull`、`wiki:list`、注入 hook 已工作）

## 1. 背景

`wiki:pull` / `wiki:list` / UserPromptSubmit 注入 hook 组件齐全，但：

- 从未自动 pull：`last_pull = 2026-04-16`，已 5 天未刷新，库里只剩 6 条 github_release
- 过时条目不清理：同 repo 多个旧版本长期占位，零命中条目无限堆积
- 用户感知不到 wiki 存在，因为既没新内容、注入门槛又卡死相关性

## 2. 目标

- **自动刷新**：CC 每天至少 pull 一次，不用手动命令
- **自动清理**：零命中老条目 + 同源非最新 N 条自动归档，注入只看 active
- **不阻塞**：刷新异步跑，失败静默，SessionStart hook 不卡启动
- **可观察**：归因事件进 status line / 事件日志，用户知道"系统拉了/归档了什么"

## 3. 非目标

- 不做全文检索 / 多源聚合（超 YAGNI）
- 不新增订阅源（RSS/arxiv 扩源是独立工作）
- 不做硬删除 / GC（软删用 `status='archived'` 够了；真有体积问题再单独做 compaction）
- 不改注入相似度门槛（`minSimilarity: 0.75` 保持不变）

## 4. 决策记录

| 决策点 | 选定 | 理由 |
|---|---|---|
| 触发机制 | SessionStart 异步后台 | 跟 CC 生命周期绑定，不引入 cron 依赖；fire-and-forget 不阻塞启动 |
| Debounce | `now - last_pull > 24h` | 日级刷新；高频启动不打爆 github API rate-limit |
| Stale 信号 | 零命中 + age > 60d ／ 同 repo 非 latest 3 | 保守清理：embed 给 60 天命中窗口；主/次/补丁版本并存 |
| 删除方式 | 软删（`UPDATE knowledge.status = 'archived'`）| `status` 字段及 `'archived'` 枚举值已存在；0 schema 迁移；可审计、可复活 |
| 清理时机 | pull 完成后顺带跑 | 一次 IO 批量增删，不加额外触发点 |

## 5. 架构

```
SessionStart hook (bin-session-start.cjs, 新增)
    │ stdin: {session_id, source, cwd, ...}
    ▼
  debounce check: last_pull < 24h 前？
    ├─ yes → exit 0（安静，下次再来）
    └─ no  → detach spawn subprocess ──→ (父进程立即退出)
                   │
                   ▼
         `node bin-wiki-refresh.cjs`（新增独立入口）
                   │
                   ├─ WikiPipeline.run()            （现有，不改）
                   ├─ ArchiveSweeper.sweep()        （新增）
                   │    ├─ 零命中+老龄 → ids[]
                   │    ├─ 同源非 top-N → ids[]
                   │    └─ UPDATE knowledge.status = 'archived' WHERE id IN (...)
                   └─ AttributionBus emit           （新增归因事件）
                        ├─ wiki.refresh.started
                        ├─ wiki.refresh.added       (count)
                        ├─ wiki.refresh.skipped     (reason: debounced)
                        └─ wiki.archived            (reason, count)
```

## 6. 组件

### 6.1 `bin-session-start.ts`（新建）

路径：`packages/cli/src/bin-session-start.ts`
打包：加入 `tsup.hook.config.ts` entry 列表
注册：`.claude/settings.local.json` 的 `SessionStart` hook 数组

职责：
1. 读 stdin JSON（忽略，只要事件触发就够）
2. 打开 `.teamagent/knowledge.db`
3. 查最近一次 pull 时间（复用 `wiki:stats` 已实现的读取逻辑；实现层面通常是 `SELECT MAX(fetched_at) FROM wiki_meta` 或同等持久化字段）
4. `if (now - last_pull < 24h) exit(0)`
5. 否则 `detached spawn node bin-wiki-refresh.cjs`，父进程 unref + exit(0)
6. 任何错误吞掉，exit(0) —— hook 不能阻塞启动

超时：2s hard cap（debounce 检查应 ≤ 50ms，spawn 立即返回）

### 6.2 `bin-wiki-refresh.ts`（新建）

路径：`packages/cli/src/bin-wiki-refresh.ts`
打包：加入 `tsup.hook.config.ts` 同一 entry 列表（虽非 hook，但 bundle 需求相同：自包含 `.cjs`、可被 spawn 直接跑）

职责：
1. 实例化 `WikiPipeline` + `ClaudeCodeLLMClient` + `XenovaEmbedder`
2. 调 `pipeline.run()`（现有实现，无参数 = 全量订阅源）
3. 调 `new ArchiveSweeper(db).sweep(now)`
4. 把报告（added/skipped/archived 计数）写进 `wiki-refresh.log` 单行 JSON
5. emit `AttributionBus` 事件（让 status line 能显示）
6. exit 0

超时：60s（pipeline 本身就有 LLM 判断，不能太紧）

### 6.3 `ArchiveSweeper`（新建，Functional Core）

路径：`packages/core/src/wiki/sweeper.ts`（纯函数）

```ts
export interface WikiEntrySnapshot {
  knowledgeId: string;
  sourceType: string;
  sourceId: string;          // e.g. "vitest-dev/vitest" for github
  publishedAt: Date;
  fetchedAt: Date;           // from knowledge.created_at
  inlineInjectionCount: number;
}

export interface SweepPolicy {
  zeroHitMinAgeDays: number;   // default 60
  perSourceKeep: number;        // default 3
  now: Date;
}

export function computeArchivals(
  entries: WikiEntrySnapshot[],
  policy: SweepPolicy,
): { knowledgeId: string; reason: 'zero-hit-aged' | 'source-overflow' }[];
```

纯函数、无副作用、now 参数注入 —— 符合 M0 元约束。

Adapter 层（`packages/adapters/src/wiki/sweeper-adapter.ts`）做 DB 读 + UPDATE：

```ts
class ArchiveSweeper {
  constructor(private db: DatabaseSync) {}
  sweep(now: Date, policy?: Partial<SweepPolicy>): SweepReport {
    // 1. SELECT snapshots JOIN knowledge+wiki_meta WHERE status='active'
    // 2. const ids = computeArchivals(snapshots, {...})
    // 3. UPDATE knowledge SET status='archived' WHERE id IN (...)
    // 4. return {archived: [...], byReason: {...}}
  }
}
```

### 6.4 `SqliteWikiRetriever.query` 补丁

当前 SQL（`packages/adapters/src/storage/sqlite/sqlite-wiki-retriever.ts:36-59`）未过滤 `status`。加：

```sql
FROM knowledge_vec kv
JOIN wiki_meta wm ON kv.knowledge_id = wm.knowledge_id
JOIN knowledge k ON k.id = wm.knowledge_id AND k.status = 'active'  -- 新增
WHERE ...
```

被 archived 的永不注入。

### 6.5 归因事件

路径：事件通过现有 AttributionBus 链路，落到 `events.db` + status line。

新增事件类型：
- `wiki.refresh.started` `{trigger: 'session-start', debounced: false}`
- `wiki.refresh.skipped` `{reason: 'debounced', hoursSinceLastPull: N}`
- `wiki.refresh.added` `{added: N, skipped: N, rejected: N}`
- `wiki.archived` `{count: N, zeroHitAged: N, sourceOverflow: N}`

Renderer 侧按现有 verbose 模式显示。

## 7. 配置面

配置键统一走 `.teamagent/config.json`（已存在），新增默认值：

```json
{
  "wiki": {
    "autoRefresh": {
      "enabled": true,
      "debounceHours": 24
    },
    "sweep": {
      "enabled": true,
      "zeroHitMinAgeDays": 60,
      "perSourceKeep": 3
    }
  }
}
```

所有项 optional，缺失走默认。用户能 `wiki.autoRefresh.enabled = false` 禁用整套。

## 8. 错误处理

| 失败模式 | 行为 |
|---|---|
| SessionStart hook 无法打开 DB | exit 0，静默，等下次触发 |
| detached spawn 失败 | hook 自身 exit 0，日志写 `stop-errors.log` 同目录的 `wiki-refresh-errors.log` |
| Pipeline 某源失败（网络/429）| 现有 `PipelineReport.errors[]` 已捕获，其他源继续 |
| Sweep 计算失败 | 不提交 UPDATE，log 错误，pull 结果依然持久化 |
| DB 锁（另一 session 同时刷新）| `BEGIN IMMEDIATE` 抢锁失败 → exit 0（另一端在跑，没必要双份）|

## 9. 测试策略

遵守 M0 元约束：先契约/单测，后实现。

- **`sweeper.test.ts`（core，纯函数）**：表驱动用例
  - 零命中 + age 超阈 → 归档
  - 零命中 + age 未超 → 保留
  - 有命中 + age 超阈 → 保留（命中说明还有用）
  - 同 repo 5 版本 → 保留 top 3（按 publishedAt desc）
  - 同 repo 3 版本 → 全保留
  - 不同 repo 不互相计数

- **`sweeper-adapter.test.ts`（adapters，集成）**：用 `:memory:` DB
  - seed 10 条 → sweep → 断言 `status='archived'` 的行数正确
  - sweep 是幂等的：连跑两次结果不变

- **`sqlite-wiki-retriever.test.ts`**：补一个用例，archived 条目不出现在 query 结果

- **`bin-session-start.test.ts`**：mock DB + mock spawn
  - last_pull < 24h 前 → 不 spawn
  - last_pull > 24h 前 → spawn 一次
  - DB 不存在 → 安静退出

- **E2E**：手动 `pnpm teamagent wiki:refresh` 跑通，CI 不做 subprocess 测试（Windows OOM 限制同 M0）

## 10. 迁移 / 部署

- Schema：0 migration（复用现有 `status` 字段）
- 打包：
  - `tsup.hook.config.ts` 加两个 entry：`bin-session-start` + `bin-wiki-refresh`
- Hook 注册：`.claude/settings.local.json` 增加 `SessionStart` 数组
- 首次启动：自动跑一次完整 pull（last_pull 不存在视为 > 24h）+ sweep 现有 6 条（vitest 4 个版本会归档掉最老的 1 个）

## 11. 观测验证清单（Walking Skeleton）

milestone 收尾前必须跑通：

```bash
pnpm test                         # 全绿（含新增 sweeper + retriever 补丁）
pnpm typecheck                    # 全绿
pnpm teamagent wiki:refresh       # 手动触发，看 stdout 报告
pnpm teamagent wiki:list --limit 20  # 确认 archived 不出现
sqlite3 .teamagent/knowledge.db "SELECT status, COUNT(*) FROM knowledge WHERE source='wiki_pipeline' GROUP BY status"
# → 预期: active=5, archived=1 （假设 vitest 旧版本被淘汰）
```

真实 SessionStart 触发：重启 CC，观察 status line 是否显示 `wiki.refresh.*` 事件。

## 12. 风险 / 已知限制

- **first-session cold start**：首次启用时 SessionStart 会触发一次完整 pull（~10-30s 后台），CC 启动本身不受阻，但用户在启动后 30s 内可能看到 status line 闪动归因事件。可接受。
- **Windows detached spawn**：必须带 `windowsHide: true, detached: true, stdio: 'ignore'`，和 `bin-stop` 一致，否则会弹黑窗。项目已有踩坑规则（memory），沿用。
- **并发 sessions**：两个 CC 同时启动 → 两个都尝试 spawn。`BEGIN IMMEDIATE` 抢锁做互斥，输者静默退出。
- **订阅太窄**：本设计不扩源，用户仍只有 4 个 github_release 订阅。扩源独立做。自动化让"既有源"能自动跟新，已达目标。

## 13. 不做的事（YAGNI）

- 不做"复活" UI：被 archived 的需要手动 `UPDATE status='active'` 恢复。体量小、频率低
- 不做精细化频率控制（按源、按时段）：全局 24h debounce 够了
- 不做 prune-by-dislike：已有 `wiki:dislike` 手动命令，不放进 auto sweep
