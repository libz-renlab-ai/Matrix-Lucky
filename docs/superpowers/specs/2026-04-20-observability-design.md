# TeamAgent 可感知性增强设计

**日期**：2026-04-20  
**状态**：已批准

## 目标

用户感知不到 TeamAgent 在运行。本设计通过两个改动让系统状态持续可见：状态栏实时计数 + 更丰富的 hook 提示格式。

---

## A. StatusLine 实时状态栏

### 显示格式

```
✦ TeamAgent · 46条 · 拦截3今日 · 上次04-20
```

DB 不存在时降级：

```
✦ TeamAgent · (未初始化)
```

### 实现

**脚本**：`scripts/teamagent-statusline.cjs`

- 独立 CommonJS 脚本，直接 `node` 执行，无需编译
- 依赖 `better-sqlite3`（项目已有）
- 查询逻辑：
  1. `.teamagent/knowledge.db` → `SELECT COUNT(*) FROM wiki_entries` 得条数
  2. `.teamagent/knowledge.db` → `SELECT MAX(created_at) FROM wiki_entries` 得最新日期
  3. `~/.teamagent/events.db` → `SELECT COUNT(*) FROM events WHERE event_type LIKE 'hook-pre.blocked%' AND date(created_at) = date('now')` 得今日拦截数
- 每个 DB 操作捕获异常；任一 DB 缺失则对应字段显示 `-`
- 整体执行 < 20ms（两次 COUNT + 一次 MAX，SQLite 本地查询）

**配置**：注册到 `.claude/settings.local.json`（项目级，不影响其他项目的全局 caveman statusLine）：

```json
{
  "statusLine": {
    "type": "command",
    "command": "node C:/bzli/teamagent/scripts/teamagent-statusline.cjs"
  }
}
```

---

## B. 增强 Hook 提示格式

### B1. PreToolUse warn/block 的 systemMessage

**warn 格式**：

```
◈ TeamAgent 经验提醒 [置信度 0.92 · 2周前学到]
  → 用 dayjs 代替 moment（体积少 200KB）
```

**block 格式**：

```
◈ TeamAgent 阻止操作 [置信度 0.95 · 已触发 3 次]
  → 禁止直接 console.log 用户可见信息，请用 bus.emit()
```

**改动位置**：`packages/cli/src/bin-pre-tool-use.ts`

- 构造 `systemMessage` / `permissionDecisionReason` 时，附加匹配条目的 `confidence`、`created_at`（转相对时间）、`hit_count`
- 相对时间计算：`N天前` / `N周前` / `N月前`（纯函数，参数注入 `now`，符合 Functional Core 约定）

### B2. Stop hook 学习完成通知

本会话新学到经验时，Stop hook 末尾写 **stdout**（用户可见）：

```
✦ TeamAgent 本会话学到 2 条新经验
  · subagent 模式 [0.95]
  · 凭据持久化 [0.80]
```

无新经验时静默（不输出）。

**改动位置**：`packages/cli/src/bin-stop.ts`

- 现有逻辑用 `stderr` 输出进度，保持不变
- 在 `CLAUDE.md` 更新完成后，若 `newEntries.length > 0`，额外写 stdout

---

## 数据流

```
statusLine script ──读──▶ .teamagent/knowledge.db
                  ──读──▶ ~/.teamagent/events.db

PreToolUse hook ──匹配到规则──▶ 构造富文本 systemMessage ──▶ Claude UI 显示

Stop hook ──学习完成──▶ stdout 摘要 ──▶ Claude UI 会话末尾显示
```

---

## 测试策略

| 场景 | 验证方式 |
|------|---------|
| statusLine 脚本 DB 存在 | 手动 `node scripts/teamagent-statusline.cjs` 看输出 |
| statusLine 脚本 DB 不存在 | 删除 DB 后执行，确认降级文案 |
| PreToolUse warn 格式 | 现有 warn 路径单测：mock 条目含 confidence/created_at，断言 systemMessage 格式 |
| Stop hook 新经验输出 | 现有 Stop hook 单测：mock `newEntries.length > 0`，断言 stdout 含摘要 |
| Stop hook 无新经验 | mock `newEntries.length === 0`，断言 stdout 为空 |

---

## 范围外（不实现）

- 合并 caveman + TeamAgent statusLine（选择了项目级覆盖方案）
- Session 精确拦截计数（用今日计数替代）
- 周期 digest / `teamagent digest --weekly` 命令
