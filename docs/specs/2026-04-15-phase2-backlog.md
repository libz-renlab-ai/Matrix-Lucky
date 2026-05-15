# Phase 2 待解决问题清单

> 创建日期: 2026-04-15
> 来源：M0-M6 + Stage 0/A hotfix 期间真实暴露的问题，加上敌人视角攻击（10 条）+ 设计文档承诺但 Phase 1 未实现的能力
> 用法：Phase 2 启动前先用本文件做需求梳理；每实现一条勾掉一条；不记得的功能就是没记的功能

---

## A. Calibrator 质量（最高优先级）

### A1. AI 是否听从了警告——目前无信号

**问题**：Hook warn 给 AI 注入 `additionalContext`，但 AI 可以**完全忽略**。系统不知道下一个 tool_use 是否是按警告改的。

**当前状态**：calibrator 把所有 fire 都算正分（hotfix 后 doc-context 例外）。`hook-pre.warned` 后即使 AI 完全没改方案，confidence 也在涨。

**Phase 2 方案**：
- PreToolUse 写 events 时记下"提示了什么 alternative"（field: `suggested_pattern`）
- 解析下一个 AI turn 的 tool_use input：是否含 `suggested_pattern` 或不再含 `wrong_pattern`
- 命中 → 记 `ai_followed_warning` 事件 → 给 +0.05
- 未命中 → 记 `ai_overrode_warning` 事件 → 给 -0.05
- 需要：hook 协议读 `transcript_path` 解析对话

### A2. 用户手动 override 的信号通路

**问题**：用户可能口头说"忽略这条规则一次"或者直接 `Ctrl+C` 跳过 deny。系统没记录。

**Phase 2 方案**：
- 加 `teamagent override <rule_id> [--once|--always]` 命令
- override 事件入 events.jsonl，calibrator 给负权重
- `--always` 直接把规则 status → archived

### A3. LLM 周期性二审

**问题**：当前 calibrator 是规则版，无法识别"语义上 fire 得对不对"。

**Phase 2 方案**：
- 每次 calibrate 末尾，对 confidence > 0.9 的规则采样 3 个真实触发场景
- LLM-as-judge 评分 1-5（成本约 ~$0.50/run）
- 平均 < 3 → 一次性 -0.30
- 平均 > 4 → +0.10 bonus

### A4. 时间衰减（知识衰减引擎）

**问题**：规则一直被命中只会涨，不会因为"过期"自动降级。spec v5.2 提到"知识衰减引擎"但 Phase 1 没做。

**Phase 2 方案**：
- 规则超过 N 天没被命中 → 每周衰减 -0.02
- 规则的 `wrong_pattern` 涉及的依赖被升级（package.json 改动）→ 立即降一级 enforcement
- 需要：calibrator 接受 `now` + 项目状态 hash

---

## B. Rule scope 精度（false positive 大头）

### B1. scope.paths 自动推断

**问题**：现在 LLM extractor 只补 `scope.file_types`（DEFAULT_CODE_FILE_TYPES）。但很多规则其实只在某个子目录适用，比如"core 不能 import fs"应该 scope 限定在 `packages/core/**`。

**当前补救**：人工录 pitfall 时手动写。LLM 抽的不写。

**Phase 2 方案**：
- Extractor prompt 加一段："如果规则只在某个子项目/目录适用，给出 scope.paths 建议"
- Pipeline 接受这个建议字段填入 entry.scope.paths
- 验证：B 路径上加 contract test

### B2. Bash 命令的"上下文检测"

**问题**：Bash 没 file_path，自反检测不适用。`git commit -m "...axios..."` 触发了 axios→fetch 规则。

**Phase 2 方案**：
- 检测 Bash command 是否是"文本语境命令"——主要是 git commit / git tag / echo / cat << EOF
- 这类命令的 fire → calibrator 给负权重
- 实现：在 calibrator 加 `isTextContextBashCommand(event)` 辅助函数

### B3. "提及 vs 使用" 的语义区分

**问题**：matcher 是 substring。变量名叫 `axiosResponse`、字符串 `"don't use axios"` 都会触发 axios 规则。

**Phase 2 方案**：
- LLM-based matcher 备用通道：当 substring matcher 命中且置信不高时，调 LLM 判一次"这段代码是真在用 axios 还是只在提及"
- 成本可控：只在 ambiguous 场景调（比如规则 confidence 0.5-0.8 之间）

### B4. 测试/fixture 路径之外的"假代码"识别

**问题**：现在自反检测覆盖 `.md` / `__tests__` / `fixtures` 等。但 commit messages、PR descriptions、issue templates、code comments 也是文本场景。

**Phase 2 方案**：
- 对 Edit 工具：检查 `new_string` 是否在文件的注释行内（解析 ts/js 注释）
- 对 Bash：parse 出来 `git commit -m "..."`、`gh pr create --body`、`echo "..."`、`cat << EOF` 等模式

---

## C. Hook 协议增强

### C1. PostToolUse + AI behavior diff

依赖 A1。要 hook 能访问 transcript 才可能。

### C2. Hook 长驻进程

**问题**：每次 spawn `node bin-pre-tool-use.cjs` 启动 ~50ms。spec v5.2 提到 Phase 2 改长驻进程目标 <10ms。

**Phase 2 方案**：
- 一个 daemon 进程，hook 通过 unix socket / named pipe 通信
- 启动时 daemon 加载知识库到内存，每次只做匹配
- Windows 上用 named pipe，Linux/Mac 用 unix socket

### C3. 多 hook 协调

**问题**：一个 PreToolUse 可能命中多条规则。当前只取最高 enforcement 决策。低 enforcement 的命中信息可能丢失。

**Phase 2 方案**：
- additionalContext 拼接所有命中规则的简短提示
- block 决策依然只取最高
- 需要前端兼容（Claude Code UI 是否能显示多条提示？）

---

## D. Detector 能力扩展

### D1. AI 自我纠正信号

**问题**：当前所有 correction signal 都需要用户消息。AI 自己摸索失败再改对的过程不被记录。

**Phase 2 方案**：新增 detector 信号：
- `ai_self_correction`：AI tool 失败 → 下一个 AI turn (无用户消息) 用不同方案 → 成功
- `ai_explicit_reconsider`：AI 自己说 "let me try differently" / "重新考虑"
- `tool_success_after_failure_chain`：失败 N 次后 AI 自己探索成功

实现成本：每个新信号 1-2 commit。需扩 `SessionTurn` 类型支持"连续 AI turns"。

### D2. 后台自动 analyze

**问题**：现在用户必须手动跑 `analyze --commit` 才学新东西。

**Phase 2 方案**：
- daemon 进程监视 `~/.claude/projects/*.jsonl`
- 文件写完后 N 分钟无更新 → 视为会话结束 → 自动跑 analyze --commit
- 新提取的条目入 `status: pending`（参见 G1 review gate）

---

## E. Context 管理（防膨胀）

### E1. RAG-style 按需加载

**问题**：CLAUDE.md 装所有规则，会话启动吃 cache_creation tokens。Top-N 配置只是缓兵之计。

**Phase 2 方案**：
- 暴露 teamagent 为 MCP server（参见 F1）
- CLAUDE.md 只放元信息和最高 confidence top-10
- AI 遇到具体任务时通过 MCP `query` 拿相关规则

### E2. 规则蒸馏

**问题**：相似规则会越积越多。"核心 import fs"、"core 不能 import adapters"、"core 只依赖 types/ports"——本质都是同一架构原则。

**Phase 2 方案**：
- 周期性 LLM 跑："这 N 条相关规则能不能合并成 1-2 条更通用的？"
- 合并后旧规则 archive，新规则 source: distilled
- 用户可逆：被合并的规则保留 id 和原文，可以 unarchive

### E3. 上下文感知裁剪

**问题**：`compiler.compile` 当前按 score 裁剪，不看用户当前任务。

**Phase 2 方案**：
- Hook 协议加 `additionalContext` 动态注入：当工具调用涉及 HTTP → 注入 HTTP 相关规则；涉及 DB → 注入 DB 规则
- 静态 CLAUDE.md 只放真元规则（4 条 preset）+ 高分 top-5

---

## F. 多 AI 工具支持

### F1. MCP Server（Phase 2 头号大事）

**问题**：当前只服务 Claude Code，其他 AI 工具完全不能用。

**Phase 2 方案**（已在 spec v5.2 设计）：
- 暴露工具：`check_pitfall(context)` / `get_best_practice(category)` / `report_correction(...)` / `get_stats()`
- Cursor / VSCode Copilot 通过 MCP 协议接入
- 同时把 hook 系统作为 MCP server 的 client（统一数据流）

### F2. Cursor 编译器

**问题**：MCP 上线前，Cursor 用户至少应该能 `init` 时把规则写进 `.cursorrules`。

**Phase 2 方案**：
- `Compiler<string>` 实现 `CursorRulesCompiler`
- `init` 检测到项目有 `.cursorrules` → 也编译一份输出
- M5 已经有 .cursorrules 解析器（importer 反向用）

### F3. AGENTS.md 编译器（Codex）

类似 F2。spec v5.2 提到 Phase 4，但和 F2 同源，可以提前到 Phase 2。

---

## G. 操作性 & UX

### G1. 自动提取的审核门

**问题**：当前 LLM 提取的条目直接写入 store + CLAUDE.md。质量参差，没有人工确认机会。

**Phase 2 方案**：
- 自动提取入 `status: "pending"`（新增枚举值，非 active）
- `teamagent review pending` 列出待审条目
- 一次性 `accept` / `reject` / `edit` 操作
- 一周未审 → 自动 archive（避免堆积）

### G2. 冲突检测

**问题**：两条规则可能矛盾（一条说"用 fetch"，另一条说"用 axios"）。当前 `conflict_with` 字段存在但**没有任何代码路径写它**。

**Phase 2 方案**：
- 录入新规则时（pitfall / extractor），用 LLM 检查："已有规则中是否有矛盾的？"
- 命中 → 双方 status: `conflict`，写入 `conflict_with`
- 用户必须手动选保留哪条

### G3. 成本透明 + 上限

**问题**：没人知道每次 analyze --commit 多少钱。

**Phase 2 方案**：
- `claude -p` JSON 已含 `total_cost_usd`，adapter 累加并暴露
- `analyze --commit` 末尾输出本次成本
- `teamagent stats --cost` 显示累积花费
- `--max-cost=N` flag 跑飞预防
- env `TEAMAGENT_DEFAULT_MODEL=haiku` 切换便宜模型

### G4. `--home-dir` flag

**问题**：M5 自举时发现 Windows 下 `HOME=xxx` 不重定向 `os.homedir()`。

**Phase 2 方案**：所有 CLI 命令统一接受 `--home-dir=path`。analyze 已经支持 `homeDir` 参数（CLI 没暴露）。

### G5. Hook bundle 自检

**问题**：core 改了不 rebuild bundle 是高频踩坑（已成知识库一条）。

**Phase 2 方案**：
- bundle 写入时记录 build timestamp
- hook 启动时对比 source git HEAD 和 bundle timestamp
- 不一致 → stderr 警告（但不阻断）

---

## H. 跨平台 & CI

### H1. macOS / Linux dogfood

**问题**：5 条 Windows 坑都是真踩出来的。Mac/Linux 没系统跑过，等同于"未测试"。

**Phase 2 方案**：
- GH Actions matrix 加 mac + linux
- 找一个真实 Mac/Linux 用户跑一周 dogfood
- 把发现的 OS-specific 坑入知识库

### H2. 真实 LLM 集成测试

**Stage 0 已部分做**：nightly cron + smoke shape check。

**Phase 2 强化**：
- 加 `--commit` 真实端到端测试（每周一次，预算 $1）
- 加 hook bundle 真实 spawn 测试

---

## I. Bench / 验证（用户决定推迟到 Phase 1 后）

### I1. A/B Bench 系统

**问题**：现在没有任何数据证明"装 teamagent" vs "不装"哪个好。

**Phase 2 方案**：按之前讨论过的 v0 框架建（详见 commit history 中的"我们什么时候搭建一个系统级的测试环境"对话）：
- headless `claude -p` 驱动
- 3 类 task × 2 arms × ≥3 runs
- 输出 token / time / corrections 等指标

### I2. M7 ScenarioRunner 复用

如果 M7 验证套件已建，bench 可以复用其 DSL 描述新场景。

---

## J. 团队层准备（Phase 3 真正做，但准备工作可以提前）

### J1. team-shared source 流程

**问题**：`source: "team-shared"` 枚举值存在，没任何代码路径设置它。

**Phase 2 准备**：
- `teamagent submit <id>` 手动把 personal 提升为 team-shared
- `teamagent review --pending-shared` 审核同事提交的

### J2. .teamagent 入 git 的最佳实践文档

**Phase 2 准备**：写一份《如何在团队里同步 teamagent》指南（最简形态：把 `.teamagent/` 入 git）。

---

## K. 设计文档已承诺但 Phase 1 跳过的功能

按 spec v5.2 列表：

- [ ] 知识检索升级到本地嵌入模型（bge-small）— Phase 2 ✓ 已规划
- [ ] Session Monitor 旁路监控 — Phase 2
- [ ] `/teamagent override` 临时绕过规则 — 见 A2
- [ ] `/teamagent rules` 管理活跃规则 — Phase 2 加 CLI
- [ ] Knowledge Portal HTML 仪表盘 — Phase 3
- [ ] 团队知识库 git tracked + 审核门 — Phase 3
- [ ] 跨用户避坑率（CUPR）指标 — Phase 3
- [ ] 互联网知识源 — Phase 4
- [ ] 知识市场 — Phase 4

---

## 已经修复（或部分修复）的问题，仅作记录

- ✅ Compiler top-N cap 不可配置 — Stage 0 commit 58a9793
- ✅ 真实 LLM 无 CI — Stage 0 commit 5962f5e（部分；nightly cron 已建）
- ✅ Calibrator 频次 runaway — Stage A commit 4074e9c
- ✅ Calibrator 无文档自反检测 — Stage A commit 4074e9c
- ✅ scope.file_types 缺省导致 docs 反噬 — M4 fix commit 87df7fa（部分；scope.paths 仍未自动推断）

---

## 维护规则

- 每完成一条 → 移到"已修复"区，留 commit hash
- 新发现的问题 → 加到对应章节末尾
- Phase 2 启动时先用本文件做 sprint planning
- Phase 1 收尾（M7）跑完后回头重读一遍——可能新踩坑没记
