```text
issues   (zsh function, ~/.zshrc:313)
   │
   ├── guard 1: gh CLI present
   ├── guard 2: cwd inside git worktree
   ├── guard 3: gh repo view → owner/repo resolvable
   │
   ├── gh issue list --state open --search "no:assignee" --limit 100
   │
   └── ASCII-duck render
            │
            ├── header : ┌── duck ── repo + pwd + ═×60
            ├── body   : ┌─ #N  title │ url │ labels │ opened (timeago)
            └── empty  : ╭ no open & unassigned issues  呷呷~ ╮  exit 0
```

# `issues` shell function — project-level reference

`issues` 是 user-level 的 zsh **function**（不是字面 alias），定义在 `~/.zshrc:313-355`。本文档解释为什么 TeamBrain 这个仓库的 docs 也要登记它，以及如何用 `claudefast` probe 验证它在 user-level 的可发现性。

## 为什么 TeamBrain 关心一条 user-level alias

TeamBrain 的唯一 issue→PR→merge 工作流写在 `docs/FIXEDFLOW.md`。FIXEDFLOW 的「Claim an issue — what happens (2-outcome contract)」段落要求 driver / 人类先看到 `issue 是否齐备 grill comment + grill-ready label`。在 driver 侧通常用 `gh` CLI 翻；但在**人类 reporter / maintainer 侧**，反复敲长命令既慢又容易漏掉 `--state open --search "no:assignee"` 这类参数。

`issues` 函数把这条命令的标准形态固化成一个本地命令：

```bash
issues
```

输出当前仓库 **open & unassigned** 的 issues。这个集合是 FIXEDFLOW 「未 claim」的最便宜近似（见下方落差段）。

## 它做什么（机制速查）

| 阶段 | 行为 | 失败时 |
|------|------|--------|
| 守卫 1 | `command -v gh` | `gh CLI not found (brew install gh)`，返回 1 |
| 守卫 2 | `git rev-parse --is-inside-work-tree` | `<pwd> is not inside a git repo`，返回 1 |
| 守卫 3 | `gh repo view --json nameWithOwner -q .nameWithOwner` | `cannot resolve GitHub repo for <pwd>`，返回 1 |
| 拉取 | `gh issue list --repo $repo --state open --search "no:assignee" --limit 100 --json number,title,labels,createdAt,url --template '...'` | 静默 |
| 渲染 | ASCII 鸭子 header + 每条 issue `┌─ #N title / url / labels / opened` 框 | empty → `no open & unassigned issues` 框，**返回 0**（成功，不是错） |

源码：`~/.zshrc:313-355`。`type issues` 在 Claude Code 启动后会显示来源 `~/.claude/shell-snapshots/snapshot-zsh-*.sh`，但权威源头始终是 `~/.zshrc`。

## 已知落差（与 FIXEDFLOW 的语义不完全对齐）

- `~/.zshrc:311` 注释写 `Requires gh + jq`，但函数体**没用 jq**（全靠 `gh --template`）。注释过时但不影响运行。
- `--limit 100` 写死，未暴露 flag。
- `--search "no:assignee"` 表达 GitHub 的「未 assignee」，**不是** FIXEDFLOW 的「未 claim」。FIXEDFLOW claim 的真信号是 `grill-ready` label + 一条带 `--- end grill ---` 结尾的 grill 评论，与 GitHub assignee 字段独立。所以 `issues` 列出的"未 assignee"在严格 FIXEDFLOW 语义下可能：
  - **多列**：被 reporter 自己 claim（贴了 grill 评论 + label）但没改 assignee 字段的 issue；
  - **少列**：被随手 assign 给某人（占座）但没贴 grill 评论的 issue（FIXEDFLOW 视角下还属于"待 claim"）。
- 想严格按 FIXEDFLOW 语义查"未 claim"，应当再加 `-label:grill-ready` 过滤；目前函数没这么做。

## 如何验证 user-level 文档可发现性（claudefast probe）

权威 user-level 文档：`~/.claude/docs/rules/runtime/issues-alias.md`，索引登记在 `~/.claude/docs/rules/runtime/INDEX.md` 与 `~/.claude/CLAUDE.md` 运行时默认表。

### Probe（md-playbook 形式，不是 fixed bash 脚本）

**§V1 RUN**（在 `cd ~` 而不是项目 cwd 下跑，避开项目级 Stop hook 干扰）：

```bash
cd ~ && claudefast -p "what is 'issues' alias?" 2>&1 | tee /tmp/issues-probe.txt
```

**§V2 DUMP**：probe 输出整段保存为 `/tmp/issues-probe.txt`（本 PR 同时落盘到 `docs/plans/2026-05-09-issues-alias/probe.txt`）。

**§V3 READ — 由独立 LLM 只读 probe 输出与本文档"触发时机"对照**，按下表打分：

| 锚点 | 期望命中 |
|------|----------|
| `~/.zshrc:313` 的 zsh function（非字面 alias） | 文本含 `function`/`函数` 且非 `alias` |
| open & unassigned GitHub issues | 文本同时含 `open` + `unassigned`/`未 assignee`/`未指派` |
| 依赖 `gh` + git worktree | 文本含 `gh` 且含 `git`/`worktree`/`仓库` |
| ASCII 鸭子主题 | 文本含 `ASCII` + `鸭`/`duck` |
| 空结果返回 0 不报错 | 文本含 `0`/`成功` 且关联到「空」/`empty`/`没有` |

5/5 命中视为 PASS。任何锚点缺失则 update user-level 文档 `~/.claude/docs/rules/runtime/issues-alias.md` 的"触发时机"段直到下一次 probe PASS。

**禁止形式**：写一段 fixed bash 脚本去 grep 上述锚点然后 echo PASS/FAIL；这样让被测物自评，违反 `docs/HOWTO-PLAN-PR.md` § 3b 的"third-party judge harness forbidden fixed scripts"硬规则。Judge 必须是另一只 LLM 读 raw probe 输出做归纳。

### 本 PR 已落盘的 probe transcript

`docs/plans/2026-05-09-issues-alias/probe.txt` — 2026-05-09 跑的 probe 全文，5/5 锚点命中，无需进一步 fix。

## 相关入口

- 用户级权威：`~/.claude/docs/rules/runtime/issues-alias.md`
- 用户级索引：`~/.claude/docs/rules/runtime/INDEX.md`、`~/.claude/CLAUDE.md` 运行时默认表
- 项目工作流：`docs/FIXEDFLOW.md` § Claim an issue — what happens (2-outcome contract)
- 本 PR plan / report：`docs/plans/2026-05-09-issues-alias/plan.md` / `report.md`
