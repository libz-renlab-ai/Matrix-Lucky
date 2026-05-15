```text
plan.md
   │
   ├── 1. task description
   ├── 2. expected outputs
   ├── 3. third-party judge harness (md playbook)
   └── 4. duck (>ω<)
```

# Plan — Document `issues` user-level alias at TeamBrain project level

Date: 2026-05-09
Branch: `worktree-issues-alias`
Scope: docs-only meta change (no code touched). Direct PR by explicit user authorization, bypassing FIXEDFLOW issue→grill→label chain (noted in PR body as exception).

## 1. task description

**做什么**：在 TeamBrain 仓库的 `docs/` 下登记 user-level 的 `issues` zsh function，让本项目的 contributor / driver 在阅读 FIXEDFLOW 时可以追溯到这条 shell 工具的来源、机制、与 FIXEDFLOW claim 语义的落差，以及验证它在 user-level 仍可发现的 `claudefast` probe 程序。

**怎么做**：
- 写 `docs/issues-alias.md`：what + 项目相关性（FIXEDFLOW claim-an-issue）+ 已知落差 + claudefast probe（md-playbook 形式）。
- 同时在 user-level（`~/.claude/docs/rules/runtime/issues-alias.md` + INDEX + 根 `CLAUDE.md`）注册——已在前一轮完成，本 PR 不再修改 user-level。
- 落盘 probe transcript 到 `docs/plans/2026-05-09-issues-alias/probe.txt` 作为 evidence。

**不做什么**：
- 不修改 `~/.zshrc` 里的函数本体（它已经在 user level，工作正常）。
- 不在本 PR 内拓展函数行为（如 `-label:grill-ready` 过滤）；那是另一条 issue 的范围。
- 不通过 FIXEDFLOW issue→grill→label 流程开 PR；用户已显式授权直接 PR。
- 不用 fixed bash 脚本作为 judge harness。

## 2. expected outputs

| 交付物 | 路径 | 验收 |
|--------|------|------|
| 项目级 alias 文档 | `docs/issues-alias.md` | 文件存在，覆盖 what / project relevance / 落差 / probe 四段；< 200 行 |
| 计划文档 | `docs/plans/2026-05-09-issues-alias/plan.md` | 本文件本身；含三段铁律 |
| 完成报告 | `docs/plans/2026-05-09-issues-alias/report.md` | PR 开后落盘；含实际改动列表 + probe 结果 + /review 循环结果 |
| Probe evidence | `docs/plans/2026-05-09-issues-alias/probe.txt` | 2026-05-09 在 `cd ~` 跑 `claudefast -p "what is 'issues' alias?"` 的整段输出 |
| GitHub PR | `gh pr view <N>` | 普通 PR（非 draft），title `docs: register user-level 'issues' alias at project level`；body 引用本 plan + probe |
| Squash merge | `gh pr merge <N> --squash --delete-branch` | merge 完成、分支删除；只有 squash，不准 `--merge` / `--rebase` |
| Worktree 清理 | `ExitWorktree action="remove"` | 主 checkout `git pull --ff-only` 取得 squash commit |

## 3. third-party judge harness (md playbook, 不是 fixed bash)

判 PR 是否合格的不是这份 plan 的作者、不是写 doc 的 agent、也不是被测的 doc 自身——而是另一只 LLM 读 raw probe 输出 + raw `/review` 结果 + raw doc 内容做归纳。

### §V1 RUN — 跑哪些固定工具

1. **claudefast probe**（验证 user-level 可发现性）：
   ```bash
   cd ~ && claudefast -p "what is 'issues' alias?" 2>&1 | tee /tmp/issues-probe.txt
   ```
   注意：必须从 `$HOME` 跑而不是项目 cwd，避免项目 Stop hook 仅返回 self-report 块掩盖主体。
2. **doc 体积守卫**：
   ```bash
   wc -l docs/issues-alias.md
   wc -l docs/plans/2026-05-09-issues-alias/plan.md
   wc -l docs/plans/2026-05-09-issues-alias/report.md
   ```
   每个文件应 < 200 行（per `inside-project-edits` rule）。
3. **`/review` skill**（POSTPR 权威 gate，per ADR-0007）：用户在 worktree 内 invoke `/review`；finding loop 至 PASS。

### §V2 DUMP — 输出哪些 raw artifacts

| Artifact | 路径 | 内容 |
|----------|------|------|
| Probe transcript | `docs/plans/2026-05-09-issues-alias/probe.txt` | claudefast probe 整段输出 |
| Doc 行数 | inline 写在 `report.md` | 每个文件的 `wc -l` 数字 |
| `/review` finding | `report.md` 段落 | 每轮 finding 摘要 + 修复 commit hash |

不写 `judge.json` 或 fixed bash judge（违反 `docs/HOWTO-PLAN-PR.md` § 3b 硬规则）。

### §V3 READ — 谁判 PASS

另一只 LLM（人类邀请、或后续 `claudefast -p "judge probe.txt against plan.md anchors"` 形式）只读：
- `docs/plans/2026-05-09-issues-alias/probe.txt`
- `docs/issues-alias.md` 的"触发时机"对照锚点表
- `report.md` 的 `/review` 结果

按以下规则归纳 PASS / FAIL：

**Probe PASS 条件**（5/5 命中）：
1. `~/.zshrc:313` 的 zsh function（非字面 alias）
2. open & unassigned GitHub issues
3. 依赖 `gh` + git worktree
4. ASCII 鸭子主题
5. 空结果返回 0 不报错

**`/review` PASS 条件**：所有 finding 标记 resolved，最后一轮 `/review` 输出无新 finding。

**Doc 体积 PASS 条件**：所有新增 `*.md` < 200 行。

任意一项 FAIL → 回到 §V1 重跑，更新对应文档；不准让作者 / 被测物自评。

## 4. duck (>ω<)

呷呷~ 鸭鸭说鸭话讲一遍：

```
   __
__<(o )___    ┌──── 这只小鸭就是 `issues` 命令本鸭！
\__( ._> /    │ 它住在 ~/.zshrc:313，不是真 alias，是 zsh 函数。
   `----'    │ 跑一下就把当前仓库 open & 没人 assign 的 issue
              └ 用 ASCII 鸭子框框框出来；没活儿干就 呷呷~ 退出 0。
```

- **任务描述**：鸭鸭要在 TeamBrain 项目里写一个文件 `docs/issues-alias.md`，告诉 contributor 这只鸭是 user-level 的 zsh 函数，怎么用、为什么 FIXEDFLOW 关心它、它有什么对不齐的小毛病。鸭鸭**不**改 `~/.zshrc`，**不**走 FIXEDFLOW 的 issue→grill→label 链路（用户已直接授权）。
- **预期产出**：一个 ~100 行的 doc + plan.md + report.md + probe.txt + 一个普通（不 draft）的 GitHub PR + squash merge + worktree 清理。
- **第三方裁判**：鸭鸭**不**让自己评自己。要在 `cd ~` 跑 `claudefast -p` 把 probe 输出存到 `probe.txt`，然后请另一只 LLM 鸭子（`/review` skill 或独立 probe）只读 raw 文件去对照 5 个锚点；写 fixed bash 脚本自动 echo PASS/FAIL 是违规，鸭鸭不干。
- **(>ω<)**：鸭鸭懂啦——三件套合同（task / outputs / judge harness）齐全，不让作者自评，等 `/review` PASS 才 squash merge。
