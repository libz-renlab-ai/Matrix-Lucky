# Bug Report Support Bundle Plan

日期：2026-04-29

## 背景

用户在 macOS 首次安装 TeamAgent 后，可能看到 Claude Code 的非阻塞 hook 报错，例如：

```text
UserPromptSubmit hook error
Failed with non-blocking status code:
node:internal/modules/cjs/loader:1386
```

这类问题通常需要同时查看系统环境、Node/Claude/TeamAgent 版本、hook 注册内容和 TeamAgent 原始日志。让用户手动收集这些信息太慢，也容易遗漏关键上下文。

## 我想做什么

新增一个用户可直接运行的诊断命令：

```bash
teamagent bug-report
```

它在本地生成一个可附到 issue 或发给维护者的 Markdown 报告，默认路径为：

```text
~/.teamagent/bug-reports/teamagent-bug-report-<timestamp>.md
```

命令也应支持：

```bash
teamagent bug-report --out <path>
teamagent bug-report --stdout
```

## 报告应包含

- 系统信息：platform、arch、OS 版本、CPU 数量、内存、shell、当前目录、`TEAMAGENT_HOME`
- 工具版本：Node、npm、pnpm、Claude Code、TeamAgent
- 安装状态：用户级 Claude settings、项目级 Claude settings、项目 knowledge db、update state、auto-update disabled marker
- Hook 注册内容：User / project settings 中的 hook event、timeout、command、matcher
- 原始日志：`~/.teamagent/update.log`、`~/.teamagent/update-state.json`、项目 `.teamagent/events.jsonl`、项目 `.teamagent/config.json`
- 自动脱敏：常见 token、secret、API key、Authorization Bearer 值

## 预期终端输出

默认写文件：

```text
Bug report written: /Users/<user>/.teamagent/bug-reports/teamagent-bug-report-20260429T103000Z.md
Attach this file when reporting first-install or hook failures.
```

直接打印：

```bash
teamagent bug-report --stdout
```

预期 Markdown 结构：

```md
# TeamAgent Bug Report

Generated: 2026-04-29T10:30:00.000Z

## Summary

- What happened:
- What you expected:
- Steps to reproduce:

## System

## Tool Versions

## Install State

## Hook Commands

## Raw Logs

## Notes
```

## 第三方 Harness

第三方测试者可以用隔离的 `HOME` 和 `TEAMAGENT_HOME` 验证，不触碰真实用户环境：

```bash
#!/usr/bin/env bash
set -euo pipefail

TMP="$(mktemp -d)"
export HOME="$TMP/home"
export TEAMAGENT_HOME="$HOME/.teamagent"

mkdir -p "$TEAMAGENT_HOME" "$HOME/.claude" "$TMP/project/.teamagent"
cd "$TMP/project"

cat > "$TEAMAGENT_HOME/update.log" <<'LOG'
install failed
GITHUB_TOKEN=ghp_should_be_redacted_1234567890
Authorization: Bearer sk-ant-api03-secret
LOG

cat > .teamagent/events.jsonl <<'LOG'
{"event":"hook_error","message":"Cannot find module rss-parser"}
LOG

teamagent bug-report --out "$TMP/report.md"

test -f "$TMP/report.md"
grep -q "# TeamAgent Bug Report" "$TMP/report.md"
grep -q "## System" "$TMP/report.md"
grep -q "## Tool Versions" "$TMP/report.md"
grep -q "## Raw Logs" "$TMP/report.md"
grep -q "Cannot find module rss-parser" "$TMP/report.md"
grep -q "\\[redacted\\]" "$TMP/report.md"

if grep -q "sk-ant-api03-secret" "$TMP/report.md"; then
  echo "FAILED: secret leaked"
  exit 1
fi

echo "PASS: bug-report harness"
echo "$TMP/report.md"
```

## 验收标准

- `teamagent bug-report` 能生成默认路径报告
- `--out` 能写入指定路径
- `--stdout` 能直接打印报告
- 报告包含系统信息、工具版本、hook 配置和原始日志
- 报告会脱敏常见 secret
- 命令不上传网络，只在本地写文件或打印 stdout
- 首装 hook 失败用户可以直接把报告附到 issue

## 小鸭结论

用户遇到首装 hook 报错时，不应该被要求自己找日志、截屏、描述环境。小鸭只需要让用户运行一个命令，报告就会把维护者需要的上下文打包好，并且先做本地脱敏。
