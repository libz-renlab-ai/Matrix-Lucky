```text
                ┌──────────────────────────────────────┐
                │   §V1 RUN  →  §V2 DUMP  →  §V3 READ  │
                │      ↓            ↓            ↓     │
                │   fixed tools   judge.json    LLM    │
                │   exec stdout   evidence/    (read-  │
                │   stderr -> fs  per tool      only)  │
                └──────────────────────────────────────┘
```

# Judge harness for issue-146-f1

适用范围：`fix/issue-146-f1` 分支 / PR。**MD playbook，禁固定 bash 脚本**。MAIN agent 调度 subagents 或 `claudefast -p` 探针执行。

## §V1 RUN — fixed tools (one subagent / probe per tool)

| ID | Tool | Command (run from worktree root) | Pass criterion |
|----|------|----------------------------------|----------------|
| `t1.build` | digital-twin build produces bin-uploader.cjs | `pnpm --filter @teamagent/digital-twin build` then `test -s packages/digital-twin/dist/bin-uploader.cjs && head -1 packages/digital-twin/dist/bin-uploader.cjs` | exit 0 + file > 0 bytes + first line shebang or banner present |
| `t2.dt-test` | digital-twin vitest | `pnpm --filter @teamagent/digital-twin test` | exit 0, total tests > 100 |
| `t3.cli-test` | cli vitest (focused) | `pnpm --filter @teamagent/cli test -- bin-digital-twin-tap` | exit 0, all targeted tests pass |
| `t4.typecheck` | global typecheck | `pnpm typecheck` | exit 0 |
| `t5.daemon-smoke` | bin-uploader.cjs runs without MODULE_NOT_FOUND | `node packages/digital-twin/dist/bin-uploader.cjs ; echo "exit_code=$?"` | exit 2 (config missing) AND stderr does NOT contain "MODULE_NOT_FOUND" / "Cannot find module" / SyntaxError |

`t5.daemon-smoke` 是 F1 的核心证据——bin-uploader 必须能被 node 启动起来；exit 2 是设计内 "config missing or disabled" 信号（见 `bin-uploader.ts:37`），不是失败。

## §V2 DUMP — canonical JSON

每条 tool 跑完后写一行 JSON 到 `.judge/issue-146-f1/<run_id>/judge.json`（newline-delimited），并把对应 stdout / stderr 全文落盘 `.judge/issue-146-f1/<run_id>/evidence/<tool_id>.{stdout,stderr}.log`：

```json
{"tool":"t1.build","exit_code":0,"metrics":{"bin_uploader_size_bytes":12345,"shebang":"#!/usr/bin/env node"},"evidence_dir":".judge/issue-146-f1/<run_id>/evidence","stdout_path":"...t1.build.stdout.log","stderr_path":"...t1.build.stderr.log"}
{"tool":"t2.dt-test","exit_code":0,"metrics":{"tests_total":N,"tests_passed":N,"tests_failed":0},"evidence_dir":"...","stdout_path":"...","stderr_path":"..."}
{"tool":"t3.cli-test","exit_code":0,"metrics":{"tests_total":N,"tests_passed":N,"tests_failed":0},"evidence_dir":"...","stdout_path":"...","stderr_path":"..."}
{"tool":"t4.typecheck","exit_code":0,"metrics":{},"evidence_dir":"...","stdout_path":"...","stderr_path":"..."}
{"tool":"t5.daemon-smoke","exit_code":2,"metrics":{"module_not_found":false,"syntax_error":false,"exit_code_expected":2},"evidence_dir":"...","stdout_path":"...","stderr_path":"..."}
```

`<run_id>` = ISO timestamp `YYYY-MM-DDTHH-MM-SSZ`. `.judge/` 已 in `.gitignore` 或加入 PR contents 视情况。

## §V3 READ — LLM judge (third party)

调度一只独立 `claudefast -p` 探针，prompt 模板：

```
你是 issue-146-f1 的 third-party judge harness。
只读以下 raw evidence：
- judge.json (.judge/issue-146-f1/<run_id>/judge.json)
- 必要 evidence (.judge/issue-146-f1/<run_id>/evidence/*)

按下列 rubric 输出 verdict：

PASS conditions (全部满足):
  - t1.build:    exit_code == 0 AND bin_uploader_size_bytes > 0
  - t2.dt-test:  exit_code == 0 AND tests_failed == 0
  - t3.cli-test: exit_code == 0 AND tests_failed == 0
  - t4.typecheck: exit_code == 0
  - t5.daemon-smoke: exit_code == 2 AND module_not_found == false AND syntax_error == false

任意一条不满足 → FAIL，列具体 tool + reason + 下一步建议。

OUTPUT format（必须）:
  VERDICT: PASS | FAIL | UNCERTAIN
  REASON: <one-line>
  NEXT_STEP: <one-line, only if FAIL/UNCERTAIN>

不要让被测代码 / 本 PR 作者 / 执行 agent 自评。
```

## §V4 不允许的判定来源

- 写本计划的 agent 当裁判
- 执行 implementation 的 agent 当裁判
- `bin-uploader.cjs` 自己（被测代码自评）
- `/review` skill 内嵌的 self-judgement
- 仅看 vitest "all green" 不看其它工具

## §V5 失败回路

- VERDICT == FAIL → MAIN agent 修复对应 tool 报错，再次跑 §V1 → §V2 → §V3。每轮新建 `<run_id>` 目录，保留历史 evidence。
- VERDICT == UNCERTAIN → MAIN agent 决定是补 evidence 跑 §V3 二次、还是降级到 FAIL 进入修复循环。
- 跑到 PASS 才允许 push + open PR。
