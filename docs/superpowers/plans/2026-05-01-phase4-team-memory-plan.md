```
   A 经验  ─PII redactor─►  problem_cluster + variant  ─push─►  team repo
                                                                  │
   B 会话 ◄─inject (并列卡片)─◄  applicability rank ◄─pull─◄──────┘
        │
        ▼
   CLAUDE.md (canonical) + AGENTS.md (4.5 piggyback)  ┐
        │                                              ├─ 3rd-harness verify
        ▼                                              │  (现象/结果，不看实现)
   Task5 Claim contract（口径冻结，benchmark 后启）  ─┘
```

# TeamBrain 14 天 ship 计划（2026-05-01 → 2026-05-14）

> 父级目标 / Task1-6：`docs/superpowers/specs/2026-04-30-roadmap-goal-verification.md`
> 治理基线（多解并列，非冲突）：`docs/specs/2026-04-30-experience-governance-redesign.md`
> Task5 Claim 口径：`docs/superpowers/specs/2026-04-30-task5-benefit-claim-v0.md`
> 当前 TODO/Owners：`docs/superpowers/specs/2026-04-30-todo-status-assignment.md`
> Owner：lbz + lsy　Reviewer：作者本人 + codex/claudefast 双签

---

## CHANGELOG

- v1（2026-05-01）：初版，对齐 2026-04-30 一组新 spec（Goal/Tasks/Governance/Claim/TODO）。**取代**今早草稿"Phase 4 v3 路径"——后者基于已被 supersede 的 roadmap v3，方向（conflict-first + 30% benchmark 门）已被改写。

---

## 一、Task description（做什么 / 怎么做 / 不做什么）

**做什么**：14 天内完成「用户无感上传下载 + 多解并列治理 + Claim 先于验证」三件套，让 5–10 人团队的 TeamBrain 经验跨人流通。具体覆盖 T1–T6 + 关键插队任务 T9 / T12 / T14 / T16。

**怎么做**（与新治理一致）：
- **数据模型**：`problem_cluster_id` + 多 `variant_id` + `applicability[]` + `is_user_good_example`；`conflict_with` 仅作历史兼容字段，不再驱动逻辑。
- **同步链路**：MDC 文件 + git PR transport + PII 拦截 + SessionStart 自动 pull + import 进 knowledge.db。
- **运行时注入**：命中 cluster 输出**并列建议卡片**（≥1 variant），按 applicability 命中度 → 近期成功率 → 证据新鲜度排序；高风险只对"明确错误行为" block。
- **Task 5 路线**：本两周**只**完成 Claim 文档冻结 + 数据管道（rule-id / error-id / session-id / timestamp 全链路）+ 首版周报；**不**追 30% 阈值（启用条件：连续 2 周数据完整性达标）。
- **工程铁律**：先写 Port 契约测试再写实现；core 包零 IO；归因走 AttributionBus；每条 milestone 一次 atomic commit。

**不做**：
- 冲突裁决 / `status:contested` / `resolve-conflicts` 交互（旧方向，已废弃）
- 30% 重复犯错率验收（推到 Claim 验证阶段）
- 云端注册中心 / 中央服务器路线（在 T9 决策前先走 git；T9 决议若改 → 增量改造，不预先实现）
- T11（RAG 性能增强，已删）
- T15 全部范围（仅保留"拓展到 Codex CLI"，且不在本两周内做）

---

## 二、Expected outputs（可验收清单）

### Port 契约（`packages/ports/src/__tests__/`，先红后绿）

| 契约 | 用途 | 实现包 |
|------|------|--------|
| `mdc-codec-contract.ts` | MDC 文件 read/write、roundtrip hash | `packages/core/src/mdc/`（纯函数）|
| `git-sync-transport-contract.ts` | pull/push/diff 抽象 | `packages/io-git/src/`（shell）|
| `problem-clusterer-contract.ts` | 新规则 → cluster_id 归类 | `packages/core/src/cluster/`（纯函数）|
| `applicability-ranker-contract.ts` | variant 排序 | `packages/core/src/cluster/`（纯函数）|
| `pii-redactor-contract.ts` | 7 模式 + 黑名单 + 学习名单 | `packages/core/src/pii/`（纯函数）|

### CLI / Hook

- `teamagent export <id>` / `teamagent import <path>`（T1）
- `teamagent sync pull` / `teamagent sync push`（T1 + T9 git 路线）
- SessionStart hook：自动 pull + import + cluster ingest
- `teamagent promote <id>`（半自动，AttributionBus 提示后一键）
- `teamagent dislike <id>`（永不再学）
- pre-commit hook：PII redactor 强制走（T3）
- `teamagent doctor` 新增检查：Claude APP 检测（T16），存在则报错并阻断 hook 注册
- `teamagent bug-report --bundle`（T12 已 ship #35，本期补 multi-variant 元信息）

### 文档

- 本计划（已交）
- `docs/superpowers/reports/2026-05-14-teambrain-2week-report.md`：实际偏差、Claim 数据完整性首报、Task1-6 进度
- `CLAUDE.md` 更新：commit 规约 + 多解 cluster 注入语义说明（不暴露 token 预算外）
- T16 PR 文档：`docs/superpowers/specs/2026-05-XX-claude-app-detection.md`

### 工件

- `teamagent@0.11.0` npm bundle + tag
- `teamagent-rules-template` 模板仓库（github.com/LiuShiyuMath/teamagent-rules-template）
- 首版 Claim 周报：`reports/claim-week-1.json`（仅口径准备度 + 数据完整性，不做 30% 判断）

---

## 三、Judge harness（第三方裁判，不让代码自评）

**核心**：写 `scripts/teambrain-judge.ts`，每个 Task 完成时跑一次，dump raw JSON + 原始日志到 `.judge/<run_id>/`，由另一只 LLM（claudefast / codex）只读 raw JSON + evidence 给 PASS/FAIL。**严禁**计划作者、执行 agent、被测代码自评。

### 运行步骤

```
RUN  → pnpm typecheck
       pnpm test --coverage
       per-task smoke (scripts/task-N-smoke.ts)
       teamagent doctor --json
       claudefast -p stream-json hook fire test
       codex exec --skip-git-repo-check -s read-only "<gate prompt>"

DUMP → .judge/<run_id>/judge.json   (exit codes / metrics / paths)
       .judge/<run_id>/stdout/*.log
       .judge/<run_id>/coverage/lcov.info

READ → claudefast -p < gate-prompt-with-judge-json.md   (人不读 raw)
```

### 6 条第三方验收（直抄 `2026-04-30-roadmap-3rd-harness-verification.md`）

1. **同步验收**：随机抽 A/B，A 新增经验后 B 后续会话观察到一致效果（T1）
2. **冲突 → 多解验收**：投放同 cluster 多解样本，确认**并列输出**且 applicability 排序可解释（T2 改写）
3. **隐私验收**：含敏感字段样本 → 同步前出现拦截/脱敏可见结果（T3）
4. **稳定性验收**：自然使用周期内拒绝/回滚保持阈值内（T4）
5. **收益声明先行**：Claim 文档（口径/假设/证据/反证）冻结 + 首版周报输出，不做 30% 判断（T5）
6. **团队验收**：≥ 3 人 ≥ 1 周后复核 1-5 全部成立（T6，跨 ship 截止日）

### `judge.json` schema

```json
{
  "run_id": "2026-05-07-task1-12",
  "task": "T1",
  "exit_codes": { "typecheck": 0, "test": 0, "smoke": 0, "doctor": 0 },
  "metrics": { "test_total": 412, "test_passed": 412, "coverage_pct": 0.84,
               "core_io_imports": 0, "claim_data_completeness_pct": 0.91 },
  "evidence_dir": ".judge/2026-05-07-task1-12/",
  "verdict_required": true
}
```

---

## 四、14 天日历（owner-aware）

| Day | 日期 | 焦点 | Owner | Gate（必须 PASS）|
|-----|------|------|-------|------------------|
| 1 | 05-01 | 本计划 ✓、5 个 Port 契约骨架（红）、Claim 数据管道盘点（T5）| lsy | typecheck 绿、契约红色显式 fail |
| 2 | 05-02 | T1：MDC codec + export/import；T9：git vs 中央服务器决议（最迟今天）| lbz+lsy | mdc-codec contract 绿；T9 决议落 ADR |
| 3 | 05-03 | T1：git-sync-transport 契约 + simple-git 选型 | lbz | git-sync contract 绿 |
| 4 | 05-04 | T1：sync pull/push 实现 + SessionStart hook | lbz | T1 验收 1 通过 |
| 5 | 05-05 | T1：双 worktree Alice→Bob 跨人 walking skeleton | lbz+lsy | 端到端 smoke 绿 |
| 6 | 05-06 | T2：problem-clusterer 契约 + cluster ingest | lsy | clusterer contract 绿 |
| 7 | 05-07 | T2：applicability-ranker + 多解并列卡片注入 | lsy | T2 验收 2 通过（注意：是多解，不是裁决）|
| 8 | 05-08 | T3：PII redactor 7 模式（邮箱/主机名/UUID/路径/key/IPv4/私有 URL）| lsy | pii contract 绿 |
| 9 | 05-09 | T3：pre-commit hook + gitleaks 兜底 + 集成测试 | lsy | T3 验收 3 通过 |
| 10 | 05-10 | T4：promote/dislike + AttributionBus 多解事件 + 反噬阈值 | lbz+lsy | T4 验收 4 通过 |
| 11 | 05-11 | T16：Claude APP 检测（doctor 新增）+ 文档；Phase 4.5 AGENTS.md emitter | lsy | doctor 检测 + AGENTS.md hash 等价 |
| 12 | 05-12 | T5：Claim 文档冻结 + 数据完整性首报；T14 HF→ModelScope 兜底 | lsy | claim_data_completeness_pct ≥ 0.85 |
| 13 | 05-13 | T6 启动：template repo + 3 人 fork + bug fix buffer | lbz+lsy | ≥ 3 fork 完成 |
| 14 | 05-14 | tag v0.11.0、npm publish、report.md、双签（claudefast + codex review）| lbz+lsy | tarball install 干净 + 双签 PASS |

**Buffer**：Day 13 唯一 1 天冗余。任一 Task 滑 ≥ 1 天 → 立刻砍 Phase 4.5（AGENTS.md emitter 推到下个 release），保 Task1-6 ship 截止日。

---

## 五、卡点与 mitigation（继承自 todo-status-assignment.md）

| 卡点 | 影响 | Day-1 行动 |
|------|------|-----------|
| 🔴 T9 传播方案未定（git vs central）| 阻塞 T4 病毒传播；本计划假设 git PR | Day 2 EOD 前必须 ADR 落锤；不落则按 git PR 路线先实施，T4 推迟到下一 release |
| 🔴 T14 HF 模型下载被墙 | 阻塞 init / cluster ingest（embedding 模型）| Day 12 之前接 ModelScope mirror，加 fallback URL；不达成则 cluster 走 BM25 only，applicability 仅文本特征 |
| 🟠 Schema 不一致 (`index.json` 数组 vs `{insights:[]}`) | 进 import 链路时炸掉 | Day 4 import 前加适配器层（pure function in core） |
| 🟠 硬编码路径 `C:/bzli/teamagent` + `hooks.json` | Windows 同事跑不起来 | Day 4 import 同时清；用 `path.join` + `os.homedir()` |
| ⚠️ lbz Claude+Codex 额度用完 | lbz 无法做 codex 双签 review | Day 1 用 lsy 的额度兜底；如必要把 codex review 改成 claudefast review 单签（双签降级到 ship 日 Day 14 才必走）|

---

## 六、不在范围内 / 推到下一 release

- T11（RAG 性能增强，已删除）
- T15 全部范围，仅保留 Codex CLI 拓展并推后
- 中央服务器路线（除非 T9 决议改路）
- 30% 重复犯错率正式验收（Claim 阶段二，需先 2 周数据完整性达标）
- benchmark 4 组对比（被 Claim 路线替代）
- AGENTS.md 规范扩展 / 上游推动（Phase 6 议题）
- 重写 calibrator / matcher（M4-B 已稳定，复用即可）
