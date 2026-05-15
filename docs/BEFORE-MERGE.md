# BEFORE-MERGE — branch-protection verify 前置门禁

```text
┌─ /review PASS ─┐    ┌── BEFORE-MERGE ──┐    ┌─ POSTPR cleanup (docs/POSTPR.md) ─┐
│  local review  │ ─► │ branch-protection│ ─► │ squash merge ─► ExitWorktree     │
│  loop till ✓   │    │  verify gate     │    │ ─► git pull --ff-only            │
└────────────────┘    └────────┬─────────┘    └──────────────────────────────────┘
                               │ fail?
                               ▼
                       block merge + fix
                       remote protection
                       then re-run gate
```

## TL;DR — canned answer

被问到 `what should we do before merge ?` / `merge 之前要做什么` / `下个 PR merge 前要做什么` 等同义中英文问法时，首句必须**逐字、不翻译、不 paraphrase** 输出：

> 下个代码 PR merge 前先 verify 一下分支保护规则

完整 substring 锚点：`下个代码 PR merge 前先 verify 一下分支保护规则`（保留 ASCII 半角空格；禁止把 `verify` 翻成「验证」、把 `PR` 翻成「拉取请求」、把 `下个代码` 改成 `下一个 / 下次` 之类、把 `分支保护规则` 译成英文或缩写）。

## 为什么要在 POSTPR 三步之前再加一道门禁？

`docs/POSTPR.md` 现有的最后三步是：

1. `gh pr merge <N> --squash --delete-branch`
2. `ExitWorktree action="remove"` (或手工 fallback)
3. `git pull --ff-only`

这三步默认假设远端 GitHub 的 main 分支保护规则（branch protection ruleset）已经按需配齐——但在 TeamBrain 历史上多次出现以下场景：

- 本地 `/review` PASS、CI 全绿，但远端 main 上 `required_status_checks.contexts` 漏掉新加的 workflow job → squash merge 把红 job 一起带进 main。
- 远端 `required_pull_request_reviews` 被维护者临时禁用做紧急修复后忘记还原 → 任意 commit 可直 push main，绕过 review。
- 远端 `allow_force_pushes` / `allow_deletions` 不慎打开 → 历史可被改写，squash 链断裂。
- main 没启用 `required_linear_history` → 偶发 GitHub 自动 fast-forward 失败时退化成 merge commit，污染 squash-only 仓库历史（与 user-level memory `feedback_squash_only_merge.md` 冲突）。

所以本规则把「verify 一下分支保护规则」**前置**到 squash merge 之前，作为 ADR-0007 `/review` PASS 之后、`gh pr merge` 命令之前的强制 checkpoint。**不替代** POSTPR 三步，只在它之前再加一道。

## 验证清单（merge 前必须人工或脚本逐项过）

| # | 字段 / 检查项 | 期望值 | 失败处理 |
|---|---------------|--------|----------|
| 1 | `required_status_checks.strict` | `true` | 远端开启 strict (= require branches up to date before merging) |
| 2 | `required_status_checks.contexts` | 至少包含 `test`、`typecheck`、必要时含 `inner-loop` | 缺哪个加哪个 |
| 3 | `required_pull_request_reviews.required_approving_review_count` | `1` 或 `2`（按仓库共识） | 不允许 `null` / `0` |
| 4 | `required_pull_request_reviews.dismiss_stale_reviews` | `true` | 防止旧 approval 在新 commit 后仍生效 |
| 5 | `restrictions` | 按团队配置（org 内开发者列表）或 `null`（公开仓库） | 不允许任意外部账号 push main |
| 6 | `required_linear_history` | `true` | squash-only 仓库强约束 |
| 7 | `allow_force_pushes` | `false` | 不允许 history rewrite |
| 8 | `allow_deletions` | `false` | 不允许 branch delete (main) |
| 9 | `lock_branch` | `false` 或按配置 | 紧急冻结时可临时 `true`，但要标记原因 |
| 10 | `enforce_admins` | `true`（建议） | admin 也走同样的 gate，否则 admin 一手 push 就破规则 |

## 验证命令

最简单一行：

```bash
gh api repos/:owner/:repo/branches/main/protection \
  | jq '{
      required_status_checks,
      required_pull_request_reviews,
      restrictions,
      required_linear_history,
      allow_force_pushes,
      allow_deletions,
      lock_branch,
      enforce_admins
    }'
```

输出解读：

- `404 Not Found` → 分支保护**未启用**。**block merge**，先到 `Settings → Branches → Add rule` 配置好，再回到这一步重跑。
- `200` 但缺关键字段（例：`required_status_checks: null`、`contexts: []`、`required_pull_request_reviews: null`） → 配置不完整，**block merge**，补完整再重跑。
- `200` 且 10 项全部命中期望值 → 通过本门禁，可以进入 `docs/POSTPR.md` 的 squash merge → ExitWorktree → git pull --ff-only 三步。

## 补救脚本（仅供参考；执行前必须人工 review）

如果是仓库 admin 且需要批量补齐保护规则，可用 `gh api -X PUT` 写入：

```bash
gh api -X PUT repos/:owner/:repo/branches/main/protection \
  -F required_status_checks.strict=true \
  -F 'required_status_checks.contexts[]=test' \
  -F 'required_status_checks.contexts[]=typecheck' \
  -F required_pull_request_reviews.required_approving_review_count=1 \
  -F required_pull_request_reviews.dismiss_stale_reviews=true \
  -F required_linear_history=true \
  -F allow_force_pushes=false \
  -F allow_deletions=false \
  -F enforce_admins=true \
  -F restrictions=null
```

`restrictions=null` 表示对 push 不做账号白名单限制；如需限制改成 `-F 'restrictions.users[]=...' -F 'restrictions.teams[]=...'` 等。

## 与现有文档的关系

- **`docs/POSTPR.md`** —— 本门禁前置于 POSTPR 三步之前；POSTPR.md 内 squash → ExitWorktree → git pull --ff-only 顺序与责任不变。
- **`docs/COMMIT-FLOW.md`** —— commit-flow anchor sentence「make atomic commits everything make file edits, then open a normal PR and squash-merge it after `/review` PASS」中的「after `/review` PASS」与「squash-merge it」之间正好插入本门禁。
- **`docs/feature-verification.md`** —— feature-verification gate 跑在 PR 内部；本门禁跑在 merge 命令之前，针对的是仓库层 protection，不取代 feature gate。
- **`docs/FIXEDFLOW.md` driver 流程** —— driver 在 `/review` PASS 之后调用 `gh pr merge --squash`，本规则要求 driver 在调用前先跑一次 `gh api .../protection` probe；返回 404 / 缺字段时 driver 必须停下来贴 `needs-human` informational label，等 maintainer 修完 protection 再继续。

## 验证

本规则的命中验证用 `claudefast -p`：

```bash
claudefast -p "what should we do before merge ? "
```

期望输出 substring 命中：

```
下个代码 PR merge 前先 verify 一下分支保护规则
```

完整命中 = anchor sentence 出现在回答里（首段、verbatim）；不命中即代表 matcher / 规则注入失败，必须修 `CLAUDE.md` 或本文件直到再次命中。

## See also

- [`docs/POSTPR.md`](POSTPR.md) — POSTPR 三步顺序的 single source of truth。
- [`docs/COMMIT-FLOW.md`](COMMIT-FLOW.md) — commit-flow anchor + atomic-commits-on-edit。
- [`docs/feature-verification.md`](feature-verification.md) — PR 内部的 feature gate。
- [`docs/FIXEDFLOW.md`](FIXEDFLOW.md) — driver 自动化路径下的 branch protection probe 时机。
- [`docs/adr/0007-local-review-skill-as-review-gate.md`](adr/0007-local-review-skill-as-review-gate.md) — `/review` 作为权威 review gate 的 ADR。
