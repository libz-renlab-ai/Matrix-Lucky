# TeamAgent 可感知性增强实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 让用户在工作中实时感知到 TeamAgent 的存在：状态栏显示知识库统计，hook 提示包含置信度和学到时间，Stop hook 学习完成后打印摘要。

**Architecture:** 三个独立改动——(1) 增强 `pre-tool-use-sdk.ts` 的 `formatReason` 为富文本；(2) `bin-stop.ts` 在编译完成后查询近期条目并写 stdout；(3) 新增 `scripts/teamagent-statusline.cjs` 脚本查询 SQLite 并注册到项目级 `settings.local.json`。

**Tech Stack:** TypeScript (vitest), Node.js CJS, better-sqlite3, Claude Code statusLine API

---

## 文件结构

| 文件 | 操作 | 职责 |
|------|------|------|
| `packages/adapters/src/hook/claude-agent-sdk/pre-tool-use-sdk.ts` | 修改 | 富文本 hook 提示（置信度、相对时间、触发次数） |
| `packages/adapters/src/hook/claude-agent-sdk/__tests__/pre-tool-use-sdk.test.ts` | 修改 | 补充 formatReason 新格式断言 |
| `packages/cli/src/bin-stop.ts` | 修改 | Stop 结束后 stdout 学习摘要 |
| `packages/cli/src/__tests__/bin-stop.test.ts` | 修改 | 补充 stdout 摘要断言 |
| `scripts/teamagent-statusline.cjs` | 新建 | statusLine 独立脚本，查询 SQLite 返回状态字符串 |
| `.claude/settings.local.json` | 修改 | 注册项目级 statusLine |

---

## Task 1: 富文本 hook 提示（formatReason 增强）

**Files:**
- Modify: `packages/adapters/src/hook/claude-agent-sdk/pre-tool-use-sdk.ts`
- Modify: `packages/adapters/src/hook/claude-agent-sdk/__tests__/pre-tool-use-sdk.test.ts`

- [ ] **Step 1: 在测试文件中找到 warn/block formatReason 相关测试，加入新格式断言**

打开 `packages/adapters/src/hook/claude-agent-sdk/__tests__/pre-tool-use-sdk.test.ts`，找到测试 warn 路径返回 `systemMessage` 的用例，添加断言：

```typescript
// 在已有的 warn 测试用例中，补充断言（找到 systemMessage 相关 expect）：
expect(result.systemMessage).toMatch(/◈ TeamAgent 经验提醒/);
expect(result.systemMessage).toMatch(/置信度 0\.\d+/);
expect(result.systemMessage).toMatch(/前学到/);  // "N天前学到" 或 "N周前学到"
```

对于 block 路径的测试，补充：

```typescript
expect(result.permissionDecisionReason).toMatch(/◈ TeamAgent 阻止操作/);
expect(result.permissionDecisionReason).toMatch(/置信度 0\.\d+/);
```

确保 mock 的 rule 对象包含这些字段：

```typescript
const mockRule = {
  id: "rule-1",
  enforcement: "warn",   // 或 "block"
  trigger: "使用 moment",
  correct_pattern: "改用 dayjs（体积少 200KB）",
  reasoning: "moment 已停止维护",
  current_tier: "stable",
  confidence: 0.92,
  created_at: new Date(Date.now() - 14 * 24 * 60 * 60 * 1000).toISOString(), // 2周前
  hit_count: 3,
};
```

- [ ] **Step 2: 运行测试，确认失败**

```bash
pnpm --filter @teamagent/adapters test -- --reporter=verbose 2>&1 | head -50
```

期望：FAIL，提示 `◈ TeamAgent 经验提醒` 不在 systemMessage 中。

- [ ] **Step 3: 实现 relativeTime 纯函数 + 两个 format 函数，替换 formatReason**

在 `packages/adapters/src/hook/claude-agent-sdk/pre-tool-use-sdk.ts` 末尾，将现有 `formatReason` 替换为：

```typescript
function relativeTime(dateStr: string, now: Date): string {
  const diffMs = now.getTime() - new Date(dateStr).getTime();
  const days = Math.floor(diffMs / (1000 * 60 * 60 * 24));
  if (days < 1) return "今天";
  if (days < 7) return `${days}天前`;
  if (days < 30) return `${Math.floor(days / 7)}周前`;
  return `${Math.floor(days / 30)}个月前`;
}

function formatWarnMessage(rule: any, now: Date): string {
  const age = rule.created_at ? relativeTime(rule.created_at as string, now) : "未知";
  const conf = typeof rule.confidence === "number" ? rule.confidence.toFixed(2) : "?";
  const content = rule.correct_pattern ?? rule.trigger ?? "";
  return `◈ TeamAgent 经验提醒 [置信度 ${conf} · ${age}学到]\n  → ${content}`;
}

function formatBlockReason(rule: any, now: Date): string {
  const age = rule.created_at ? relativeTime(rule.created_at as string, now) : "未知";
  const conf = typeof rule.confidence === "number" ? rule.confidence.toFixed(2) : "?";
  const hitCount = typeof rule.hit_count === "number" ? rule.hit_count : 0;
  const content = rule.correct_pattern ?? rule.trigger ?? "";
  return `◈ TeamAgent 阻止操作 [置信度 ${conf} · 已触发 ${hitCount} 次 · ${age}学到]\n  → ${content}`;
}
```

同时在 `createPreToolUseHandler` 内，将 `const reason = formatReason(top)` 替换为：

```typescript
const nowDate = new Date(now);
const reason =
  top.enforcement === "block"
    ? formatBlockReason(top, nowDate)
    : formatWarnMessage(top, nowDate);
```

并删除原来的 `formatReason` 函数。

- [ ] **Step 4: 运行测试，确认通过**

```bash
pnpm --filter @teamagent/adapters test -- --reporter=verbose 2>&1 | head -50
```

期望：PASS。如有类型错误，运行：

```bash
pnpm --filter @teamagent/adapters typecheck 2>&1 | head -30
```

- [ ] **Step 5: Commit**

```bash
git add packages/adapters/src/hook/claude-agent-sdk/pre-tool-use-sdk.ts \
        packages/adapters/src/hook/claude-agent-sdk/__tests__/pre-tool-use-sdk.test.ts
git commit -m "feat: rich hook messages with confidence, age, hit-count"
```

---

## Task 2: Stop hook stdout 学习摘要

**Files:**
- Modify: `packages/cli/src/bin-stop.ts`
- Modify: `packages/cli/src/__tests__/bin-stop.test.ts`

- [ ] **Step 1: 在 bin-stop.test.ts 中添加 stdout 摘要测试**

打开 `packages/cli/src/__tests__/bin-stop.test.ts`，找到 `runStopPipeline` 相关测试，添加两个新用例：

```typescript
import { vi, describe, it, expect, beforeEach, afterEach } from "vitest";

// 在已有 describe 块内添加：

it("当有新条目时，输出 stdout 学习摘要", async () => {
  // mock executeCalibrate / executeAnalyze / executeCompile 保持原有 mock
  // 额外 mock emitLearningSummary（Task 2 中会抽出的函数）
  const stdoutSpy = vi.spyOn(process.stdout, "write").mockImplementation(() => true);

  // 造一个近2小时内创建的条目
  vi.mock("../commands/recent-entries.js", () => ({
    getRecentEntries: vi.fn().mockResolvedValue([
      { tldr: "用 dayjs 代替 moment", confidence: 0.92 },
      { tldr: "凭据持久化到配置", confidence: 0.80 },
    ]),
  }));

  await runStopPipeline({ session_id: "s1", transcript_path: "/fake", cwd: "/fake", hook_event_name: "Stop" });

  const output = stdoutSpy.mock.calls.map((c) => c[0]).join("");
  expect(output).toMatch(/✦ TeamAgent 本会话学到 2 条新经验/);
  expect(output).toMatch(/dayjs/);
  expect(output).toMatch(/0\.92/);

  stdoutSpy.mockRestore();
});

it("无新条目时 stdout 静默", async () => {
  const stdoutSpy = vi.spyOn(process.stdout, "write").mockImplementation(() => true);

  vi.mock("../commands/recent-entries.js", () => ({
    getRecentEntries: vi.fn().mockResolvedValue([]),
  }));

  await runStopPipeline({ session_id: "s1", transcript_path: "/fake", cwd: "/fake", hook_event_name: "Stop" });

  const output = stdoutSpy.mock.calls.map((c) => c[0]).join("");
  expect(output).not.toMatch(/✦ TeamAgent/);

  stdoutSpy.mockRestore();
});
```

- [ ] **Step 2: 运行测试，确认失败**

```bash
pnpm --filter @teamagent/cli test -- --reporter=verbose --testPathPattern=bin-stop 2>&1 | head -50
```

期望：FAIL，找不到 `../commands/recent-entries.js`。

- [ ] **Step 3: 新建 packages/cli/src/commands/recent-entries.ts**

```typescript
import path from "node:path";
import os from "node:os";

export interface RecentEntry {
  tldr: string;
  confidence: number;
}

/**
 * 查询过去 2 小时内在项目 DB 新创建的 active 条目。
 * 使用 node:sqlite（Node 22 内置），与项目其余 SQLite 代码保持一致。
 * better-sqlite3 并未安装，不得使用。
 */
export async function getRecentEntries(cwd: string): Promise<RecentEntry[]> {
  const dbPath = path.join(cwd, ".teamagent", "knowledge.db");
  let db: DatabaseSync | undefined;
  try {
    const { DatabaseSync } = _require("node:sqlite") as typeof import("node:sqlite");
    db = new DatabaseSync(dbPath, { readOnly: true });
    try {
      const rows = db
        .prepare(
          `SELECT COALESCE(correct_pattern_tldr, trigger) AS tldr, confidence
           FROM knowledge
           WHERE status = 'active'
             AND created_at >= datetime('now', '-2 hours')
           ORDER BY created_at DESC
           LIMIT 10`,
        )
        .all() as RecentEntry[];
      return rows;
    } finally {
      db.close();
    }
  } catch {
    try { db?.close(); } catch { /* already closed */ }
    return [];
  }
}
```

- [ ] **Step 4: 在 bin-stop.ts 的 Step 3（compile 完成后）添加 stdout 摘要**

在 `packages/cli/src/bin-stop.ts` 的 compile 步骤末尾（`executeCompile` 成功后），追加：

```typescript
  // compile 步骤末尾，已有代码:
  //   process.stderr.write(`TeamAgent: CLAUDE.md 已更新，Skills 导出 ${r.skills.written.length} 条\n`);
  // 在其后追加：
  try {
    const { getRecentEntries } = await import("./commands/recent-entries.js");
    const recent = await getRecentEntries(cwd);
    if (recent.length > 0) {
      process.stdout.write(`✦ TeamAgent 本会话学到 ${recent.length} 条新经验\n`);
      for (const e of recent) {
        process.stdout.write(`  · ${e.tldr} [${e.confidence.toFixed(2)}]\n`);
      }
    }
  } catch {
    // 摘要失败不影响主流程
  }
```

- [ ] **Step 5: 运行测试，确认通过**

```bash
pnpm --filter @teamagent/cli test -- --reporter=verbose --testPathPattern=bin-stop 2>&1 | head -60
```

期望：PASS。

- [ ] **Step 6: 全量测试确认无回归**

```bash
pnpm test 2>&1 | tail -20
```

期望：全绿。

- [ ] **Step 7: Commit**

```bash
git add packages/cli/src/bin-stop.ts \
        packages/cli/src/commands/recent-entries.ts \
        packages/cli/src/__tests__/bin-stop.test.ts
git commit -m "feat: stop hook prints learning summary to stdout"
```

---

## Task 3: 创建 statusLine 脚本

**Files:**
- Create: `scripts/teamagent-statusline.cjs`

此脚本无单测（纯 IO，手动验证）。

- [ ] **Step 1: 创建 scripts/teamagent-statusline.cjs**

```javascript
#!/usr/bin/env node
"use strict";

const path = require("path");
const os = require("os");

const PROJECT_DB = path.resolve(__dirname, "../.teamagent/knowledge.db");
const GLOBAL_EVENTS_DB = path.join(os.homedir(), ".teamagent", "events.db");

function tryOpenDb(dbPath) {
  try {
    const Database = require("better-sqlite3");
    return new Database(dbPath, { readonly: true, fileMustExist: true });
  } catch {
    return null;
  }
}

function getEntryCount(db) {
  try {
    const row = db.prepare("SELECT COUNT(*) as n FROM knowledge_entries WHERE status = 'active'").get();
    return row.n;
  } catch {
    return null;
  }
}

function getLastLearnedDate(db) {
  try {
    const row = db.prepare("SELECT MAX(created_at) as d FROM knowledge_entries WHERE status = 'active'").get();
    if (!row || !row.d) return null;
    const d = new Date(row.d);
    return `${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  } catch {
    return null;
  }
}

function getTodayBlockCount(db) {
  try {
    const row = db
      .prepare(
        "SELECT COUNT(*) as n FROM events WHERE event_type LIKE 'hook-pre.blocked%' AND date(created_at) = date('now')"
      )
      .get();
    return row.n ?? 0;
  } catch {
    // 尝试 kind 字段（旧表结构）
    try {
      const row2 = db
        .prepare(
          "SELECT COUNT(*) as n FROM events WHERE kind LIKE 'hook-pre.blocked%' AND date(timestamp) = date('now')"
        )
        .get();
      return row2.n ?? 0;
    } catch {
      return null;
    }
  }
}

function main() {
  const knowledgeDb = tryOpenDb(PROJECT_DB);

  if (!knowledgeDb) {
    process.stdout.write("✦ TeamAgent · (未初始化)");
    return;
  }

  const count = getEntryCount(knowledgeDb);
  const lastDate = getLastLearnedDate(knowledgeDb);
  knowledgeDb.close();

  const eventsDb = tryOpenDb(GLOBAL_EVENTS_DB);
  const todayBlocks = eventsDb ? getTodayBlockCount(eventsDb) : null;
  if (eventsDb) eventsDb.close();

  const parts = ["✦ TeamAgent"];
  parts.push(count !== null ? `${count}条` : "-条");
  if (todayBlocks !== null) parts.push(`拦截${todayBlocks}今日`);
  if (lastDate) parts.push(`上次${lastDate}`);

  process.stdout.write(parts.join(" · "));
}

main();
```

- [ ] **Step 2: 手动验证脚本输出**

```bash
node scripts/teamagent-statusline.cjs
```

期望输出类似：`✦ TeamAgent · 46条 · 拦截3今日 · 上次04-20`

若 DB 不存在：`✦ TeamAgent · (未初始化)`

- [ ] **Step 3: Commit**

```bash
git add scripts/teamagent-statusline.cjs
git commit -m "feat: teamagent statusline script"
```

---

## Task 4: 注册 statusLine 到项目配置

**Files:**
- Modify: `.claude/settings.local.json`

- [ ] **Step 1: 在 settings.local.json 添加 statusLine 字段**

打开 `.claude/settings.local.json`，在 JSON 根对象中添加（不改动已有字段）：

```json
"statusLine": {
  "type": "command",
  "command": "node C:/bzli/teamagent/scripts/teamagent-statusline.cjs"
}
```

完整文件结构示例（只加这一个字段，其余保持不变）：

```json
{
  "permissions": { ... },
  "hooks": { ... },
  "statusLine": {
    "type": "command",
    "command": "node C:/bzli/teamagent/scripts/teamagent-statusline.cjs"
  }
}
```

- [ ] **Step 2: 验证 Claude Code 显示状态栏**

重启 Claude Code（或重开 session），底部状态栏应显示：

```
✦ TeamAgent · 46条 · 拦截3今日 · 上次04-20
```

若状态栏空白，手动运行脚本确认有输出：

```bash
node scripts/teamagent-statusline.cjs
```

- [ ] **Step 3: Commit**

```bash
git add .claude/settings.local.json
git commit -m "feat: register teamagent statusline in project settings"
```

---

## Task 5: 全量验收

- [ ] **Step 1: 跑全量测试**

```bash
pnpm test 2>&1 | tail -20
```

期望：全绿，无新增失败。

- [ ] **Step 2: 类型检查**

```bash
pnpm typecheck 2>&1 | tail -20
```

期望：0 errors。

- [ ] **Step 3: 构建（确保 bin-stop.cjs / bin-pre-tool-use.cjs 更新）**

```bash
pnpm --filter @teamagent/cli build 2>&1 | tail -10
```

- [ ] **Step 4: 手动端到端验证**

触发一次会有 warn 的工具调用（如写入一个已知规则匹配的命令），观察 Claude UI 中 systemMessage 格式是否包含置信度和时间。

会话结束时（Stop hook 触发）观察是否有 stdout 学习摘要出现。
