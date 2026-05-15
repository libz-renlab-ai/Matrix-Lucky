```text
   ┌──────────────────────────────────────────────────────────────┐
   │   plan.md — issue #89                                        │
   │   "Add seed/packs/{frontend-js,python-data,ops-safety,       │
   │    golang,rust}.jsonl stack packs"                           │
   │                                                              │
   │   ① plan         ② expected outputs                          │
   │   ③ judge harness ④ claudefast probes                        │
   └────────────────────┬─────────────────────────────────────────┘
                        │
       ┌────────────────┼────────────────┐
       │                │                │
   universal.jsonl   5 stack jsonls    seed/packs/README.md
   (#88, shipped)   ┌──┬──┬──┬──┬──┐  (rule-count table,
       │           fe py ops go rs    pack list, install hint)
       │           ─────────────────       │
       │           ~5–10 entries each      │
       │           scope.file_types        │
       │           filtered                │
       └────────────────┴─────────────────┘
                        │
                        ▼
   docs/features/stack-packs/run-judge.sh exit 0
   (judge harness MD playbook 调度)
                        ▼
   `teamagent pack list` (issue #90, shipped) shows 6 packs
                        ▼
   docs/PRODUCT-FEATURES.md +6 VERIFIED rows
                        ▼
                  open normal PR
                        ▼
                 POSTPR loop until 👍
```

---

## CHANGELOG

- **v1 (2026-05-08)** — 初版 plan，配合 ADR-0006 close issue #89。

---

# Plan — issue #89: 5 stack packs (frontend-js / python-data / ops-safety / golang / rust)

- **Issue:** [#89](https://github.com/libz-renlab-ai/TeamBrain/issues/89) (`enhancement`)
- **Branch:** `worktree-clean-issues` (this docs-only PR); follow-up impl PR 自起分支
- **Owner:** unassigned
- **Date:** 2026-05-08
- **Reference:** `docs/HOWTO-PLAN-PR.md`、`docs/feature-verification.md`、ADR-0001 / ADR-0002、`packages/teamagent/seed/packs/universal.jsonl`（#88 落地的范本）

## ① Plan — task description

### 做什么

在 `packages/teamagent/seed/packs/` 下增加 5 份语言/栈特定的 avoidance 规则包，**复用** `#88` 已落地的 `universal.jsonl` schema，每份 5–10 条规则、按 `scope.file_types` 过滤以避免跨语言误触发，并在 `seed/packs/README.md` 列出全部 packs（含 `universal` 共 6 份）。

5 个 pack 的命名与覆盖面：

| Pack | 文件 | scope.file_types | 入选规则候选（每条独立可改） |
|---|---|---|---|
| **frontend-js** | `seed/packs/frontend-js.jsonl` | `["js","jsx","ts","tsx","mjs","cjs"]` | (a) `var ` declarations → `let`/`const`；(b) `==` strict-eq → `===`；(c) `document.write(`；(d) `eval(`；(e) inline event handlers `onclick="`；(f) jQuery `$('#…')` 在新代码里；(g) `Array.prototype.indexOf(...) > -1` → `.includes()`；(h) `setInterval` 不带 cleanup（subjective，标 nature=subjective） |
| **python-data** | `seed/packs/python-data.jsonl` | `["py","ipynb"]` | (a) `from pandas import *`；(b) `df.append(`（已 deprecated）→ `pd.concat`；(c) `import pickle` 无 `usedforsecurity` 警示；(d) `np.float`/`np.int`（已移除）→ 内置类型；(e) `requirements.txt` 不 pin minor；(f) `eval(` on user input；(g) `os.system(` → `subprocess.run`；(h) bare `except:` |
| **ops-safety** | `seed/packs/ops-safety.jsonl` | `["sh","bash","zsh","yaml","yml","tf","Dockerfile"]` | (a) `rm -rf /`；(b) `kubectl delete --all`；(c) `chmod 777`；(d) `git push --force` to protected branches；(e) Dockerfile `RUN curl … \| bash`；(f) Terraform `prevent_destroy = false`；(g) shell `set -e` 缺失；(h) `sudo` 不带 `-n` 在 CI |
| **golang** | `seed/packs/golang.jsonl` | `["go"]` | (a) `panic(` in library code；(b) `fmt.Println` 在生产路径；(c) goroutine 泄漏（`go func() { ... }()` 无 ctx cancel，标 subjective）；(d) `interface{}` → `any`；(e) `errors.New` 含 `fmt.Sprintf`-shaped 字符串 → `fmt.Errorf`；(f) `time.Sleep` 在测试里 → `t.Eventually` 或 channel；(g) 忽略 `err` 返回值 (`_ = foo()`) |
| **rust** | `seed/packs/rust.jsonl` | `["rs"]` | (a) `unwrap()` 在 lib code；(b) `.clone()` 链 ≥3；(c) `unsafe` 块缺 `// SAFETY:` 注释；(d) `panic!()` 在 lib；(e) `as` cast on integer types → `try_from`；(f) `Box<dyn Error>` 在 public API → custom `enum`；(g) `mem::transmute` |

候选条目数都是 ≥7、按需取 5–10 条、必要时降级为 `nature=subjective` + `enforcement=warn`。**不**追求 100% 客观——客观度低的条目用 `nature=subjective` 标识即可，按 calibration 流程后续校准。

### 怎么做

1. **照抄 schema**：每条规则 1:1 沿用 `seed/packs/universal.jsonl` 已落地字段（id 前缀改为 `seed-pack-<lang>-<slug>`、`scope.level=global`、`source=preset`、`current_tier=canonical`、`tier_entered_at` 用 commit 日期）。
2. **加 `scope.file_types`**：universal pack 没有 file-type 限制（跨语言）；本批 5 个必须有。schema 字段名锚定 issue body：`scope.file_types: ["js","jsx","ts","tsx"]` 形态。
3. **`wrong_pattern` matcher-aware**：legacy matcher（`packages/core/src/matcher/legacy/keyword-matcher.ts`）实际行为是 `splitPatterns` 按 `|` 切分多 token，token 长度 < 3 字符会被丢弃。**注意 token 匹配语义因字符组而异**——纯字母数字 token（regex **`/^[a-z0-9_-]+$/i`**，case-insensitive）走 `plainTokenMatches` 词边界匹配（例：`var` 不会命中 `variable`，`Var` 也命中），含标点 token 走 `containsNonExtending`：仅当 pattern 末字符是字母 / 数字时启用 anti-extending（防 `moment` 命中 `momentum`），末字符是标点（`.`、`(`、`-`、`'` 等）时退回 `String.prototype.includes()` 字面子串匹配（例：`sk-` / `eval(` / `.removeAt(`）。所以**唯一真正的多 token 分隔符是 `|`**，`.()[]*+?{}^$\\` 等 regex 元字符在本 matcher 里全是**字面字符**（universal.jsonl 已含 `eval(` / `dangerouslySetInnerHTML` / `git push --force` 这类含特殊符号的 pattern）。本 plan 的检查口径：(a) `|` 不允许出现在单 token 中，要么作为 alternation 分隔且每段 ≥3 字符，要么不写；(b) 每个有效 token 长度 ≥3 字符；(c) 其他 regex-like 字符是 OK 的字面字符，不必避讳；(d) 候选规则作者下笔时若拿不准词边界 vs 子串语义，go-to 测试是 `legacy/keyword-matcher.ts` 单测。
4. **`README.md`** 列出 6 个 pack：每行 `pack name | rule count | scope | install hint`。同时贴一段 `teamagent pack add <name>` 的命令示例（CLI 来自已 close 的 #90）。
5. **Verify script** `docs/features/stack-packs/run-judge.sh`：跑 judge MD playbook 的 thin shim（playbook 在 `docs/plans/issue-89/judge.md`，详 ③ 节）。
6. **`docs/PRODUCT-FEATURES.md` 增 6 行 VERIFIED**：`stack-pack-universal`、`stack-pack-frontend-js`、`stack-pack-python-data`、`stack-pack-ops-safety`、`stack-pack-golang`、`stack-pack-rust`。

### 不做什么

- **不** 增加 pack-level CLI（`teamagent pack list/add/remove`）——它已经在 #90 里 ship。
- **不** 实现 auto-detection 硬编码逻辑——按 ADR-0002，stack 检测交给用户的 coding agent。
- **不** 写跨 pack 的依赖关系 / pack-of-packs 元 pack——现在不需要。
- **不** 跑 calibration 全流程产出 confidence——本 plan 用 `confidence=0.80–0.85` baseline、`current_tier=canonical`，后续由 calibration（ADR-0004）持续校准。
- **不** 翻译规则到英文——保持中文 trigger / reasoning，与 universal pack 一致。

## ② Expected outputs — reviewer-checkable artifacts

| Artifact | Path | Reviewer 验收点 |
|---|---|---|
| frontend-js pack | `packages/teamagent/seed/packs/frontend-js.jsonl` | 5–10 行；每行 valid JSON；含 `scope.file_types`；substring 命中真实代码 |
| python-data pack | `packages/teamagent/seed/packs/python-data.jsonl` | 同上 |
| ops-safety pack | `packages/teamagent/seed/packs/ops-safety.jsonl` | 同上 |
| golang pack | `packages/teamagent/seed/packs/golang.jsonl` | 同上 |
| rust pack | `packages/teamagent/seed/packs/rust.jsonl` | 同上 |
| Pack README | `packages/teamagent/seed/packs/README.md` | 6 行 pack 表（含 universal）+ 安装命令示例 |
| Verify shim | `docs/features/stack-packs/run-judge.sh` | exit 0；调度 `docs/plans/issue-89/judge.md` playbook |
| Product features 增量 | `docs/PRODUCT-FEATURES.md` 6 个新行 | 状态字段一致用 VERIFIED；指针回 `seed/packs/<name>.jsonl` |
| `teamagent pack list` 输出 | CLI 输出 | 显示 6 个 pack 名 + rule_count + 状态 |

## ③ How-to-verify — third-party judge harness

Judge harness 是 **MD playbook**：`docs/plans/issue-89/judge.md`（与本 plan 同提交）。`docs/features/stack-packs/run-judge.sh` 是 thin shim，只负责把 playbook 的 6 步固定子任务派发给 sub-agent / `claudefast -p`。

Playbook 6 步（每步是 sub-agent 子任务，**不是固定 bash 步骤**）：

1. **Schema lint**：每个 jsonl 行能 JSON.parse、有 `id / scope / type / wrong_pattern / current_tier` 等必备字段；`source=preset`、`current_tier=canonical`、`scope.level=global` 全部满足。emit `{file, valid_lines, invalid_lines}`。
2. **File-type scope**：5 个 stack pack 必须有 `scope.file_types`，universal pack 必须没有。emit `{file, has_file_types}`。
3. **Matcher-aware pattern check**：把 `wrong_pattern` 喂进 `splitPatterns` 模拟逻辑，校验：(a) 切分后每个 token 长度 ≥3（matcher 会丢弃 <3 的 token），(b) 切分后非空（不会全军覆没回退到整体匹配），(c) 含 `|` 的 pattern 必须确实是 alternation（每段都 ≥3 字符且作者意图明确）。emit `{file, valid_token_count, dropped_short_tokens[], rules_with_no_valid_tokens[]}`。`.()[]*+?{}^$\\` 等 regex 元字符在本 matcher 里是字面子串，**不**算违规（与 universal.jsonl 已有的 `eval(`、`dangerouslySetInnerHTML` 等保持一致）。
4. **No cross-language false-trigger**：sub-agent 用一组合成代码片段（每语言 1 段，列在 `docs/plans/issue-89/judge-fixtures/`），跑 substring matcher，对每条 rule 检查是否只在自己 `file_types` 下命中。emit per-rule `{rule_id, expected_lang, fired_on_langs[]}`，列表只含 expected_lang 才 pass。
5. **Real-codebase sample**：sub-agent 在 ≥3 个真实开源 repo（每语言 ≥1）上跑 dry-run substring matcher，统计每条 rule 命中频次。命中 0 次的 rule 标 `dead-rule`，命中频次过高（>200/repo）的标 `noisy-rule`，二者列表都进 verdict。
6. **Final verdict aggregate**：main agent 写 `docs/plans/issue-89/judge-output/<run-id>/verdict.json`，schema 含 `pass/fail`、6 个步骤 metrics、dead-rule 列表、noisy-rule 列表。LLM judge 只读 verdict + raw JSON 决定是否 release。

Judge harness **不**评：

- 规则的"是否真的有用"——这是后续 calibration（ADR-0004）的事。
- 规则的中文文风——文风审在 PR review 阶段。
- 是否覆盖某语言的"关键 idiom"——必须穷举不可行；本 plan 接受 5–10 条只是 starter set。

## ④ Claudefast probes — BEFORE follow-up impl PR

1. **Probe-1：substring 命中真实代码**（`claudefast -p`，并行 5 路）
   - 每个 stack 一路：在该语言主流 OSS repo（freeCodeCamp / pandas / kubernetes / cobra / tokio）上跑候选 `wrong_pattern` 列表 dry-grep。
   - 通过条件：每条 rule 至少在 1 个测试 repo 命中 ≥1 次（否则候选规则换）。
2. **Probe-2：scope.file_types 反向校验**（`claudefast -p`）
   - 输入：5 份候选 jsonl 草稿。
   - 验证：每条 rule 的 `scope.file_types` 必须与 `wrong_pattern` 自然栖息地一致（例如 `var ` 不该出现在 python 包里）。
   - 通过条件：probe 输出 `mismatched_count=0`。
3. **Probe-3：universal vs stack 重复检查**（`claudefast -p`）
   - 输入：universal pack + 5 份候选。
   - 验证：候选条目不与 universal 重复（hash by `wrong_pattern`）。
   - 通过条件：probe 输出 `duplicate_count=0`。

最多 8 个 `-p` 并行，stream-json 留 audit。详 `docs/FASTPROBE.md`。

## After-PR — POSTPR loop

1. POSTPR loop 直到 Codex silent / 👍。
2. Issue #89 close with cite-back comment（ADR-0006）：plan 路径 + PR 链接 + 一句 "ready for impl PR; depends on existing universal.jsonl + #90 pack CLI"。
3. Follow-up impl PR 反向引用本 plan；不重开 #89。

## 风险与回滚

| 风险 | 缓解 | 回滚动作 |
|---|---|---|
| 新 pack 在 personal repo 上误触发率高 | Probe-1 + Probe-2 双重过滤；judge step 4 + 5 兜底 | 把 noisy rule 的 `enforcement` 从 `block` 降到 `warn`，或临时 `status=disabled` |
| Schema drift（未来 universal pack 升级）| 本 plan 锁定与当前 universal schema 一致；任何 schema 变更通过单独 PR 同步迁移 | 用 `seed/packs/migrate-<old>-to-<new>.ts` 一次性脚本批量迁移 |
| Calibration 后 confidence 大幅下调 | 是预期行为——ADR-0004 calibration 本来就该让低质规则降级 | 不回滚 plan；让规则在 tier 系统里自然降权 |
| `teamagent pack list` CLI 与 6 packs 接口不齐 | impl PR 跑 `pack list` 真实输出对照 expected output；不齐改 CLI 或改 pack | 短期把新 pack 标 `current_tier=stable+`（非 canonical）等 CLI 修齐 |

## Quick checklist (PR 描述粘贴)

- [ ] 5 个新 jsonl pack 都有 valid JSON 行、`scope.file_types`、`source=preset`、`current_tier=canonical`
- [ ] `seed/packs/README.md` 列出 6 个 pack（含 universal）
- [ ] `docs/features/stack-packs/run-judge.sh` exit 0
- [ ] `docs/PRODUCT-FEATURES.md` 增 6 行 VERIFIED
- [ ] `teamagent pack list` 显示 6 个 pack
- [ ] `pnpm test` 全绿、`pnpm typecheck` 全绿
- [ ] feature-verification 1+2+3 跑过
