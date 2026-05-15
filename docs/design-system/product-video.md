# TeamAgent 90 秒产品视频脚本与 Shot Plan

## Core Message

老员工的 Claude Code 犯过的错，新来的 Claude Code 不再犯。

视频采用 Case B: Terminal Native。主画面是深色终端执行室：Claude Code 会话、Codex 任务、`PreToolUse` 事件、`diff`、`judge.json` 与 `statusline` 同屏出现。不要使用 AI 头像、机器人、紫色渐变或抽象效率口号。

## 0-90s Timeline

| Time | 画面 | 字幕 | 终端内容 | Motion notes |
|---|---|---|---|---|
| 0-5s | 黑场进入双终端。左侧是老员工历史会话，右侧是新员工 Claude Code 刚接手同类任务。底部 `statusline` 仍为灰色。 | 老员工犯过的错 | `claude code` / `codex task start` | 光标闪烁，左右两屏同时启动，低频键盘声。 |
| 5-10s | 左侧历史会话出现红色失败行；右侧刚要执行相同步骤。`statusline` 亮起 TeamAgent 标识。 | 新来的不再犯 | `statusline: TeamAgent watching rules=56 risk=idle` | 右侧画面在 risky command 前轻微冻结，底栏从灰变青。 |
| 10-16s | 快切 1：agent 没读项目规则，准备改错文件。 | 规则没继承 | `Edit CLAUDE.md` | 红框标记错误目标文件，用户 correction 以一行评论出现。 |
| 16-22s | 快切 2：agent 声称测试通过，但没有证据目录。 | 没证据就别说通过 | `Looks good. Tests should pass.` | 文字被红色删除线划过，切到空的 `.judge/` 目录。 |
| 22-28s | 快切 3：错误 GitHub account 或错误 worktree 被使用。 | 环境错一次就够 | `gh pr create --repo liush2yuxjtu/...` | 命令停在回车前，红色 account 片段放大。 |
| 28-35s | 三个失败折叠成一条链：mistake -> capture -> rule。 | 错误变成团队记忆 | `capture transcript -> compile rule` | 失败片段收束为规则卡，红色转为青色。 |
| 35-42s | 规则卡近景：trigger、correct action、source。右侧显示 source transcript 行号。 | 先捕获，再成规则 | `rule: require judge evidence before claiming tests passed` | 规则卡从历史 transcript 滑入右栏，source 线条连接。 |
| 42-50s | 编译视图：规则进入 agent-readable context。`AGENTS.md` 和规则索引短暂露出。 | 规则进入运行时 | `teamagent compile --dry-run` | event timeline snap 到 `compile: ok`，青色状态落位。 |
| 50-58s | 关键镜头：新 agent 准备写文件或宣布测试结果，`PreToolUse` overlay 弹出。 | 执行前拦截 | `event: PreToolUse` | risky action 冻结，overlay 以 amber 边框覆盖命令行。 |
| 58-65s | overlay 展开：命中的规则、原因、正确路径。agent 改为先跑 judge harness。 | 不是提醒，是改道 | `decision: warn` / `next: RUN -> DUMP -> READ` | 命令从红色 ghost text 变为绿色 accepted command。 |
| 65-72s | RUN 阶段：固定工具开始执行。分屏显示 tests、typecheck、lint 或项目约定命令。 | 固定工具先跑 | `pnpm test` / `pnpm typecheck` | 日志逐行追加，噪声降透明，关键 exit code 高亮。 |
| 72-78s | DUMP 阶段：`.judge/<run_id>/judge.json` 写入，旁边保留 stdout/stderr 路径。 | 证据落盘 | `write .judge/run_042/judge.json` | JSON 面板从终端右侧展开，路径以青色闪一下。 |
| 78-84s | READ 阶段：LLM 只读取 raw judge JSON 与必要 evidence。状态从 amber 变 green。 | 只读证据再下结论 | `"exit_code": 0, "evidence_dir": ".judge/run_042"` | judge result transition，绿色 pass 只在证据出现后出现。 |
| 84-88s | Before/After 对照。左：旧回答“Tests should pass”。右：新回答引用 `judge.json`。底部 `statusline` 显示 remembered risk。 | 同一个错，不再重演 | `diff --check` / `statusline: helped=1 risk=remembered` | `diff` wipe 揭示修正，底栏计数 +1。 |
| 88-90s | TeamAgent wordmark 与安装命令。背景保留终端证据墙，不做营销卡片。 | 带着团队经验上岗 | `npm install -g github:libz-renlab-ai/TeamBrain#release` | 画面快速静止，最后一帧停在 install command。 |

## Narration Script

0-10s：老员工的 Claude Code 犯过的错，新来的 Claude Code 不应该再犯。

10-35s：团队真正损失的不是一次失败命令，而是同一个错误被不同 agent 重复执行：没读规则、没留证据、用错账号、改错工作树。

35-65s：TeamAgent 把这些纠正沉淀成运行时规则。规则带着来源、触发条件和正确动作，在 agent 执行工具前通过 `PreToolUse` 介入。

65-84s：它要求 agent 先 RUN 固定工具，再 DUMP `judge.json` 和原始 evidence，最后 READ 证据下结论。没有证据，就不能说通过。

84-90s：让你的 AI 员工，带着团队经验上岗。

## Terminal Content Blocks

Opening statusline:

```text
statusline: TeamAgent watching | rules=56 | helped=0 | risk=idle
```

PreToolUse event:

```json
{
  "event": "PreToolUse",
  "tool": "Edit",
  "rule": "do-not-claim-tests-passed-without-judge-evidence",
  "decision": "warn",
  "next": "RUN fixed tools, DUMP judge.json, READ evidence"
}
```

Judge evidence:

```json
{
  "exit_code": 0,
  "metrics": { "tests": "passed", "typecheck": "passed" },
  "evidence_dir": ".judge/run_042",
  "stdout_path": ".judge/run_042/stdout.log",
  "stderr_path": ".judge/run_042/stderr.log"
}
```

Diff proof:

```diff
- Looks good. Tests should pass.
+ Verified from .judge/run_042/judge.json: tests passed, typecheck passed.
```

Closing command:

```bash
npm install -g github:libz-renlab-ai/TeamBrain#release
teamagent init
```

## Production Checklist

- Use dark Terminal Native execution scenes for 80% of runtime.
- Show real evidence artifacts by name: `PreToolUse`, `judge.json`, `diff`, `statusline`.
- Keep Chinese captions under 12 characters when possible.
- Use red only for historical mistakes or active danger.
- Use amber for runtime pause or warning.
- Use teal for TeamAgent action.
- Use green only after evidence exists.
- Keep terminal text readable at mobile crop sizes.
- Avoid fake metrics; if a number is shown, label it as demo state or real evidence.
- Use monospace for commands, timestamps, event names, JSON, rule IDs, and status.
- Export one 16:9 master, one 1:1 crop, and one 9:16 crop.
- Capture a silent version where captions alone explain the story.

## Acceptance Criteria

- The 0-90s cut clearly follows: mistake -> capture -> compile rule -> enforce at runtime -> verify -> no repeat.
- The viewer can explain within one sentence that TeamAgent prevents repeated agent mistakes before tool execution.
- `PreToolUse` appears as a runtime pause before a risky action, not as a post-hoc report.
- `judge.json` appears before any "passed" or "verified" claim.
- A `diff` visibly shows the behavior changing from unsupported claim to evidence-backed conclusion.
- `statusline` shows remembered risk or helped count by the final proof beat.
- No shot depends on abstract AI imagery, robots, purple glow, or stock footage.
- Every claim maps to a terminal command, hook event, file path, diff, or report visible on screen.
- Final Markdown stays under 200 lines.
