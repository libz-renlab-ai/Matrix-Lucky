## 摘要

修复 TeamAgent 语义匹配 / 规则触发完整链路（M4-B 起预先存在的 vec0 加载 bug），并把 PreToolUse 的 block 等级从硬阻塞软化为 advisory（`allow + systemMessage`）。修复后 dense semantic recall 真正命中 25+ 候选 / scope，规则首次具备真实在线提醒能力，但**不再阻塞用户操作**。

合并基线：本分支已先合并 `TeamBrain/main` 最新 47 个 commit（merge commit `25994e5`），与 main 完全同步后再交付这 7 个 m4 修复。

## 核心修复（PR 主线）

**根因**：tsup 把 `sqlite-vec` inline 进 PreToolUse hook bundle，runtime 时 native `.node` binary 解析失败 → `schema.ts` 静默 catch 吞掉错误 → `_sqliteVecLoad === undefined` → `openDb` 跳过 vec0 注册 → 所有 dense MATCH 查询报 `no such module: vec0` → retriever 永远返回 0 候选 → **任何规则永不触发**。即使 `migrate-v6` 报告成功、规则数据库看着 OK，整条语义链路实际是死的。

**修复**：
- `tsup.hook.config.ts` external 列表加 `sqlite-vec`，bundle 不 inline
- `packages/cli/package.json` 显式声明 `sqlite-vec@0.1.9` 为直接依赖，pnpm 装到 `packages/cli/node_modules` 让 bundle 找得到

## 7 个 commit 概览（按合入顺序）

1. `fix(m4)`: **work around CC 2.1.x systemMessage UI regression** — hook systemMessage 镜像到 stderr（CC issue #50542）+ 注入"AI 主动播报激活规则"指令；env `TEAMAGENT_HOOK_STDERR=0` / `TEAMAGENT_AI_ANNOUNCE=0` 可关
2. `fix(m4)`: **emit `hook-pre.passive_matched` for silent passive matches** — passive 规则不再误发 `hook-pre.warned` 和 systemMessage；statusline 的 `HELPED_EVENT_KINDS` 用真实事件 kind 对齐
3. `feat(m4)`: **auto-write rule embeddings on insert/update via opt-in API** — `SqliteKnowledgeStore` / `DualLayerStore` 新增 `addWithEmbedding` / `updateWithEmbedding`，关闭"deferred to migrate-v6"长期 gap
4. `feat(m4)`: **wire ingest+extract pipelines through `addWithEmbedding`** — `KnowledgeStore` port 加可选方法 + ingest/extract 两条主路径切换；store 不支持时 fallback 到老 `add()`
5. `fix(m4)`: **bundle sqlite-vec as external so vec0 actually loads in hook** — **本 PR 主修复**（见上）
6. `feat(m4)`: **env-gated retriever + matcher debug log** — `TEAMAGENT_HOOK_DEBUG=1` 打开后 stderr 打印每个候选的 bm25/triggerSim/patternSim/RRF/scoreSoftAnd/threshold；本 PR 的 root cause 就是用它定位到的
7. `feat(m4)`: **soften PreToolUse block enforcement to advisory-only** — Hook 永远不再返回 `permissionDecision="deny"`；block 等级规则 resolve 为 `allow + systemMessage`（标题改为 "TeamAgent 强烈提醒"）；`hook-pre.blocked` 事件 kind 保留以便 calibrator promotion stats 和 `detectBlockedCircumventedSignals` 继续工作

## 行为变化（重要，影响所有用户）

**Block 不再硬阻塞**。之前 0.95-conf 规则会硬卡 `git fetch` 这种正常操作；现在 Claude Code 永远不被打断，但仍能拿到规则 context。如果你依赖硬阻塞行为，本 PR 会改变它。Follow-up 应考虑加 env flag `TEAMAGENT_STRICT_BLOCK=1` 让重度用户重新开启硬阻塞。

## 测试与验证

- ✅ `pnpm typecheck`: 0 errors（整个 monorepo `tsc --noEmit`）
- ✅ `pnpm test`: **1465 passed / 2 skipped / 0 failed**（144 test files, 46.76s）
- ✅ pre-tool-use-sdk 测试套件 14/14 通过（含 2 个新 passive-matched 测试 + 2 个 block→advisory 行为修正）
- ✅ sqlite-knowledge-store-auto-embed 测试套件 5/5 通过（覆盖向量插入/缺 embedder fallback/update 替换/空描述短路/embedder 抛错容错）
- ✅ 闭环 hook 真跑（调试期间）：
  ```
  [teamagent-retriever] scope=global stage1+2+3 → 25 candidates
  [teamagent-matcher]   seed-pers-... t=0.574 p=0.542 score=0.446 >0.40? PASS
  permissionDecision: "allow" + systemMessage="TeamAgent 强烈提醒…"
  ```

## 已知次要问题（非阻塞，留 follow-up）

1. **召回偏宽**：multilingual-e5-small 模型对跨主题文本 cosine 也常 0.5+，导致弱相关规则也过 `fire_threshold=0.40`。建议提阈值到 0.50，或把易过拦的规则降到 enforcement=warn 让 calibrator 学习。
2. **FTS5 不可用**：Node 22 内置 sqlite 没编 FTS5，BM25 路径降级返回空。Dense 单路够用。可选 follow-up：换 better-sqlite3 / 带 FTS5 的 sqlite build。
3. **embedding 自动写未全切**：`init.ts` seed loader / `review-candidates` / `migrate-v1-to-v2` 仍走老 `add()`，依赖 `migrate-v6 --repair-all` 兜底。其余两条主路径（ingest/extract）已切换。
4. **Strict block 未提供 opt-in**：本 PR 一刀切软化为 advisory，未保留硬阻塞 fallback。

## 测试计划

- [x] `pnpm typecheck` 0 errors
- [x] `pnpm test` 1465/1467 pass
- [x] hook 闭环：vec0 加载 ✓ / 召回 ≥25 候选 ✓ / score 过阈 ✓ / advisory systemMessage 渲染 ✓
- [ ] CI 复跑验证（PR 触发）
- [ ] release branch 自动构建确认（合入 main 后几分钟内 `release-meta.json` sha 应跟上）

🤖 Generated with [Claude Code](https://claude.com/claude-code)
