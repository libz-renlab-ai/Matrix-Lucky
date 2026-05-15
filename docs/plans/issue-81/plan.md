```text
   ┌──────────────────────────────────────────────────────────────┐
   │   plan.md — issue #81                                        │
   │   "在 ≥3 位同事的 Claude Code CLI 实例上重做 personal-use 评估" │
   │                                                              │
   │   ① plan         ② expected outputs                          │
   │   ③ judge harness ④ claudefast probes                        │
   └────────────────────┬─────────────────────────────────────────┘
                        │
   ┌────────────────────┼────────────────────┐
   │                    │                    │
   recruit ≥3 同事    onboard each       collect 1+ week
   (front/back/      (TeamBrain 装机    raw logs + 反馈
    infra/research)   + minimal tutorial)    (attribution events,
   (≥1 深度规划型 +                       PreToolUse 拦截记录,
    ≥1 快速 prototype                    review 输出, 用户反馈)
    型)
   │                    │                    │
   └────────────────────┴────────────────────┘
                        ▼
   docs/research/2026-05-XX-personal-use-3people.md
   (cross-cutting findings + group-sharing 设计输入)
                        ▼
   judge.md MD playbook: 3rd-party LLM judge reads
   raw attribution log JSON + 同事访谈 transcript,
   give per-subject pass/fail and aggregate verdict.
                        ▼
                  open normal PR
                        ▼
                 POSTPR loop until 👍
```

---

## CHANGELOG

- **v1 (2026-05-08)** — 初版 plan，配合 ADR-0006 close issue #81。

---

# Plan — issue #81：≥3 位同事的 Claude Code CLI 个人使用评估

- **Issue:** [#81](https://github.com/libz-renlab-ai/TeamBrain/issues/81) (`enhancement, help wanted`)
- **Branch:** `worktree-clean-issues` (this docs-only PR); follow-up impl PR 自起分支
- **Owner:** unassigned at plan time; 接手者请在 follow-up PR 起 owner
- **Date:** 2026-05-08
- **Reference:** `docs/HOWTO-PLAN-PR.md`、`docs/PRESHIP.md`、`docs/feature-verification.md`、ADR-0006、`docs/CONTEXT.md`（canonical 术语仲裁源）

## Glossary mapping — issue 用语 → CONTEXT.md canonical

`docs/CONTEXT.md` _Avoid_ 列表覆盖 "group / shared / cross-user"。本 plan 正文一律用 canonical：

| Issue 用语 / 历史叫法 | Canonical | 物理对应 |
|---|---|---|
| group sharing / group-sharing design | **team-scope viral sync teaching** | M5 sync 子系统 + L2 team layer（参考 `docs/features/team-share.md`） |
| 同事级 personal-use 评估 | **personal-use evaluation**（本 plan 范围） | 单人 CC 实例 + L1 personal scope |
| group / shared / cross-user 任何变体 | 一律 **team scope** 或 **viral sync** | 视语境选其一 |

本 plan 后续段落正文不出现 forbidden terms；如出现于 ASCII art block / backtick code / 引号引用 / 本 Glossary 节，作为白名单豁免。

## ① Plan — task description

### 做什么

在至少 3 位真同事的 Claude Code CLI 实例上完成一次完整的 personal-use 评估，验证 TeamBrain 在不同 codebase 与不同 agent 习惯下，是否真把"经验记录 → 规则编译 → 归因展示"这条最小学习闭环跑通成"少踩坑"的体感。

具体要回答的问题：

1. 在不同 codebase 形态（前端 / 后端 / infra / research）里，TeamBrain 自动产出的规则**是否真的命中了用户会犯的错**？
2. 在不同 agent 使用习惯（深度规划型 / 快速 prototype 型）下，规则触发节奏（PreToolUse / UserPromptSubmit / Stop）哪一种**真的减少了重复纠错**？哪一种**反而成了噪声**？
3. `teamagent stats` 显示的"学到的经验数 / 分布 / 最近新增"对真同事来说**是否是有意义的可读信号**？
4. 哪些已宣称的产品功能（参考 `docs/PRODUCT-FEATURES.md` 1–58）在真同事手里**站不住脚**？哪些是"纸面 verified、实际不被注意到"？

### 怎么做

1. **招募 3 位同事**（hardness condition）：
   - codebase 类型必须覆盖 ≥3 大类，例如：`{frontend, backend, infra}` 或 `{frontend, backend, research}` 或 `{backend, infra, research}`。
   - agent 习惯必须覆盖 ≥2 类：至少 1 位深度规划型（接受 EnterPlanMode、读多文件再下手）、至少 1 位快速 prototype 型（trial-and-error、改了再说）。
   - 同事必须**真在用 Claude Code CLI 工作**，不能是为评估临时装。
2. **每个同事 onboarding**：
   - 跑 `INSTALL.md` 的 install 流；如果遇到中断（参考 #114），现场记录原因；不绕过、不替用户跑。
   - 跑通 `pnpm teamagent stats` + `teamagent review --scope=personal` 至少看一次输出。
   - 装完后，同事**继续按自己日常工作流跑 ≥1 周**——不指定任务、不安排"演练"。
3. **收集原始证据**（每位同事 ≥1 份）：
   - `~/.teamagent/knowledge.db` 备份（脱敏：跑 hardmatch features 已有的 redact 流程）
   - `~/.teamagent/global.db` 备份（脱敏）
   - `.teamagent/<project>/` 项目级日志（如有）
   - PreToolUse / UserPromptSubmit / Stop hook 的拦截记录 raw JSONL（≥1 条 attribution event/天）
   - `teamagent stats` 一周快照（开始 / 结束）
   - 半结构化访谈 transcript：3–5 题闭合问题 + 自由反馈
4. **半结构化访谈题（每位同事 ≥1 次）**：
   - "TeamBrain 这周拦你最印象深刻的那一次，是真有用，还是噪声？"（必须给具体例子）
   - "如果今天卸载，最可惜的是什么？"
   - "如果今天卸载，最想卸的是什么？"
   - "你的同事如果开始用，你会推他装哪些 packs / skip 哪些 hooks？"
   - "我们 claim 的 58 项产品功能里，你 actually noticed 哪几项？"（提供 `docs/PRODUCT-FEATURES.md` 的清单）
5. **横向汇总**：
   - 三位的 raw attribution event 数量、规则触发分布、stats 增长曲线，做横向对比。
   - 三位的访谈反馈做主题聚类（cluster）：哪些痛点是共有？哪些是 codebase 特异？哪些是 agent 习惯特异？
   - 输出报告 `docs/research/2026-05-XX-personal-use-3people.md`（取 evaluation 完成日期）。

### 不做什么

- **不做 team-scope viral sync teaching 的端到端验证**——那是 #82 的 plan 范围。本 plan 只服务 #82 的前置条件（personal-use 不空才能去做 team-scope viral sync teaching 设计）。
- **不做 evangelism / 招募更多同事 / 写 landing page**——那是 #114/#117/#84 系列的范围。本 plan 只对 3 同事负责。
- **不修产品 bug** —— 评估期发现的 bug 落到 issue tracker，由 BUGREPORT 流程接手，不在本 plan 内修。
- **不做合成数据 / synthetic agent / mock evaluation**——必须真同事真用真工作。
- **不收集 PII / secret**——hardmatch features redact 流程必走在备份脱敏之前，原始 db 不进 PR、不进 gbrain、不外发。

## ② Expected outputs — reviewer-checkable artifacts

| Artifact | Path | Reviewer 验收点 |
|---|---|---|
| Cross-cutting research 报告 | `docs/research/2026-05-XX-personal-use-3people.md` | ≥3 个 subject section（每位同事 1 段）+ cross-cutting cluster section + 给 #82 team-scope viral sync teaching 的设计输入 section |
| Per-subject raw evidence | `docs/research/2026-05-XX-personal-use-3people/subject-<N>/{db.redacted.jsonl, hooks.redacted.jsonl, stats-start.json, stats-end.json, interview.md}` | 每位同事一份 subdir，每份 ≥5 个文件，db 与 hooks 必须 hardmatch redact 处理过，git 上不得出现 `[a-zA-Z0-9]{20,}` 长 token 字面 |
| Subject 招募口径 | `docs/research/2026-05-XX-personal-use-3people/recruitment.md` | 列出 3 同事 codebase 类型 + agent 习惯类型；姓名脱敏成 `subject-1/2/3`；**每位 subject 必须含字段**：`codebase_root_cwd`（绝对路径，judge step 3 enriched `event.cwd` 比对依据）、`evaluation_window_start` / `evaluation_window_end`（**等于** 对应 subject 的 `stats-start.json.window_start` / `stats-end.json.window_end`，judge step 3(c) 强制核对两边相等避免 drift）；明确确认每人**真在用 Claude Code 工作** |
| Subject 访谈题模板 | `docs/research/2026-05-XX-personal-use-3people/interview-template.md` | 5 题闭合 + 自由反馈段；必须能直接复用做下一轮 |
| 报告对 #82 的输入 section | `docs/research/2026-05-XX-personal-use-3people.md` 的 `## Inputs to issue #82 (team-scope viral sync teaching design)` 一节 | ≥3 条具体可下钻的设计输入；每条带证据指针（subject-N / cluster-X） |

报告 byline 必须含 evaluation 日期范围（`<start>..<end>`）与 git SHA。

## ③ How-to-verify — third-party judge harness

判定本 plan 是否被"忠实执行"，不允许由执行者本人或同事自评。Judge harness 是一份 **MD playbook**：`docs/plans/issue-81/judge.md`（与本 plan 同提交），由 main agent 调度若干 sub-agent 或 `claudefast -p` 探针完成。

Judge playbook 的固定步骤（playbook 不是固定 bash 脚本——具体子任务由 main agent 派发）：

1. **结构性 lint**：
   - 检查 `docs/research/2026-05-XX-personal-use-3people.md` 存在；
   - 检查 `subject-1/2/3` 三个 subdir 各自 ≥5 个 redacted 证据文件；
   - 检查报告含 `## Inputs to issue #82` section 且 ≥3 条带证据指针的输入。
2. **redact 完整性**：sub-agent 跑 hardmatch features 的 redact regex 全表对所有 `*.redacted.jsonl` 二次扫描，命中即 fail。
3. **证据真实性 sample check**：sub-agent 随机抽 3 条 `kind == "hook-pre.blocked"` 的事件（**真实的事件形状**——`packages/adapters/src/hook/claude-agent-sdk/pre-tool-use-sdk.ts:91-94` 只 emit `{id,kind,knowledge_id,tool_use_id,tool_name,timestamp,schema_version}`，**没有** `event_type` / `decision` 字段），按 `knowledge_id`（不是 `rule_id`）做 6 项校验：(a) `DualLayerStore.getById(knowledge_id)` 直查 SQLite（`packages/adapters/src/storage/sqlite/dual-layer-store.ts:78`，**不**走 `teamagent review` CLI），(b) entry 必须存在，(c) `event.kind == "hook-pre.blocked"` 且 `event.timestamp` 在 subject evaluation 窗口内，(d) **enriched 字段**：`event.session_id`（由 redact-export 阶段从 StopHook 端注入——StopHook payload 形状是 `{session_id, transcript_path, cwd, hook_event_name}`，**通过 PreToolUse `event.timestamp` 落在 StopHook session 的 started_at/ended_at 时间窗内做 join**；不存在 tool_use_id 序列绑定，因为 StopHook payload 不带它）non-empty 且形态合法，(e) **enriched**：`event.cwd`（由 redact-export 从 recruitment.md 的 `codebase_root_cwd` 字段注入，每位 subject 整个 evaluation 期间一个 cwd）匹配 subject 记录的 codebase root，(f) entry.`created_at ≤ event.timestamp` 且 entry.`source` 落在**评估白名单**：`preset` / `imported` / `accumulated` / `ingested`。**评估禁单**（直接 fail 该 sample）：`team-shared`（团队共享规则不在 personal-use 评估范围；如 subject repo 由于先前 viral sync 已带 team-shared 规则，先在 sample 前过滤掉这类事件并在报告里单独 count，不算评估失败）、`internet`（Phase 4 internet sourced，本 plan 当前不处理；如未来 Phase 4 落地再扩白名单）。`KnowledgeEntrySchema` 完整 enum 是 `preset|imported|accumulated|ingested|team-shared|internet`，本 plan 只白名单前 4 个。redact-export 工具的责任是把 raw SDK 事件 enrich session_id 与 cwd 两个外部字段（session_id 来自 StopHook 时间窗 join，cwd 来自 recruitment.md 字段），再写入 `hooks.redacted.jsonl`——这是 follow-up impl PR 的一项小工具交付物。
4. **访谈语义 hold**：sub-agent 用 LLM judge 读全部 3 份 `interview.md`，输出 raw JSON：`{subject_id, claim_count, evidence_referenced, internally_consistent}`。任何 `internally_consistent=false` 的 subject 列为 fail，要求人手复核。
5. **Cluster reproducibility**：sub-agent 用同一 LLM judge 独立从 raw 证据再聚类一次，与报告 cluster 比对。差异 >40% 视为 cluster 主观性过强，要求作者补证据。
6. **Final verdict**：main agent 汇总 1–5 步的 raw JSON，输出一份 `docs/plans/issue-81/judge-output/<run-id>/verdict.json`，含 `pass/fail`、每步证据 dir 路径、stdout 路径。LLM judge 只读 raw JSON + 必要 evidence 归纳，不允许凭印象判。

Judge harness **不**对：

- 同事访谈的"主观感受"做事实判定（这是研究本身要捕捉的）；
- "TeamBrain 是否真的有用"做产品判定——那是 `docs/PRESHIP.md` 与 follow-up product council 的事；
- 重新跑评估实验本身（这是数据采集，不是验证）。

## ④ Claudefast probes — BEFORE follow-up impl PR

本 docs-only PR 不需要 probes（无可探测代码改动）。Follow-up impl PR（实际跑评估的那个 PR）开工前，必须先跑：

1. **Probe-1：评估范围对齐**（`claudefast -p`）
   - 输入：本 plan + `docs/PRESHIP.md` + 当前 `docs/PRODUCT-FEATURES.md`。
   - 验证：3 位同事的 codebase 类型 / agent 习惯组合是否覆盖 PRESHIP 9 项 ready-to-ship 功能里的至少 7 项触发面。
   - 通过条件：probe stream-json 输出含 `coverage>=0.78`。
2. **Probe-2：redact 流程预演**（`claudefast -p`）
   - 输入：本 plan ② 节 redact 要求 + hardmatch features 现有 regex 表。
   - 验证：在合成的 `db.jsonl` 输入上跑 redact，零 leak。
   - 通过条件：probe 输出 `leak_count=0`。
3. **Probe-3：访谈题对齐**（`claudefast -p`）
   - 输入：5 题访谈模板。
   - 验证：每题是否能映射到本 plan ① 节 4 个核心问题之一；映射不齐则补题。
   - 通过条件：probe 输出 `mapped_questions=5`。

最多 8 个 `-p` 并行，stream-json 留 audit。详 `docs/FASTPROBE.md`。

## After-PR — POSTPR loop

本 docs-only PR 完成后：

1. POSTPR loop 直到 Codex silent / 👍（参考 `docs/POSTPR.md`）。
2. Issue #81 close with cite-back comment（ADR-0006）：plan 路径 + PR 链接 + 一句 "ready for impl PR; impl PR 将在招齐 3 同事后启动"。
3. Follow-up impl PR 反向引用 `docs/plans/issue-81/plan.md` + 本 PR；不重开 #81。

## 风险与回滚

| 风险 | 缓解 | 回滚动作 |
|---|---|---|
| 招不齐 3 同事或 codebase / habit 组合不覆盖 | 启动 follow-up impl PR 前用 Probe-1 阻挡；不齐则等 | 暂停 impl PR，issue #81 不重开（plan 仍 valid） |
| 同事中途退出 | recruitment.md 备 1–2 位候补；记录退出原因 | 报告里诚实标注 `subject-N withdrew at week X`，不补合成数据 |
| Redact 流程漏过新型 token | hardmatch features regex 表持续更新；judge 步骤 2 拦底 | 任何 leak 命中 → 立即 force-push 移除 + commit 标 `redact-failure-recovery` + 复盘 |
| 报告 cluster 主观性过强 | judge 步骤 5 要求 reproducibility；差异 >40% 必须补证据 | 报告打 `cluster-subjective` flag；不影响 raw evidence 价值 |
| 访谈被同事社交压力扭曲 | 访谈模板含"如果今天卸载最想卸的是什么"反向问；transcript 必须保留犹豫 / 反水原话 | 报告里用引号原话呈现，不替同事润色 |

## Quick checklist (PR 描述粘贴)

- [ ] 3 同事 recruitment.md 含 codebase + habit 矩阵
- [ ] 每位同事 ≥1 周 raw evidence + 半结构化访谈 transcript
- [ ] redact 全表过；git diff 不含长 token 字面
- [ ] 报告 `## Inputs to issue #82` 有 ≥3 条带证据指针的输入
- [ ] judge.md MD playbook 跑过、verdict.json 落地
- [ ] follow-up impl PR 反向引用本 plan 路径
