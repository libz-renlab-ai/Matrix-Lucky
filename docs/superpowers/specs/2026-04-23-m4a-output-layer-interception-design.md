# M4-A — 输出层拦截 + 规则通道重分类 设计文档

> 日期: 2026-04-23
> 状态: Draft（待用户 review spec → 进入 plan 阶段）
> 作者: tianhaoxuan + Claude (Opus 4.7 1M)
> 父路线图: [`2026-04-22-product-roadmap-v3.md`](../../backup/phase2-superseded/2026-04-22-product-roadmap-v3.md) (archived)
> 并列里程碑: M4-B (RAG)、M4-C (错误学习放宽)、M4-D (后台整理器)

---

## 一、背景与问题

### 0.9.2 版本实测暴露的根本问题

用户反馈 "感觉还是拦截不住"。数据库扫描发现：

- 19 条 `enforcement=block` 且 `status=active` 的规则
- **所有 block 规则 `hit_count = 0`** — 从未真正拦住过任何操作
- 其中 5 条 `wrong_pattern` 为空字符串，被 matcher 第一步（`if (!rule.wrong_pattern) continue`）直接跳过
- 另外 15+ 条 `wrong_pattern` 是 AI 话术（"全部修复完成"、"等通知"、"无法手动查状态"）或进入 AI 的外部标签（`<local-command-caveat>`）

### 根因不是 matcher 坏，是规则走错了通道

PreToolUse matcher 只能扫**工具调用参数里的字面量**（command / content / file_path / url / old_string / new_string / pattern / query / prompt）。AI 的话术是在 assistant message 里，发生在**工具调用之外**。matcher 物理上看不到这类文本。

M3 修复了"被拦截后绕行不扣分"的闭环漏洞，但**没解决"规则不在可拦截范畴内"这个更底层的问题**。M4-A 要补上这一层。

---

## 二、目标

**让每条规则在它真正能生效的拦截点上发挥作用。** 存量无效规则不删，按行为通道重分类并降级到合适位置；新增"话术类"规则在 Stop hook 扫 AI 输出文本 + 下一轮 UserPromptSubmit 注入警告，形成回合间负反馈闭环。

**不在本里程碑范围内**：
- ❌ 不引入 embedding/向量检索（M4-B）
- ❌ 不放开错误学习阈值（M4-C）
- ❌ 不做后台定期整理（M4-D）
- ❌ 不新增工具拦截点（MCP/Task/TodoWrite 不动）
- ❌ 不改 Stop hook 的 harvest/pipeline 主逻辑，只在尾部加扫描器

---

## 三、核心设计

### 3.1 规则的四种通道

每条规则新增 `channel` 字段，取值四选一：

| 通道 | 示例规则 | 生效点 | 触发后果 |
|---|---|---|---|
| `tool-action` | `--dangerously-skip-permissions`、`npm install moment`、`bin-user-prompt-submit.ts` | PreToolUse（已有） | block/warn，参数命中即拦 |
| `ai-narrative` | "全部修复完成"、"等通知"、"无法手动查状态"、"还在跑" | **Stop hook 扫 AI 输出（新）** | 不拦当次，记 demerit + 标记下轮注入 |
| `user-input` | `<local-command-caveat>` | **UserPromptSubmit 扫用户 prompt（新）** | 检测到即注入"请忽略此类内容"提示 |
| `passive-knowledge` | 元认知原则、抽象设计取向、工作流心法 | 只进 CLAUDE.md（已有） | 编译时背景教育，不做实时处理 |

**向后兼容**：schema 迁移时无 `channel` 字段的老规则默认 `tool-action`，走现有逻辑不变。

### 3.2 enforcement 与 channel 的关系

| channel | 允许的 enforcement | 默认 | 原因 |
|---|---|---|---|
| `tool-action` | `block` / `warn` / `suggest` / `passive` | 保留原值 | 物理能拦，各级都有意义 |
| `ai-narrative` | `warn` / `suggest` / `passive` | `warn` | 拦不住当次，`block` 语义无效 |
| `user-input` | `suggest` / `passive` | `suggest` | 只能提示 AI 忽略，不拦 |
| `passive-knowledge` | `passive` | `passive` | 只做教学，enforcement 为 passive 不参与任何实时判定 |

**重分类规则的 enforcement 变化**：
- 原 `block` 且被重分类为 `ai-narrative` → 降级为 `warn`
- 原 `warn` 且被重分类为 `ai-narrative` → 保持 `warn`
- 原 `block` 且被重分类为 `user-input` → 降级为 `suggest`
- 原 `block` 且被重分类为 `passive-knowledge` → 降级为 `passive`
- `tool-action` 的 enforcement 不动

---

### 3.3 Stop hook 的 AI 输出扫描器（新组件）

**触发点**：复用已有 `bin-stop.cjs` 异步 pipeline 的尾部，不影响响应速度。

**数据源**：Stop hook stdin 带 `transcript_path` 或 `session_id`。复用现有会话日志解析器，取最近一轮 assistant message 的 text content。

**扫描逻辑**（纯函数，复用 `keyword-matcher.ts` 的 `splitPatterns` 切词和子串匹配）：
1. 过滤：`channel === "ai-narrative"` 且 `status === "active"`
2. 对每条规则的 `wrong_pattern` 在 AI 输出文本上做大小写不敏感子串匹配
3. 命中则产出一条 `MatchedNarrative { knowledge_id, matched_snippet, rule_summary }`

**输出**：
- 每个命中 emit 一条 `ai.output.bad_pattern` 事件进 events.db（带 session_id / turn_index / knowledge_id / matched_snippet）
- 同时写 `~/.teamagent/sessions/{session_id}_pending_warnings.json`（结构化待注入清单）

**性能**：异步，不阻塞 Stop；目标单次扫描 < 100ms（规则数 < 50，单轮输出 < 10KB）。

---

### 3.4 UserPromptSubmit hook 的警告注入（扩展现有组件）

**触发点**：现有 `bin-user-prompt-submit.cjs` 入口。

**改动**：
1. 入口处检查 `~/.teamagent/sessions/{session_id}_pending_warnings.json`
2. 有内容则把警告格式化为一段 system context 追加到 hookSpecificOutput.additionalContext
3. 注入后清空 pending 文件
4. Emit 一条 `ai.narrative.injected` 事件进 events.db（带所有注入的 knowledge_id 列表 + session_id）

**注入文本模板**：

```
◈ TeamAgent 上一轮观察
你在上一轮回复中说了这些话术，按团队经验它们指向问题：
- "{matched_snippet_1}" (规则 {knowledge_id_1} [conf {confidence}])：{reasoning 或 correct_pattern}
- "{matched_snippet_2}" (规则 {knowledge_id_2} [conf {confidence}])：...
请在本轮回复中避免同类表述，基于证据推进。
```

**注入上限**：单次最多 3 条警告，避免 prompt 污染。超出的条目按 confidence 降序选 Top 3。

---

### 3.5 UserPromptSubmit 的 user-input 通道扫描（新）

**触发点**：同上 hook，在警告注入之后继续处理。

**扫描逻辑**：
1. 过滤：`channel === "user-input"` 且 `status === "active"`
2. 对用户的 prompt 文本做子串匹配
3. 命中则把"请忽略以下进入的自动化噪声：{matched_snippet}"追加到 additionalContext

**这条路径解决的具体问题**：之前 `<local-command-caveat>` 作为 block 规则永远拦不住，因为它不在工具调用参数里，而是进入 AI 的文本。现在在用户 prompt 进 AI 前先行标记为噪声。

---

### 3.6 回合间反馈闭环

**核心洞察**：话术类拦截不是"阻止 AI 当次说话"（做不到），而是"让 AI 下一轮记得上次犯了错"。

```
回合 N:
  AI 输出 "全部修复完成" → Stop 扫描器命中 → ai.output.bad_pattern 事件
                                          → pending_warnings.json 写入

回合 N+1:
  用户发 prompt → UserPromptSubmit 读 pending → 注入警告到 AI 上下文
                                             → ai.narrative.injected 事件
                                             → 清空 pending
  AI 带着警告工作：
    情况 A: AI 本轮又说了同类话术 → Stop 再次命中 → ai.narrative.recurred 事件
                                                 → calibrator demerit++ (教育失败)
    情况 B: AI 本轮没说同类话术 → Stop 未命中 → ai.narrative.complied 事件
                                             → calibrator reward++ (教育成功)
```

### 3.7 事件 schema 新增

`packages/types/src/persisted-event.ts` 的 `kind` enum 新增：

- `ai.output.bad_pattern` — Stop 扫描命中话术规则
- `ai.narrative.injected` — 警告已注入到下轮 UserPromptSubmit
- `ai.narrative.recurred` — 注入后下轮再次命中同规则（教育失败）
- `ai.narrative.complied` — 注入后下轮未命中同规则（教育成功）
- `ai.user_input.flagged` — user-input 通道命中用户 prompt

向后兼容：新增可选 kind，老事件消费者不受影响。

### 3.8 Calibrator 接线

已有 calibrator v2 demerit / reward 机制复用，在 signal-to-delta 映射里新增：

| 事件 | calibrator 动作 |
|---|---|
| `ai.narrative.recurred` | 复用 `ai_override_ignored` 权重（demerit+） |
| `ai.narrative.complied` | 复用 `ai_override_complied` 权重（reward+） |
| `ai.output.bad_pattern`（首次命中） | hit_count++，暂不调 confidence（避免双重计分） |
| `ai.narrative.injected` | 仅记录，不计分 |
| `ai.user_input.flagged` | hit_count++ |

**不改 calibrator 主逻辑**，只扩展映射表。

---

### 3.9 Matcher 改造

`packages/core/src/matcher/keyword-matcher.ts` 改动：

```
for (const rule of rules) {
  if (rule.status !== "active") continue;
  if (!rule.wrong_pattern) continue;

  // M4-A 新增：PreToolUse matcher 只处理 tool-action 通道
  // 兼容层：undefined channel 视为 tool-action（老数据）
  const channel = rule.channel ?? "tool-action";
  if (channel !== "tool-action") continue;

  if (!checkScope(rule, filePath)) continue;
  // ... rest unchanged
}
```

**副作用**：M3 解冻的 practice+wrong_pattern 规则如果被重分类为 `ai-narrative`，自动从 PreToolUse 匹配里退出。这是设计的一部分——它们从一开始就不该在这个通道。

---

## 四、重分类流程

### 4.1 输入

`{project}/.teamagent/knowledge.db` 的所有规则 + `~/.teamagent/personal/*.db` + `~/.teamagent/global.db`。

### 4.2 分类算法

**方案 A（LLM 批量打标，已推荐选定）**：

1. 脚本 `scripts/reclassify-rules.ts` 遍历所有规则
2. 每条规则组成一个分类 prompt（wrong_pattern + correct_pattern + reasoning + trigger）
3. 通过本地 `claude -p` spawn 一个 Haiku-model 子进程（复用项目现有 LLM 一次性处理方案）
4. LLM 返回 `{ channel, confidence, reason }`
5. 低置信度（< 0.7）的标为 "needs-human" 待肉眼审

**分类指南（喂给 LLM 的 rubric）**：

```
You are classifying TeamAgent knowledge rules into 4 channels:

- tool-action: rule's wrong_pattern is a literal string that would appear in
  a tool invocation argument (command text, file path, URL, edit content).
  Examples: "npm install moment", "--dangerously-skip-permissions",
            "rm -rf", "axios.get".

- ai-narrative: rule's wrong_pattern is a phrase the AI would say in its
  assistant message (not a tool call). Usually Chinese, often about the AI
  asserting completion, waiting, or hedging.
  Examples: "全部修复完成", "等通知", "无法手动查状态", "还在跑".

- user-input: rule's wrong_pattern is a token/tag that appears in content
  FED INTO the AI (user prompt, local command caveat, system noise).
  Examples: "<local-command-caveat>", "<system-reminder>".

- passive-knowledge: rule is abstract/meta-cognitive principle without a
  concrete literal keyword. Usually wrong_pattern is empty or the rule is
  about a mindset/workflow preference.
  Examples: "按分阶段流程推进", "保持功能与机制层级".

Output: JSON { "channel": "...", "confidence": 0.0-1.0, "reason": "..." }
```

### 4.3 输出

`scripts/out/reclassify-{timestamp}.md` 报告：

```markdown
# Reclassification Report

Total: 146 rules
- tool-action:      42 (保持 PreToolUse 拦截)
- ai-narrative:     73 (走 Stop 扫描 + 下轮注入)
- user-input:        3
- passive-knowledge: 28 (降级 passive，只进 CLAUDE.md)

Confidence 分布:
  ≥ 0.9:  112 (可自动应用)
  0.7-0.9: 27 (可自动应用)
  < 0.7:   7 (needs-human)

详细条目清单:
## High confidence (auto-apply)
| id | wrong_pattern | old_channel | new_channel | conf | reason |
| ... |

## Needs human review
| id | wrong_pattern | LLM suggestion | conf | reason |
| ... |
```

同时产出一份 `scripts/out/reclassify-{timestamp}.json`（机器可读），包含：
- `plan`：每条规则的变更（old → new channel + enforcement）
- `rollback`：反向变更集

### 4.4 Apply 命令

```bash
pnpm teamagent reclassify apply --plan scripts/out/reclassify-{timestamp}.json
```

- 对 needs-human 条目：弹出 CLI 交互提示用户选择（默认跳过保持现状）
- 对 auto-apply 条目：批量更新 knowledge.db
- 写一条 audit 日志到 `~/.teamagent/reclassify-audit.jsonl`
- 命令结束后打印摘要 + rollback 命令

### 4.5 Rollback

```bash
pnpm teamagent reclassify rollback --audit {audit-id}
```

按 audit 里的 rollback 集反向应用。

---

## 五、数据流全图

```
AI 输出 (回合 N)
    ↓
Stop hook (异步 pipeline 尾部)
    ↓
narrative scanner
  - 读 transcript 最新 assistant message
  - 匹配 channel=ai-narrative 规则
  - 命中 → ai.output.bad_pattern 事件
  - 命中 → pending_warnings.json
    ↓
用户发 prompt (回合 N+1)
    ↓
UserPromptSubmit hook
  - 读 pending_warnings.json
  - 格式化注入到 additionalContext
  - 清空 pending
  - emit ai.narrative.injected
  - 扫 channel=user-input 规则 → additionalContext 附加"忽略噪声"提示
    ↓
AI 带着警告工作
    ↓
(回合 N+1 结束)
Stop hook 再次运行 narrative scanner
  - 对比上轮已注入的 knowledge_ids
    - 本轮仍命中同 id → ai.narrative.recurred (教育失败)
    - 本轮未命中同 id → ai.narrative.complied (教育成功)
    ↓
Calibrator v2 消费事件调整 confidence/demerit
```

---

## 六、文件/模块清单

| 路径 | 新增/修改 | 职责 |
|---|---|---|
| `packages/types/src/knowledge-entry.ts` | 修改 | 新增 `channel` 可选字段 + 默认值迁移 |
| `packages/types/src/persisted-event.ts` | 修改 | `kind` enum 新增 5 个值 |
| `packages/core/src/matcher/keyword-matcher.ts` | 修改 | 加 channel 门控 |
| `packages/core/src/narrative-scanner/scan.ts` | 新增 | 纯函数，对 assistant text 匹配 ai-narrative 规则 |
| `packages/core/src/narrative-scanner/__tests__/` | 新增 | TDD 覆盖 |
| `packages/core/src/narrative-scanner/pending-warnings.ts` | 新增 | 纯函数 + IO port：读/写/清空 pending 文件 |
| `packages/adapters/src/hook/claude-agent-sdk/stop-sdk.ts` | 修改 | 调用 narrative scanner（复用现有 Stop handler） |
| `packages/adapters/src/hook/claude-agent-sdk/user-prompt-submit-sdk.ts` | 修改 | 读 pending + 格式化注入 + user-input 扫描 |
| `packages/core/src/calibration-pipeline-v2.ts` | 修改 | signal-to-delta 映射表加条目 |
| `scripts/reclassify-rules.ts` | 新增 | LLM 批量打标 + 生成报告/计划/rollback |
| `scripts/out/` | 新增 | gitignore 目录，存放报告 |
| `packages/cli/src/commands/reclassify.ts` | 新增 | `teamagent reclassify apply/rollback` 子命令 |
| `packages/cli/src/bin.ts` | 修改 | 注册新子命令 |

---

## 七、测试策略（TDD）

### 7.1 单元测试（纯函数层）

- `knowledge-entry.test.ts`：schema 迁移——无 channel 字段的老 entry 序列化后带 `channel: "tool-action"` 默认
- `keyword-matcher.test.ts`：3 个新用例
  - channel=ai-narrative 的规则不在 matcher 返回集里
  - channel=tool-action 的规则照常匹配
  - 老 entry（无 channel）视为 tool-action
- `narrative-scanner.test.ts`：8+ 用例
  - 空输入
  - 单命中
  - 多命中
  - 子串大小写不敏感
  - `channel!=ai-narrative` 的规则不参与
  - status=archived 的规则跳过
  - wrong_pattern 为空跳过
  - 切词逻辑与 keyword-matcher 对齐
- `pending-warnings.test.ts`：5+ 用例（读空/读有/写/清空/并发）
- `calibration-pipeline-v2.test.ts`：扩展测试——新事件 kind 正确映射到 delta

### 7.2 集成测试（hook 层）

- `stop-sdk.test.ts`：给定 transcript fixture + 规则集 → 验证 events.db 和 pending 文件产出正确
- `user-prompt-submit-sdk.test.ts`：给定 pending 文件 + 用户 prompt → 验证 additionalContext 正确、pending 清空、事件产出

### 7.3 端到端场景

构造两个自动化场景（放 `packages/e2e/src/m4a/`）：

**场景 A**：AI 话术拦截回合闭环
1. 植入一条 `channel=ai-narrative, wrong_pattern="全部修复完成"` 规则
2. 模拟回合 N：AI transcript 含"全部修复完成" → Stop 扫描 → 验证 pending 有条目
3. 模拟回合 N+1：用户发任意 prompt → UserPromptSubmit → 验证 additionalContext 含注入文本、pending 清空
4. 模拟回合 N+1 结束：AI transcript 不含"全部修复完成" → Stop → 验证 `ai.narrative.complied` 事件 + calibrator reward
5. 再跑一次场景，回合 N+1 AI 仍说"全部修复完成" → 验证 `ai.narrative.recurred` + calibrator demerit

**场景 B**：tool-action 回归
1. 植入一条 `channel=tool-action, wrong_pattern="--dangerously-skip-permissions"` block 规则
2. 模拟 PreToolUse：tool=Bash, command="claude --dangerously-skip-permissions"
3. 验证 permissionDecision === "deny"

### 7.4 性能测试

- `narrative-scanner` 在 100 条规则 + 10KB transcript 输入下 < 50ms（assert）
- UserPromptSubmit pending 读取 + 注入 < 10ms

### 7.5 脚本级测试

- `reclassify-rules.test.ts`：给定 mock LLM 输出，验证报告/计划/rollback 的结构和完整性
- `reclassify-apply.test.ts`：apply 后数据库状态正确、audit 日志写入
- `reclassify-rollback.test.ts`：rollback 后数据库恢复原状

---

## 八、退出标准

1. ✅ 全量测试绿（含 M4-A 新增 ≥ 25 个新用例）
2. ✅ 重分类脚本 dry-run 在当前 knowledge.db 上跑出报告，用户肉眼审核并批准 high-confidence 变更
3. ✅ 端到端场景 A、B 全绿
4. ✅ `pnpm teamagent skeleton-demo` 仍跑通
5. ✅ 手动 E2E：植入话术规则 → AI 触发 → 下轮看到注入 → calibrator 日志记录
6. ✅ 新包 0.9.3 打出、装机测试 doctor 绿
7. ✅ 性能：narrative-scanner < 50ms, pending inject < 10ms (assert in tests)

---

## 九、Commit 节奏（按 `feat(m4a)` 前缀）

```
1. feat(m4a): knowledge schema adds channel field + default tool-action migration
2. refactor(m4a): matcher gates on channel=tool-action
3. feat(m4a): narrative scanner core (pure function) + tests
4. feat(m4a): pending warnings IO port + tests
5. feat(m4a): stop hook integrates narrative scanner (async tail)
6. feat(m4a): user-prompt-submit injects pending warnings + user-input scan
7. feat(m4a): calibrator signal map adds narrative recurred/complied/bad_pattern
8. feat(m4a): reclassify-rules script (LLM batch classifier + dry-run report)
9. feat(m4a): teamagent reclassify apply/rollback CLI subcommands
10. test(m4a): end-to-end scenarios A (narrative loop) + B (tool-action regression)
11. chore(m4a): apply reclassify on current knowledge.db (user-approved plan)
12. docs(m4a): update design spec with implementation notes + M4-A summary
13. chore(m4a): bump teamagent 0.9.3 + rebuild tarball
```

---

## 十、风险与缓解

| 风险 | 影响 | 缓解 |
|---|---|---|
| LLM 批量打标错分（把 tool-action 误判为 ai-narrative） | 存量有效拦截规则失效 | dry-run 强制人工审核 ≥0.7 条目；低置信度列 needs-human；保留完整 rollback |
| Stop hook 里同步扫描会拖慢 Claude Code 响应 | 用户体验退化 | 扫描在 Stop pipeline 尾部，本就异步 fire-and-forget；且加性能 assert |
| pending_warnings.json 并发写（多进程 Claude Code） | 警告丢失 | session_id 隔离（每个 session 独立文件），且 UserPromptSubmit 是原子读取+清空 |
| 注入文本污染 AI 上下文 | AI 响应偏离任务 | 单次注入上限 3 条；格式明确标为 "TeamAgent 上一轮观察"；用户可 `TEAMAGENT_VISIBILITY=silent` 彻底关闭 |
| 新 channel 字段破坏老 tarball 兼容 | 同事升级 0.9.3 后老规则读不出来 | 迁移层处理：读 entry 时无 channel 字段则视为 tool-action；写库时确保字段存在 |
| 本地 `claude -p` 不可用（同事机器没装 Claude Code） | reclassify 脚本失败 | 脚本检测到 `claude` 命令不存在时降级为 "hand-classification" 模式，产出一个交互式 CLI 让用户逐条手动选 |

---

## 十一、对下一步 M4-B (RAG) 的接口预留

M4-A 的重分类是 M4-B 向量化索引的前置条件：

- M4-B 的 embedding 只对 `channel=tool-action` 和 `channel=ai-narrative` 的规则做（passive-knowledge 不索引）
- `ai-narrative` 通道的 scanner 在 M4-B 落地后，关键词匹配可叠加向量匹配（语义相近的话术也能命中）
- 新字段 `channel` 天然是向量索引的分片键

M4-A 不预先实现这些，但**数据结构上给 M4-B 留出位置**，避免二次迁移。

---

## 十二、待用户确认的点

- [x] 思路 1（事后扣分 + 下轮注入）
- [x] 重分类不删只移
- [x] LLM 批量打标 + 人工审核 high-confidence
- [x] 报告形式 A（生成 md 报告 + 手动 apply，可 rollback）
- [x] 13 个 commit 节奏
- [ ] **本文档整体 OK → 进入 writing-plans 写实现计划**

---

## 十三、参考

- 当前 matcher 逻辑：`packages/core/src/matcher/keyword-matcher.ts`
- 当前 PreToolUse handler：`packages/adapters/src/hook/claude-agent-sdk/pre-tool-use-sdk.ts`
- M3 设计（block 绕行检测）：`docs/superpowers/specs/2026-04-22-m3-block-circumvention.md`
- Roadmap v3：`docs/backup/phase2-superseded/2026-04-22-product-roadmap-v3.md` (archived)
- 设计数据库现状：0.9.2 tarball 时点的 knowledge.db（19 block active, 146 total）
