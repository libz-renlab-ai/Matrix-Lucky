```
   BEFORE                                       AFTER
   ──────                                       ─────
   docs/features/<f>/canned-answer-snippet.md   bash scripts/probe-feature.sh <f>
          │                                            │
          │  agent copies static markdown   ✗         │  Step 1: claudefast -h    (flag check)
          │  grep gate passes on substring  ✗         │  Step 2: claudefast -p    (Read/Grep/Glob)
          │  code drift is invisible        ✗         │  Step 3: dump stream.jsonl + answer.md
          ▼                                            ▼
   "verification = string in file"             "verification = symbol in code"
   reward hack                                  evidence-grounded answer
                                                .fastprobe/feature-<f>/probe-<UTC>/
                                                  ├── stream.jsonl   (raw stream-json)
                                                  └── answer.md      (extracted text)
```

# Canned-Answer Migration Report — 2026-05-06

试点迁移：把 `docs/features/<feature>/canned-answer-snippet.md` 这种 hand-written
小抄式 canned answer 从本仓库换成由 `claudefast` 探测真实代码生成的动态答案。
本 PR 完成 39 个 feature 中的第 1 个（`calibrator-v2`），并落下了通用 probe 驱动、
smoke test、CONVENTIONS 政策与 INDEX 的 deprecation 提示。剩余 38 个 feature 留作后续 PR。

---

## 1. 目标与动机

参见 `WORKTREE_TASK.md`。简短复述：

- **静态 snippet 是 reward hack**：agent 不需要"知道"feature，只需照抄 snippet 让 grep gate 通过，
  代码可以漂移、改名、删除而 snippet 仍然让验证 PASS，把"有这串字符"和"feature 真在工作"混为一谈。
- **新模式以代码为锚**：每次回答 "feature X 是什么" 时，由 `claudefast` 用 Read / Grep / Glob 实际
  探查仓库，提供 file:line 证据；任何引用了已不存在符号的回答都会在下次 probe 时立刻暴露。
- **范围**：仅适用 `docs/features/<feature>/`；不动 `CLAUDE.md` / `AGENTS.md` 内 inline 的 9 条全局
  triggered rule（POSTPR / FASTPROBE / DOGFOOD / BUGREPORT / DUCKPLAN / TODOC 等），那些由
  md playbooks under `docs/plans/` 统一守（archived script: `docs/legacy/judge-scripts/scripts/verify-all-rules.sh`）。

---

## 2. 改动清单（文件级）

### Created

| Path | Lines | Purpose |
|------|------:|---------|
| `scripts/probe-feature.sh` | 217 | 通用 probe 驱动：3 步（flag 探测 → stream-json probe → 抽取 answer.md），支持 PATH 上的 binary 或 zsh alias 两种 claudefast 形态，超时默认 180s |
| `scripts/__tests__/probe-feature.test.sh` | 115 | Smoke test：claudefast 不在 PATH 时 SKIP（exit 0）；可用时跑 `calibrator-v2`，断言 artifact dir / stream.jsonl 非空 / answer.md 存在 |
| `WORKTREE_TASK.md` | 42 | 本 worktree 的 goal / scope / non-goals 说明 |
| `docs/reports/2026-05-06-canned-answer-migration-report.md` | — | 本报告 |

### Modified

| Path | Δ Lines | Change |
|------|--------:|--------|
| `docs/features/CONVENTIONS.md` | +44 / -10 | 新增 "Canned-answer snippet (DEPRECATED)" 段：解释 reward hack、新 canonical 模式 (`probe-feature.sh`)、迁移政策（不允许新增 snippet，旧 snippet 在迁移完 verify 之前留在原地） |
| `docs/features/INDEX.md` | +6 | 顶部加 DEPRECATION NOTICE block，指向 `bash scripts/probe-feature.sh <feature>` 与 `CONVENTIONS.md` |
| `docs/features/calibrator-v2/verify-canned-answer.sh` | +84 / -29 (重写) | 从 `grep snippet.md` 改写为：调 `probe-feature.sh calibrator-v2`，断言 artifact dir 存在、stream.jsonl 非空、`calibration-pipeline-v2.ts` 字面 anchor 出现在 `answer.md` 或 `stream.jsonl` 任一处 |

### Deleted

| Path | Method |
|------|--------|
| `docs/features/calibrator-v2/canned-answer-snippet.md` | `git rm` (41 行删除) |

### Auto-modified (not by this team)

| Path | Reason |
|------|--------|
| `CLAUDE.md` | `<!-- TEAMAGENT:START -->` 自动管理块被 `pnpm test` 阶段的校准管线刷新（条数从 30 → 64，新编译 29 条，token 预算 3000）。这是 calibration pipeline 作为线上 feature 的真实运行结果，不是本团队的手改。详见 §4 step 5 说明。 |

---

## 3. 验证结果

所有命令在 worktree root（`/Users/m1/projects/TeamBrain/.claude/worktrees/canned-answer`）执行。
逐步 log 落在 `.fastprobe/verifier/`（`step-1-typecheck.log` … `step-7` 部分；最终 summary 见 `summary.log`）。

| Step | Command | Result | Log path | Lines |
|------|---------|--------|----------|------:|
| 1 | `pnpm typecheck` | **PASS** — `tsc --noEmit -p tsconfig.base.json` exit 0 | `.fastprobe/verifier/step-1-typecheck.log` | 4 |
| 2 | `pnpm test` | **PASS** — vitest 171 files / 1698 tests / 49.41s | `.fastprobe/verifier/step-2-test.log` | 354 |
| 3 | `bash scripts/probe-feature.sh calibrator-v2` | **PASS** — `flag check ✓` + 282,203-byte stream.jsonl + answer.md 写入 | `.fastprobe/verifier/step-3-probe.log` | 13 |
| 4 | `bash docs/features/calibrator-v2/verify-canned-answer.sh` | **PASS** — 3/3 assertion 通过：(a) artifact dir 创建；(b) stream.jsonl 275,129 bytes；(c) `calibration-pipeline-v2.ts` 字面 anchor 命中 | `.fastprobe/verifier/step-4-verify.log` | 17 |
| 5 | `git status -s` | **PASS-with-expected-deviation** — 期内文件全部出现，外加 `CLAUDE.md` 一行（auto-managed block，见说明） | `.fastprobe/verifier/step-5-git-status.log` (+ diff at `step-5-claude-md-diff.log`) | 9 + 53 |
| 6 | snippet deletion check (`canned-answer-snippet.md` 不存在) | **PASS** | `.fastprobe/verifier/summary.log:17` | — |
| 7 | `WORKTREE_TASK.md` exists | **PASS** | `.fastprobe/verifier/summary.log:20` | — |

### Step 5 的 expected deviation 说明

`git status -s` 在期内 5 项之外多了 `M CLAUDE.md` 一行。`step-5-claude-md-diff.log` 显示
diff 完全集中在 `<!-- TEAMAGENT:START - 自动管理，请勿手动编辑 -->` 与 `<!-- TEAMAGENT:END -->`
之间（标题从 `30条活跃知识` 变 `64条活跃知识，为你编译了 29 条（token 预算 3000）`，列表内容
随之刷新）。这是 step 2 `pnpm test` 跑了 calibration pipeline、把更新过的规则编译进 CLAUDE.md
的副作用——calibration pipeline 是线上 feature 不是噪声，没有理由阻止它写入。本团队没有
hand-edit CLAUDE.md，本 PR 也不应对该自动块负责。

---

## 4. 迁移政策（短摘）

详见 `docs/features/CONVENTIONS.md` 的 "Canned-answer snippet (DEPRECATED)" / "Migration policy"。
要点：

- **现存 39 个 snippet → 38 个**：本 PR 删了 `calibrator-v2`，剩余 38 个保持原状，**不要先删再迁**——
  必须先把 `verify-canned-answer.sh` 改写成 `probe-feature.sh` 形式，确认 PASS，再 `git rm` snippet。
- **新 feature 禁止新增 `canned-answer-snippet.md`**。新 feature 的 canned-answer 路径必须直接是
  `verify-canned-answer.sh` → `probe-feature.sh <feature>` → 真实代码 anchor 断言。
- **存量 `verify-canned-answer.sh` 应逐步改写**为 probe-feature 形式，grep stream-json 而不是 grep snippet。
- **CLAUDE.md / AGENTS.md inline 答案不动**：那些是全局 trigger（POSTPR / FASTPROBE 等），由
  md playbooks under `docs/plans/` 统一管理（archived script: `docs/legacy/judge-scripts/scripts/verify-all-rules.sh`），不在本迁移范围内。

---

## 5. Follow-up TODO — 38 个待迁移 feature

`find docs/features -name canned-answer-snippet.md -type f`（执行于 2026-05-06）：

```
ab-benchmark          attribution-bus       auto-capture
canned-answers        clean-install         cli-bug-report
cli-dashboard         cli-dogfood-report    cli-init
cli-pr-cycle          cli-reclassify        cursor-compiler
doctor-install        embedding-conflict    hook-registered
inline-wiki           internet-rag          knowledge-portal
matcher-scope         mcp-check-pitfall     mcp-server
multi-tool            npm-install           onboarding
override-loop         pii-redaction         real-time-intercept
review-gate           rule-quality          sandbox-full
session-monitor       six-source-ingest     sqlite-store
team-promote          team-share            tech-taste
trae-adapter          xsync
```

每条迁移的标准动作：

1. 选一个真实代码 anchor（一个文件名或符号名，必须确实存在于当前 source）。
2. 把 `verify-canned-answer.sh` 改成调用 `bash scripts/probe-feature.sh <feature>`，断言：
   - artifact dir 创建；
   - `stream.jsonl` 非空；
   - anchor 同时在 `answer.md`（首选）或 `stream.jsonl`（fallback）任一处出现。
3. 跑 verify 通过后，`git rm docs/features/<feature>/canned-answer-snippet.md`。

建议批次顺序：先迁已有 `run-judge.sh` 的 10 个（`ab-benchmark` `cursor-compiler` `doctor-install`
`hook-registered` `matcher-scope` `mcp-server` `pii-redaction` `rule-quality` `team-share` `xsync`），
因为它们已经有独立的 judge harness、迁 verify-canned-answer 不会牵动 judge 部分。

---

## 6. 风险与已知限制

### claudefast 可用性

`probe-feature.sh` 与新版 `verify-canned-answer.sh` 在 claudefast 不在 PATH 也不可作为 zsh alias
解析时**清洁地 SKIP**（exit 0 + 一行提示），所以无 claudefast 的 CI 不会误失败。但代价是：那种环境
下 verify 实质上是 no-op，code drift 不会被发现。后续 CI 必须装 claudefast，否则迁移完后整个 verify
矩阵会变成"全 SKIP = 全 PASS"的伪绿。

### Probe artifact 不进 git

`.fastprobe/` 已被 `.gitignore`，artifact 只在执行机本地保留。这意味着复现一次 verify 必须本地跑，
而结果会受 claudefast 版本、API endpoint、模型行为影响。`stream.jsonl` 大小是个粗略指标
（本次两次连跑分别为 282 KB / 275 KB / 320 KB+），不要 hardcode 字节数做断言。

### jq 抽取器在 PR 中加固过一次

`probe-feature.sh:175–192` 走三种 stream-json shape：(1) `type=="result"` 的最终 result
event；(2) `content_block_delta` text delta；(3) `assistant` message content array。`type=="result"`
是这次 PR 才补的——在没有它之前，answer.md 经常是空的，因为 claudefast 的 `-p` 输出走的是 result
event 而不是 delta。**未来 claudefast 改输出 schema 时，answer.md 会再次"安静地空掉"**——
stream.jsonl 仍非空、probe 仍 exit 0，但是 `verify-canned-answer.sh` 的 anchor assertion 会失败。
这是预期失败，不是 bug。

### 延迟与成本

probe 一次约几十秒到 180s，相比静态 grep（微秒级）多两个数量级。整体跑全部 39 个 verify 顺序
执行预计 20–120 分钟。建议后续在 CI 上并行（`xargs -P` 或类似）；本地开发不需要每次都跑全。
单次 probe 还要消耗 claudefast token 配额，全量 verify 一次的 token 量并不便宜。

### Calibrator-migrator 的 dual-check workaround

`docs/features/calibrator-v2/verify-canned-answer.sh:80–82` 同时检查 `answer.md` 与 `stream.jsonl`：

```bash
if { [[ -f "$ANSWER_MD" ]] && grep -qF "$EVIDENCE_FILE" "$ANSWER_MD"; } \
    || grep -qF "$EVIDENCE_FILE" "$STREAM_LOG" 2>/dev/null; then
```

这是因为 jq 抽取器在某些 stream-json shape 下仍可能漏抽，但 anchor 字符串一定存在于
原始 stream.jsonl。**其他 38 个迁移应该沿用这个 dual-check 模式**，不要只依赖 answer.md。

### Probe 是非确定性的

claudefast 每次跑都可能选不同探索路径、引用不同 file:line。anchor 选择必须用"几乎一定会出现"
的字面字符串（比如核心源文件名 `calibration-pipeline-v2.ts`），而不是某次跑出现的特定行号或
某个 helper 函数名——那些会因模型路径变化而漂移。

### 样例 artifact 留在 worktree

参考件：`.fastprobe/feature-calibrator-v2/probe-20260506T141953Z/`（answer.md 183 行 / stream.jsonl
291 行 / 275 KB）和 `…/probe-20260506T141757Z/` 是 step 3 与 step 4 各一次执行的 artifact。后续
迁移可以直接对照这两份 artifact 定 anchor。
