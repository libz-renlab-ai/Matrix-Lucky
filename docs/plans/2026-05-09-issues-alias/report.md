```text
report.md
   │
   ├── 1. actual changes
   ├── 2. probe results (anchors hit)
   ├── 3. /review loop log
   └── 4. POSTPR (merge + cleanup) status
```

# Report — Document `issues` user-level alias at TeamBrain project level

Date: 2026-05-09
Plan: [plan.md](./plan.md)
Branch: `worktree-issues-alias`
PR: _filled in after `gh pr create`_

## 1. Actual changes

### User-level（已在前一轮完成，不在本 PR diff 内）

- 新增 `~/.claude/docs/rules/runtime/issues-alias.md`
- 修改 `~/.claude/docs/rules/runtime/INDEX.md`（加一行 `issues 函数` 表项）
- 修改 `~/.claude/CLAUDE.md`（运行时默认表 line 104 处加一行）

### Project-level（本 PR 实际 diff）

| 文件 | 操作 | 行数 |
|------|------|------|
| `docs/issues-alias.md` | 新增 | < 200 |
| `docs/plans/2026-05-09-issues-alias/plan.md` | 新增 | < 200 |
| `docs/plans/2026-05-09-issues-alias/report.md` | 新增（本文件） | < 200 |
| `docs/plans/2026-05-09-issues-alias/probe.txt` | 新增（probe evidence） | 8 |

## 2. Probe results

### Probe 1 — 项目 cwd（被项目 Stop hook 干扰，仅返回 self-report 块）

`/tmp/issues-probe-1.txt`：14 行，全部为 self-report 块（无主体内容）。**结论**：在项目 worktree 内跑 `claudefast` probe 不可靠，应切到 `$HOME`。已写入 `docs/issues-alias.md` 与 `plan.md` 的 §V1 RUN 段。

### Probe 2 — `cd ~` 干净环境

`docs/plans/2026-05-09-issues-alias/probe.txt`（8 行主体输出 + tee 副本）。

锚点对照：

| 锚点 | 命中 | 引用 probe 文本 |
|------|------|-----------------|
| `~/.zshrc:313` 的 zsh function（非字面 alias） | ✅ | "`~/.zshrc:313` 定义的一个 **zsh function**（不是字面 alias）" |
| open & unassigned GitHub issues | ✅ | "**open & unassigned** 的 GitHub issues" |
| 依赖 `gh` + git worktree | ✅ | "依赖 `gh`（GitHub CLI）+ git worktree" |
| ASCII 鸭子主题 | ✅ | "ASCII 鸭子主题输出" |
| 空结果返回 0 不报错 | ✅ | "空结果返回 0（不报错）" |

**5/5 PASS**。Probe 还自动引用了 `runtime/issues-alias.md` 路径，说明 user-level 索引被正确发现并跟随。

## 3. `/review` loop log

| 轮次 | 时间 | Finding 摘要 | 解决 commit |
|------|------|--------------|-------------|
| 1 | 2026-05-09 | Scope CLEAN；5/5 probe 锚点命中；user-level 三个引用点全在；唯一 INFORMATIONAL = 本表 placeholder 未填（自指） | 本 commit |

最终轮次：1  ·  最终结果：**PASS**

无 specialist subagent 派遣（纯 docs diff，testing / maintainability / security / performance / data-migration / api-contract / design / red-team 全部 N/A）。无 Codex 结构化 review（287 行总量，但实际 doc 内容 < 200 行 diff lines that warrant adversarial pass）。Fix-First 阶段 1 个 AUTO-FIX（本表填充）应用完成。

## 4. POSTPR status

- [ ] `gh pr merge <N> --squash --delete-branch`（squash-only，禁 `--merge` / `--rebase`）
- [ ] `ExitWorktree action="remove"`（如果 fall back，则 `keep` → `git worktree remove --force` → `git branch -D` → `git push origin --delete`）
- [ ] 父 checkout `git pull --ff-only`，确认 squash commit 落地

## 5. 偏差与风险

- **绕过 FIXEDFLOW**：本 PR 没走 issue→grill→label 链路，由用户直接授权。已在 PR body 标注例外。如果 conformance Action / linter 自动 close 非 FIXEDFLOW PR，需要人工 reopen 或加豁免 label。
- **probe 在项目内不可用**：未来若有人在项目 cwd 直接跑 `claudefast -p`，会被 Stop hook 干扰。已在 doc + plan §V1 写明必须 `cd ~`。

## 6. 后续事项

- `issues` 函数的 FIXEDFLOW 语义对齐（加 `-label:grill-ready` 过滤）是 follow-up issue 的范围；本 PR 不做。
- 若用户级 `~/.zshrc` 函数体未来重写，需要同步更新 user-level doc 与本 project doc 的"它做什么"段。
