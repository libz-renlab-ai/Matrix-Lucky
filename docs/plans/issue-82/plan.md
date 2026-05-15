```text
   ┌──────────────────────────────────────────────────────────────┐
   │   plan.md — issue #82                                        │
   │   "team-scope viral sync teaching e2e + attribution chain"   │
   │   (refresh of issue title "group sharing")                   │
   │                                                              │
   │   ① plan         ② expected outputs                          │
   │   ③ judge harness ④ claudefast probes                        │
   └────────────────────┬─────────────────────────────────────────┘
                        │
       ┌────────────────┼────────────────┐
       │                │                │
   M5 viral sync    Real delta:        Glossary mapping
   already         ┌────────────────┐  CONTEXT.md canonical
   SHIPPED         │ 1. cross-      │  ─────────────
   ─────────       │   machine e2e  │  group sharing
   - infect       │ 2. attribution │   → team-scope viral
   - bootstrap    │   chain UI     │     sync teaching
   - 2 gates      │ 3. depends on  │  group rule
   - sync (LWW)   │   #81 plan     │   → team-scope rule
   - SessionStart └────────────────┘  group brain
     auto-pull                         → team scope
   - team-id via                       (in-project KB,
     remote URL                          NOT cross-project)
   - post-merge
     hook
       │                                      │
       └───────────────────┬─────────────────┘
                           ▼
   judge.md MD playbook: 2-machine replay rig
   sub-agents drive temp git remote + sync push/pull
   probe: positiveTriggerRate, falsePositiveRate, attribution_present
                           ▼
                     open normal PR
                           ▼
                   POSTPR loop until 👍
```

---

## CHANGELOG

- **v1 (2026-05-08)** — 初版 plan，配合 ADR-0006 close issue #82。Reframe 为 M5 delta + canonical 术语对齐 CONTEXT.md。

---

# Plan — issue #82：team-scope viral sync teaching e2e + attribution chain

- **Issue:** [#82](https://github.com/libz-renlab-ai/TeamBrain/issues/82) (`enhancement`)
- **Branch:** `worktree-clean-issues` (this docs-only PR); follow-up impl PR 自起分支
- **Owner:** unassigned; impl PR 必须先看 #81 plan 是否已经走到 follow-up impl 阶段
- **Date:** 2026-05-08
- **Reference:**
  - `docs/CONTEXT.md`（canonical 术语仲裁源）
  - `docs/HOWTO-PLAN-PR.md`（4 段结构）
  - `docs/superpowers/specs/2026-05-06-m5-team-viral-sync-design.md`（M5 viral sync 设计）
  - `docs/features/team-share.md`（M5 已 ship 现状清单）
  - `docs/features/multi-tool.md`（PreToolUse / UserPromptSubmit / Stop / AttributionBus 4 通道现状）
  - ADR-0006

## Glossary mapping — issue 用语 → CONTEXT.md canonical

`docs/CONTEXT.md` 把 issue 标题的"group sharing"明确列入 _Avoid_ 黑名单（"group / shared / cross-user"）。本 plan **正文一律用 canonical 术语**，仅在此节做一次性映射，方便读者从 issue 标题跳转：

| Issue 用语 | CONTEXT.md canonical | 物理对应 |
|---|---|---|
| group sharing | **team-scope viral sync teaching** | M5 sync 子系统 + L2 team layer（CONTEXT.md canonical 名称；不写 "shared layer"） |
| group brain | **team scope** (in-project, **not** cross-project) | `<cwd>/.teamagent/knowledge.db` 中 `scope.level=team` 的子集 |
| group mode | **team-scope mode**（`teamagent review --scope=team`） | DualLayerStore 路由 |
| group rule | **team-scope rule** | `scope.level=team` 的 entry |
| A 同步给 B / 跨机器同步 | **viral sync via git transport** | `teamagent sync push\|pull` / `m5-publish` / `.githooks/post-merge → m5-sync --apply` |
| 后来人不再犯错 | **team-scope viral sync teaching effect** | recipient 端在同类 prompt 命中 PreToolUse 拦截 |

**违反此映射 = plan 不达标。** 本 plan 后续段落如出现 group / shared / cross-user / federated 字样视为 bug，PR review 阶段直接拒。

## ① Plan — task description

### 做什么

Issue #82 的 5 个原始设计问题里，**前 4 个已被 M5 viral sync (PR #71) 全面回答**，需要的产物是**对最后 1 个问题的端到端验证 (e2e)** + **attribution chain 可见性**。

具体：

1. **跨机器 e2e teaching probe**：在 2 台真机器（或 2 个隔离的 worktree + 临时 git remote）上跑：
   - Machine M1 上由 `teamagent pitfall` 录入 1 条 personal 规则 → 经两道闸门 → 自动 commit + push 到项目 git remote。
   - Machine M2 上 SessionStart 自动 pull → post-merge hook 触发 `m5-sync --apply` → 规则进入 M2 的本地 KB（`scope.level=team`）。
   - Machine M2 接下来在同类 prompt 上必须由 PreToolUse 拦截命中（命中率 = 100%），或在 UserPromptSubmit 显示提示。无关 prompt 不应误触发（误触率 ≈ 0）。
2. **Attribution chain 可见性**：拦截事件在 AttributionBus 上发出的结构化事件里必须包含 `source_author`、`source_machine_id`、`source_commit_sha`、`source_rule_id`，并在 Renderer 处把这条链显式呈现给 M2 的用户（让 B 看见 "this rule came from A's commit <sha>"）。
3. **依赖把关**：本 plan 的 follow-up impl PR **必须** 在 #81 plan 的 follow-up impl PR 走到 ≥1 份 personal-use raw evidence 后启动。前置阻塞条件由 ADR-0006 第 3 条强制（plan 必须显式列依赖）。

### 怎么做

1. **不重写 M5 已 ship 的 7 项**：
   - 跨机器 git-sync transport（M5-A/C）：`teamagent sync push|pull` + `m5-publish`
   - 双闸门（M5-B）：硬性密钥扫描 + 作用域分类器
   - End-to-end 写盘 + 接收：`.teamagent/team/<author>/<rule_id>.json` + post-merge hook + LWW + tombstone
   - SessionStart auto-pull（默认 on）
   - 团队边界：`team_id = SHA256(normalize(git remote))[:16]`
   - 4 通道拦截（PreToolUse / UserPromptSubmit / Stop / AttributionBus）
   - Calibration via Claude Code subagent（ADR-0004：`RuleBasedCalibrator` 只更新 `confidence`，不写 `tier`、不写 `demerit`；`tier` 是 `KnowledgeEntry` 一等字段，按 ADR-0004 设计**应**由人或 Claude Code subagent 通过 `teamagent set-tier <rule-id> <tier> --reason "..."` 外部写入——但 ⚠ **`set-tier` CLI 命令目前 NOT YET shipped**：`packages/cli/src/commands/set-tier.ts` 不存在，ADR-0004 §"New CLI surface" 描述的是设计意图、由独立 follow-up impl PR 实施。当前实际 tier 写法是直接 `DualLayerStore.add` 时设 `current_tier` 字段或 SQL 改写）

   这些不在本 plan 工作量内。本 plan 把它们当作既成事实（已 shipped 部分）+ 设计意图（`set-tier` CLI 等 NOT YET 部分）混合引用，不重写。

   **注意**：issue #82 第 4 个设计问题（"怎么避免噪声爆炸？投票 / 校准 / hit-count decay / team owner 审批"）M5 + ADR-0004 **部分回答**——`confidence` 由 `RuleBasedCalibrator` 持续校准、低分规则进入 compile gate 黑名单、`team-owner-only enforcement` 由 reviewer 角色（人 + subagent）通过未来的 `set-tier` 与现有的 `review-candidates --approve-scope=team` 把关。**未回答 / NOT YET**：(a) `set-tier` CLI 自身（ADR-0004 follow-up impl PR）；(b) 自动 demote 到 dormant 的策略（ADR-0004 把 auto-tier 列为 rejected alternative d，明确不做闭环自动降权）。本 plan 不补这两条；如果未来 noise 爆炸成真，开新 issue 单独评估是否引入手动批量 demote 工具。

2. **新增 cross-machine e2e teaching rig**（本 plan 主交付物之一）：
   - Rig 形态：`packages/cli/src/__tests__/m5-e2e-teaching.test.ts` 或 `tests/e2e/m5-teaching/` 目录。
   - Rig 用 2 个临时 worktree 模拟 M1 / M2，临时 git remote 用 `git --bare`。
   - Rig 跑完整链：M1 pitfall → 双闸门 → push → M2 pull → m5-sync --apply → M2 PreToolUse intercept → 输出 raw JSON。
   - Rig 输出 fixed schema 落 `summary.json`：`{positive_trigger_rate, false_positive_rate, attribution_present, dependency_check_ok}`（与 §② Probe summary row 完全一致）；source_commit_sha 等 4 个 source_* 字段在每条 `attribution.jsonl` 事件**顶层平铺**记录。judge.md Step 3 **同时读两个 artifact**：从 `summary.json` 读 trigger / false-positive 比率与总体 attribution_present flag；从 `attribution.jsonl` 逐条读 source_commit_sha 与 M1-side commit 做严格比对。
3. **Attribution chain UI**：
   - AttributionBus 已有结构化事件（`docs/features/multi-tool.md` 第 4 通道）；本 plan 验证 4 个 source_* 字段在 team-scope 拦截事件里**确实被 emit + 可读 + 显示给用户**。
   - 如发现 emit 缺字段，本 plan 的 follow-up impl PR 补 emit 路径；显示路径如缺，补 Renderer 段。
   - 不新增 GUI；在 CLI banner / claude-code TUI 文本里就好。
4. **Dependency 把关**：本 plan 落地 = close issue #82。但 follow-up impl PR 起手时必须先核对 #81 follow-up impl PR 状态：≥1 份 redacted 真同事 personal-use evidence 已落 `docs/research/`。否则 follow-up impl PR 直接 hold，#82 不重开（plan 仍 valid）。

### 不做什么

- **不**做 cross-project（跨 git remote）规则共享。M5 spec §12 显式 YAGNI，本 plan 同样不做。team scope 严格按 git remote 边界。
- **不**做 multi-variant model（`problem_cluster_id` + `variant_id`）。M5 NOT YET 项之一，由独立未来 issue 处理。
- **不**做 tombstone GC。M5 NOT YET 项之二，独立 issue。
- **不**做 cryptographic 防恶意绕开。M5 spec §12 显式 YAGNI。
- **不**做 GUI 配置面板。CLI + 文件配置已够。
- **不**新写 secret scanner / scope classifier / LWW 实现——M5 已 ship。本 plan 只在 e2e rig 里调用。
- **不**改 PreToolUse / UserPromptSubmit / Stop 通道结构——本 plan 只验证它们对 team-scope 规则触发链路的 emit 完备性。

## ② Expected outputs — reviewer-checkable artifacts

| Artifact | Path | Reviewer 验收点 |
|---|---|---|
| Cross-machine e2e teaching rig | `packages/cli/src/__tests__/m5-e2e-teaching.test.ts` 或 `tests/e2e/m5-teaching/` 目录 | 跑通：pitfall → 双闸门 → push → pull → apply → PreToolUse intercept；rig 退出码 0 |
| E2E rig 原始输出 | `tests/e2e/m5-teaching/.evidence/<run-id>/{m1.log, m2.log, intercepts.jsonl, attribution.jsonl}` | M1 push commit message 含 `[teamagent-sync]`；M2 attribution 事件**顶层** `source_commit_sha == <M1's commit>`（与 4 字段平铺约定一致） |
| AttributionBus 结构化事件 schema 扩展 | 扩展现有 `packages/types/src/attribution.ts` 的 `AttributionEvent` 类型（**不**新建 `packages/core/src/m5/attribution-event.schema.json`，避免与现有类型分裂——参考 M0 元约束 "Port 接口冻结于 M0、不分叉类型"） | 现有 `AttributionEvent` 已有 `target.{id,file,count}` 嵌套子对象用于"被规则影响的对象"语义；本 plan 在 team-scope 路径**新增 4 个顶层字段**：`source_author`、`source_machine_id`、`source_commit_sha`、`source_rule_id`，每字段 non-empty。这是**对现有 schema 的扩展（net-new top-level fields），不是模仿 `target.*` 嵌套形态**——选择平铺以减少 follow-up impl PR 在 PreToolUse SDK 端 emit 路径的嵌套 / 解构成本，且 4 个字段是规则**触发源**而不是 `target.*`（被影响对象），语义上不是同一类，分开较合理。如 follow-up impl PR 评审认为应嵌套统一为 `source: { author, machine_id, commit_sha, rule_id }`，由该 PR 改动并同步 plan + judge。 |
| Renderer 展示 evidence | `tests/e2e/m5-teaching/.evidence/<run-id>/m2-banner.txt` | M2 用户能在 banner / TUI 文本里看到"this rule came from A's commit <sha>" |
| Probe summary | `tests/e2e/m5-teaching/.evidence/<run-id>/summary.json` | `{positive_trigger_rate: 1.0, false_positive_rate: 0.0, attribution_present: true, dependency_check_ok: true}` |
| Product features 增量 | `docs/PRODUCT-FEATURES.md` 增 1 行 VERIFIED：`team-scope-viral-sync-teaching-e2e` | 状态字段 VERIFIED；指针回 e2e rig 路径 |

注：**不**新增 `docs/specs/2026-05-XX-group-sharing.md`（issue body 提到的产物）—— canonical 名称是 team-scope viral sync，spec 已存于 `docs/superpowers/specs/2026-05-06-m5-team-viral-sync-design.md`。本 plan 只补 spec 的 e2e 验证缺口，不重写 spec。

## ③ How-to-verify — third-party judge harness

Judge harness 是 **MD playbook**：`docs/plans/issue-82/judge.md`（与本 plan 同提交）。Main agent 调度，sub-agents 与 `claudefast -p` 探针执行。

Playbook 6 步：

1. **Glossary lint**：sub-agent grep follow-up **impl PR**（不含本 docs-only plan PR）全部新增/修改 markdown，仅在**正文 prose** 上检测 `group sharing`、`group brain`、`group rule`、`cross-user`、`federated sync` 字面。**白名单**（不视为命中）：
   - 顶部 ASCII art block（首屏内 fenced code block）
   - 任何 backtick fenced code / inline `…` 内容
   - 双引号 / 单引号引用形式的 quoted issue-title reference（例：`"group sharing"`）
   - `## Glossary mapping` 段落整段
   - `## 风险与回滚` 表里描述"用户看到 issue 标题的 X 误以为…"这类 meta row
   命中正文 prose 即 fail。emit `{file, hits_in_prose, hits_in_whitelisted_contexts}`。
2. **M5 ship 状态**：sub-agent 验证 M5 已 ship 7 项的 verify 命令仍 exit 0：
   - `docs/features/xsync/run-judge.sh`
   - `docs/features/pii-redaction/run-judge.sh`
   - `bash scripts/m5-auto-demo.sh`
   - `pnpm exec vitest run packages/core/src/m5/__tests__/lww-merge.test.ts`
   - `pnpm exec vitest run packages/core/src/m5/__tests__/secret-scanner.test.ts`
   - `pnpm exec vitest run packages/core/src/m5/__tests__/scope-classifier.test.ts`
   - SessionStart auto-pull smoke (env unset → `TEAMAGENT_M5_AUTOSESSION` default behavior)
   emit `{step, exit_code, stdout_path}` per check.
3. **E2E teaching rig**：sub-agent 跑新增的 `m5-e2e-teaching` rig，读 `summary.json`：
   - `positive_trigger_rate == 1.0`
   - `false_positive_rate == 0.0`
   - `attribution_present == true`
   - `source_commit_sha != ""`（顶层平铺；与 plan §② row、judge.md Step 3 / Step 4 同款 flat schema，与 `packages/types/src/attribution.ts` 现有 `AttributionEvent` 形状一致——**不**写 `attribution.source_commit_sha` 这种嵌套形态）
   全部满足才 pass。
4. **Attribution chain completeness**：sub-agent 读 `attribution.jsonl` 每条事件，校验 4 个 source_* 字段全部 non-empty。emit per-event `{event_id, fields_complete}`。
5. **Dependency check**：sub-agent 读当前仓库 `docs/research/` 是否含 ≥1 份 issue #81 follow-up impl PR 产出的 redacted personal-use evidence subdir。如无，emit `dependency_satisfied: false`，本 plan 的 follow-up impl PR fail（但本 docs-only PR 不 fail——本 PR 只 close issue + commit plan，不跑 e2e rig）。
6. **Final verdict aggregate**：main agent 写 `docs/plans/issue-82/judge-output/<run-id>/verdict.json`，含 1–5 步 metrics、`pass/fail`、`verdict_reason`。LLM judge 只读 verdict 决定能否 release。

Judge harness **不**评：

- M5 spec 设计是否合理（PR #71 已 review；本 plan 不重审）。
- AttributionBus 通道设计是否最优（多通道架构由 `docs/features/multi-tool.md` 仲裁，本 plan 只验证 4 字段在 team-scope 路径的存在性）。
- "post-merge hook 是否会被同事 disabled"——这是 social problem，不是 technical 验证范围。
- 真实跨同事 2-machine 部署效果——这是 #81 范围（personal-use 评估含跨机器观察），不是本 plan。

## ④ Claudefast probes — BEFORE follow-up impl PR

1. **Probe-1：M5 ship 项现状回归**（`claudefast -p`，并行 7 路）
   - 每路验证 1 个 M5 已 ship 项的 verify 脚本 / vitest 仍 green。任一 fail 表示 M5 退化，先修退化再进 e2e。
   - 通过条件：7 路全 exit 0。
2. **Probe-2：AttributionBus team-scope 字段调研**（`claudefast -p`）
   - 输入：`packages/core/src/attribution/`、`docs/features/multi-tool.md`、M5 sync 模块。
   - 验证：team-scope 拦截事件 emit 路径上 4 个 source_* 字段是否已存在；不存在则在 follow-up impl PR 补 emit 路径。
   - 通过条件：probe 输出 `existing_source_fields: [...]` 的并集 ⊇ 4 字段，或列出缺哪几个。
3. **Probe-3：术语 lint 干跑**（`claudefast -p`）
   - 输入：本 plan 全文。
   - 验证：除 Glossary mapping 节外，正文是否仍含 forbidden terms。
   - 通过条件：probe 输出 `body_forbidden_term_count: 0`。

最多 8 个 `-p` 并行，stream-json 留 audit。详 `docs/FASTPROBE.md`。

## After-PR — POSTPR loop

1. POSTPR loop 直到 Codex silent / 👍。
2. Issue #82 close with cite-back comment（ADR-0006）：plan 路径 + PR 链接 + 一句 "ready for impl PR pending #81 follow-up impl PR producing ≥1 redacted personal-use evidence; canonical naming per CONTEXT.md is team-scope viral sync teaching, mapped to issue title 'group sharing' inside plan's Glossary mapping section"。
3. Follow-up impl PR 反向引用本 plan；不重开 #82。

## 风险与回滚

| 风险 | 缓解 | 回滚动作 |
|---|---|---|
| AttributionBus team-scope 路径缺 source_* 字段 | Probe-2 提前发现；follow-up impl PR 在跑 e2e rig 前补 | 不回滚 plan；follow-up impl PR 多 1 个 commit 补 emit |
| E2E rig 在 CI 上不稳（git push/pull 慢、文件锁） | 用 `git --bare` 临时 remote + 仅本机两个 worktree；不依赖网络 | rig flaky 时重试 ≤3 次；仍 fail 则进 follow-up bug report 流程 |
| #81 follow-up impl PR 长期未启动 | ADR-0006 第 3 条强制依赖；本 plan close 时显式声明依赖 | 不回滚 plan；team 决定是否重开 #82（重开走人手） |
| M5 spec 后续被改（multi-variant 等 NOT YET 项 ship 后） | 本 plan 锁定当前 M5 现状作为基线 | follow-up impl PR 启动时核对 M5 现状是否仍匹配本 plan；不匹配先更新 plan |
| 用户在 issue body 看到"group sharing"以为本 plan 没回答 | Glossary mapping 节明确映射；close comment 重申 | 用户疑问时指向 Glossary mapping 节 |

## Quick checklist (PR 描述粘贴)

- [ ] 全文（除 Glossary 节）零 `group sharing` / `group brain` / `cross-user` / `federated` 字样
- [ ] M5 已 ship 7 项 verify 命令仍 exit 0
- [ ] `m5-e2e-teaching` rig 退出码 0
- [ ] `summary.json` 含 `positive_trigger_rate=1.0`、`false_positive_rate=0.0`、`attribution_present=true`
- [ ] AttributionBus team-scope 事件 4 个 source_* 字段 non-empty
- [ ] follow-up impl PR 启动前 #81 follow-up impl PR 已落 ≥1 份 redacted personal-use evidence
- [ ] `docs/PRODUCT-FEATURES.md` 增 1 行 VERIFIED `team-scope-viral-sync-teaching-e2e`
