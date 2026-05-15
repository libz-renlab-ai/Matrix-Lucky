# TeamAgent 端到端闭环健康诊断（2026-04-28）

**诊断窗口**：~/.teamagent/stop-errors.log（2026-04-27 04:54 → 2026-04-28 08:17）+ wiki-refresh-errors.log（2026-04-27 → 2026-04-28）+ project state（last-harvest.md / scan-cursor.json / events.db）。

---

## 闭环图（设计）

```
SessionStart → 编译 CLAUDE.md（注入活跃规则）       ✅ 工作
PreToolUse   → 匹配规则，block / warn / score      ✅ 工作（M4-B BM25+dense）
PostToolUse  → 记录工具事件                         ✅ 工作
UserPromptSubmit → 注入相关规则到上下文            ✅ 工作
─────────── 学习侧 ───────────
Stop Hook    → analyze（提取经验）                 ❌ 多数失败
              → calibrate（置信度校准）            （依赖 analyze）
              → compile（重新编译 CLAUDE.md）      ⚠️ 仍跑，但 input 越来越稀
              → scan-errors（扫工具失败信号）      （未观察到失败）
              → semantic-scan（语义反馈）          ❌ 100% 失败
SessionEnd   → 全量重扫                            ❌ 多数失败
PreCompact   → 压缩前完整 harvest                  ❌（同 SessionEnd）
─────────── 知识获取侧 ───────────
Wiki Refresh → 拉取外部源 → LLM 抽取 → 入库         ❌ 几乎全失败
```

---

## 错误分布（24h 内，stop-errors.log，剔除测试 fixture）

| 计数  | 错误                                                            | 触发位                          | 严重程度 |
| ---- | --------------------------------------------------------------- | ----------------------------- | ------ |
| 940 | `Error: Session not found: <UUID>.jsonl`                         | analyze 在 bin-stop / bin-session-end | **P0 闭环断裂** |
| 119 | `TypeError [ERR_INVALID_ARG_TYPE] path argument ... undefined` | session-end 进程 main          | P1 |
| 95   | `Error: detached spawn received invalid input: undefined`        | bin-stop 子进程 argv[2] 丢失     | **P0 闭环断裂** |
| 73   | `Cannot find module 'onnxruntime-node'`                          | semantic-scan / 向量化补全     | P1 |

wiki-refresh-errors.log 同期约 30 行，**90% 是 `Claude CLI 调用超时（120000ms）` / `Claude CLI exit 1`**；少量 GitHub 403 + RSS parse 失败（外网降级，可接受）。

---

## 根因（root cause）链路追踪

### Bug 1：Stop / SessionEnd analyze 无法找到 transcript（B-070，**仍 open**）

- `bin-stop.ts` line 182 把 `input.transcript_path`（绝对路径）传给 `executeAnalyze`。
- `ClaudeSessionSource.loadById` (`adapters/.../claude-session-source.ts:79-86`)：
  - 若路径 `existsSync` → 直接读；
  - 否则把整个路径当 `sessionId` 传 `resolveSessionFile`，遍历 `~/.claude/projects/*/<id>.jsonl` 找文件；找不到抛 `Session not found`。
- 实测：报错的 7 个 UUID 在 `~/.claude/projects/` 任意子目录中**全都不存在**（`ls */(uuid).jsonl` 全空）。
- 67/70（95.7%）`~/.teamagent/sessions/<uuid>_session_injected.json` 标记找不到对应 jsonl。
- 这些 UUID 是 **Agent(run_in_background=true) 派生的子任务 / vitest 测试 worker** 的 session id —— 它们触发 PreToolUse / SessionStart 留下了 marker，但 Claude Code **从未把对应 transcript 落到 `~/.claude/projects/`**。
- 4 次重试 + 1.5s/3s/4.5s backoff 全部失败，每次浪费约 9 秒。

### Bug 2：Async Stop 后台进程 argv[2] 全丢（B-068，**仍 open，根因未确诊**）

- `bin-stop.ts:519-535` 父进程 spawn 子进程：`spawn(node, [selfPath, tmpFile], { detached, stdio: ignore, env: { TEAMAGENT_STOP_PIPELINE: "1" } })`。
- 子进程 `process.argv[2]` 为 `undefined`，`JSON.parse(undefined ?? "{}")` = `{}`，`isValidStopHookInput({})` 失败 → 立即 logError 退出。
- **BUGS.md 推测「Windows CreateProcess 对 JSON 反斜杠转义」已被排除**：当前 bundle（dist/bin-stop.cjs:45526-45538 已确认）传的是 **tmpFile 路径字符串**，不是 JSON 字符串本身。
- **环境变量泄漏假设也已排除**：当前 shell `env | grep TEAMAGENT` 只有 `TEAMAGENT_VISIBILITY=verbose`（来自 `.claude/settings.local.json` 的 env 块），**没有** `TEAMAGENT_STOP_PIPELINE`。源码搜索确认该环境变量只在 `bin-stop.ts:530` 一处 spawn 时被设置。
- **B-068 真正根因未确诊**。需要一次定向插桩：在 child 入口（`if (process.env.TEAMAGENT_STOP_PIPELINE === "1")` 那行之后）加 5 行 logError 把 `process.argv.length`、`process.argv`、`Object.keys(process.env).filter(k=>k.startsWith('TEAMAGENT'))` 写进 stop-errors.log，等下次 Stop 触发即可定位。在没有这条诊断之前，所有进一步推测（杀软、Node 版本、Windows quoting）都是猜测。

### Bug 3：semantic-scan 找不到 onnxruntime-node（B-069，**仍 open**）

- `bin-stop.ts:368-395`：semantic-scan 在 Stop 末尾运行，需要 Xenova 嵌入器 → `onnxruntime-node`。
- 该 dep 在 `packages/teamagent/package.json` 是 **optionalDependencies**，monorepo 安装后**没有**装到 `C:\bzli\teamagent\node_modules\onnxruntime-node`，只装在全局 `~/AppData/Roaming/npm/node_modules/onnxruntime-node`。
- bundle 在 `C:\bzli\teamagent\packages\cli\dist\` 运行，Node 模块解析路径上下追溯不到全局 npm 路径，于是 require 失败。
- 73 次错误 + 0 次成功向量化补全 = **M4-B 语义匹配反馈通道 100% 哑火**。

### Bug 4：Wiki refresh LLM 子进程几乎全部超时/失败

- `wiki-refresh-errors.log` 主体是 `LLMClientError: Claude CLI 调用超时（120000ms）` 和 `LLMClientError: Claude CLI exit 1: ` —— Claude CLI 子进程 120s 内无响应。
- 与 `stop-errors.log` 中 `Cannot find module 'onnxruntime-node'` 同一时段密集出现，说明运行环境本身有问题（npm 全局/项目本地路径错位）。
- 副作用：知识库不再吸收外部上下文，只剩 user 手动 pitfall 写入的少量增量。

---

## 实证：闭环成功率（不是「全断」，是「重度间歇」）

`last-harvest.md` 的"新增 N 条"事件在 2026-04-21 之后仍偶有命中：

- 2026-04-28 08:05:54 session 0594b771（lastTurnIndex=6, **新增 1 条**）
- 2026-04-28 08:17:55 session 0594b771（lastTurnIndex=7, **新增 2 条**）

但 04-28 当天 ~20 条 harvest 中只有 2 条这种实质提取（**partial-success ≈ 10%**）。其余全部 `lastTurnIndex=-1, extracted=0`（analyze 失败兜底）。规则：**只有 transcript 真正落到 `~/.claude/projects/C--bzli-teamagent/` 的 session，才能被吸收**；subagent / vitest / 临时进程的 session 全军覆没。

`scan-cursor.json` 主体仍停留在 2026-04-21 的 b2accdae / 791e09de（lastTurnIndex=164/24），新 session 几乎没让游标前进。

## doctor 的盲点（meta-finding）

`pnpm teamagent doctor` 8/8 全绿：只验证 node 版本 / claude-code 存在 / sqlite-vec 可加载 / 知识库可写 / PreToolUse hook 注册 / CLAUDE.md 有 TEAMAGENT 区块。**完全不检查 stop-errors.log、analyze 成功率、semantic-scan 是否能加载 onnxruntime-node、harvest 失败比**。在闭环重度受损时仍报"全部通过"，doctor 自身是 underpowered。建议加一项：扫 `~/.teamagent/stop-errors.log` 最近 24h，超过阈值给 warning。

---

## 修复顺序建议（不写代码，仅指明锚点）

1. **B-070 Session not found 风暴（最大噪声）**：在 `bin-stop.ts` analyze 阶段，先 `existsSync(input.transcript_path)`，不存在直接早退（带 info-level 日志），不进 4 次重试 + backoff。subagent 的 transcript_path 永远不会出现，重试是浪费。
2. **B-069 onnxruntime-node 解析失败**：把 `onnxruntime-node` 从 `packages/teamagent` 的 optionalDependencies 移到 monorepo root 或 `packages/cli` 的 `dependencies`，让 `dist/bin-stop.cjs` 当前工作目录的 node_modules 能 resolve。或在 `XenovaRuleEmbedder` 构造前 try/catch 整段 dynamic import，抛出后只 warn 不写 stack。
3. **B-068 detached spawn argv[2] 丢失**：先在 `spawn` 之后 fs.statSync(tmpFile) 验证文件存在，并在 child 端把 `process.argv` 整体（含 length、execPath）logError 出来一次以确诊到底丢在哪个环节。极有可能是反病毒软件拦截导致 spawn 失败但 child.on('error') 没触发（Windows spawn 边缘行为）。
4. **wiki-refresh Claude CLI 超时**：检查 `claude` CLI 是否在 PATH 上、是否被签名/网络拦截；把 `LLMClientError` 重试次数 cap 在 1，避免 30+ 次无效重试堆 log。

修完前 3 条，闭环就可以重新开始累计。
