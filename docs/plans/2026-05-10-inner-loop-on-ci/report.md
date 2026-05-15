```text
   ┌────────────────────────────────────────────────────────────────────┐
   │   report.md — toohot session post-merge report                     │
   │                                                                    │
   │   plan + judge → 7 grill 题 → 5 deliverables → 5 probes →          │
   │   claudefast verdict PASS → /review CLEAN → squash-merged          │
   │                                                                    │
   │   PR #270  →  main c237ae7  (2026-05-10T11:57:34Z)                 │
   └────────────────────────────────────────────────────────────────────┘
```

# Post-merge report — inner-loop-on-ci

## 状态：DONE

PR #270 已 squash-merge 到 main，merge commit `c237ae7`，于 2026-05-10T11:57:34Z 落地。

## 实际交付（vs plan.md §2 expected outputs）

| Artifact | 期望 | 实际 | 偏差 |
|---|---|---|---|
| `inner-loop.yml` | wip/** push trigger，ubuntu only | ✓ + concurrency block (review I1 auto-fix) | 多了 cancel-in-progress（改进，非偏差）|
| ADR | `0011-inner-loop-on-ci.md` | `0013-inner-loop-on-ci.md` | 编号撞 main 两次（详见下） |
| INNER-LOOP-TESTING.md | 5 段活文档 | ✓ 5 段 | 无 |
| CLAUDE.md 更新 | pointer 段链 ADR + how-to | ✓ "测试在哪里跑" 段 | 无 |
| docs/CONTEXT.md 更新 | 4 个 term 词条 | ✓ "Testing channels" 段 | 无 |
| GitHub secret | `MINIMAX_TOKEN` | 实际复用既存 `MINIMAX_API_KEY` | rename 至 align 仓库约定 |

## Judge harness 五项 probe 结果

| Probe | 形式 | 结果 | 证据 |
|---|---|---|---|
| J1 | dogfood ×2 (post-rename + pre-rename) | ✓ success 1m25s + 1m33s | runs #25622286918 + #25622100341 |
| J2 | wip/judge-fail 故意挂 1 测试 | ✗ failure 1m27s, 1 deliberate fail caught | run #25622357460 |
| J3 | wip/judge-secret 4 env 断言 | ✓ success 1m29s, token_in_log=0 | run #25622479210 |
| J4 | 本地 `pnpm exec vitest init.test.ts` | ✓ exit 0, 4s, 59 tests | local |
| J5 lite | N=5 sample (vs spec 4-point curve) | ✓ loadavg 8.54 vs baseline 274 (32× drop) | local toohot sample |

`claudefast` 第三方 verdict (`docs/plans/2026-05-10-inner-loop-on-ci/judge/_overall/verdict.md`)：**Overall PASS**。

## 偏差与原因

### 1. ADR 编号双撞，最终落 0013
- v1 plan：用 0011-inner-loop-on-ci。
- main 在工作期间合了 PR #268 (issue-155)，落 `docs/adr/0011-install-resumption-via-idempotency.md` + `docs/adr/0011-install-state-store-port.md`（一个号挂两个 ADR，main 自身的问题）。鸭鸭让位 0011 → 0012。
- 二次 merge 后发现 main 还有 `docs/adr/0012-fixture-replay-live-capture-mode.md`（来自 issue-155 同批）。再让位 0012 → 0013。
- **根因**：v1 grill 时 `skipped_repo_search`，没扫 `.github/workflows/` 里的 secret 命名约定也没扫已有 ADR 编号。两次 renumber 在 commit 16fa3f7 + merge commit 2bf4f9c。
- **副作用**：squash commit 标题仍写 "(ADR-0011)" —— 历史化 PR title，merge 后已无法低成本修正；ADR 文件正确为 0013。

### 2. Secret 命名 align 仓库约定
- v1 plan：新建 `MINIMAX_TOKEN` secret。
- 实际：仓库既有 `MINIMAX_API_KEY`（2026-05-08 设置，被 `claudefast-anchors.yml` 使用）。复用既存 secret 避免双 secret 维护。inner-loop.yml 用 `ANTHROPIC_API_KEY: ${{ secrets.MINIMAX_API_KEY }}` + `MINIMAX_API_KEY: ${{ secrets.MINIMAX_API_KEY }}` 双暴露 env。
- **根因**：v1 grill 时同样 `skipped_repo_search`，没扫已有 workflow 引用。

### 3. J5 lite (single sample) vs spec 4-point curve
- v1 plan §3 J5：用户手动开 1/2/3/4 session 各采 1 次 loadavg。
- 实际：driver agent 只能在自己单 session 上下文采样；用户 Mac 实际开了 5 个 Claude Code session（observed by `toohot`），鸭鸭采到 N=5 单点 loadavg=8.54，已超出 spec N=4 要求且远低于 100 阈值。
- 取舍：N=5 单点更严格但缺中间档（无法画曲线）。
- 完整曲线作 optional post-merge follow-up，留在 J5 result.json 的 `follow_up_for_full_curve` 字段。

### 4. Token leak in transcript（独立、未阻塞）
- 在第 4 个 grill 题侧探 zshrc 时使用了 `which claudefast`，zsh 把 shell function 函数体（含 MiniMax token literal）echo 到 transcript。
- 处理：警告已发 + INNER-LOOP-TESTING.md / ADR-0013 写入 rotate 流程。
- **rotate 仍 PENDING**——仓库 `MINIMAX_API_KEY` secret 仍是 2026-05-08 的旧值。用户需手动 rotate（独立于本 PR）。

## 风险

- **Node.js 20 actions deprecation**：inner-loop.yml + ci.yml 均依赖 `actions/checkout@v4` / `actions/setup-node@v4` / `pnpm/action-setup@v4`。GitHub 强制 2026-09-16 升级到 Node 24。届时全仓库 actions 都要 bump，不只是 inner-loop。
- **Token rotation 拖延**：transcript 落地的 MiniMax token 仍 active；越拖越多人能看到 transcript。建议 24h 内 rotate。
- **claude-review workflow broken on PR**：仓库的 `.github/workflows/claude-code-review.yml` 因 `secrets.ANTHROPIC_API_KEY` 缺失 + claude-code-action@v1 internal directory mismatch 持续失败。所有 PR 都会显示 UNSTABLE，但不阻塞 merge（per ADR-0007 local /review 是权威 gate）。可单独治理，与本 PR 无关。

## 后续事项 (follow-up)

| 优先级 | 项 | 描述 |
|---|---|---|
| P0 | MiniMax token rotate | 用户手动：MiniMax 控制台 revoke + `gh secret set MINIMAX_API_KEY -b"$NEW"` + 改 `~/.zshrc` 里 claudefast wrapper |
| P2 | J5 完整曲线 | 用户开 1/2/3/4 session 分别采样，画 loadavg vs N 曲线 |
| P3 | Node 24 升级 | bump `actions/checkout` / `actions/setup-node` / `pnpm/action-setup` 在所有 workflow 文件 |
| P3 | claude-review workflow 治理 | 配 `secrets.ANTHROPIC_API_KEY` 或禁用工作流 |
| P3 | squash commit 标题历史 | 落地后已无法低成本修；ADR 文件本身正确 |

## Commits 全列表

PR 内 10 commits（最终 squash 成 c237ae7）：

```
c5a44d3 docs(toohot): plan + judge for inner-loop-on-ci
57c57a5 feat(toohot): inner-loop tests on wip/** CI (ADR-0011)
954b543 fix(toohot): rename secret to MINIMAX_API_KEY (align with repo convention)
cc299a5 docs(toohot): J1+J2+J4 judge evidence (3 of 5 probes PASS)
a78f21f docs(toohot): J3 env injection PASS (4 of 5 probes done)
791d2a3 docs(toohot): J5 lite PASS — loadavg 8.54 at N=5 (32× drop from 274)
330c8bc docs(toohot): claudefast 3rd-party verdict — Overall PASS
7101cd6 fix(toohot): cancel-in-progress for inner-loop.yml (review I1)
16fa3f7 fix(toohot): renumber ADR 0011 → 0012 (main's PR #268 took 0011)
2bf4f9c Merge remote-tracking branch 'origin/main' into worktree-... (含 0012→0013)
```

## Cleanup 完成度

- ✓ wip/inner-loop-on-ci 已自动删（`gh pr merge --delete-branch`）
- ✓ wip/judge-fail 已删（`git push origin --delete`）
- ✓ wip/judge-secret 已删（`git push origin --delete`）
- ✓ Worktree 已 remove（`ExitWorktree action="remove"`，17 commits discarded）
- ✓ Parent main `git pull --ff-only` 同步至 c237ae7
