# 2026-05-06 user-collect report

## 结果

- run_id: `20260506T075204Z-user-collect`
- sandbox: `/tmp/teamagent-user-collect-1778053924`
- judge: `.judge/20260506T075204Z-user-collect/judge.json`
- verdict: `PASS`

## 实际交付

| 产物 | 状态 | 证据 |
|---|---|---|
| V1 user/dev raw collect | PASS | `/tmp/teamagent-user-collect-1778053924/raw/*.jsonl` |
| V2 handout JSON | PASS | `/tmp/teamagent-user-collect-1778053924/v2-handout.json` |
| V3 interactive `/export` | PASS | `/tmp/teamagent-user-collect-1778053924/v3-export.txt` |
| V3 pane evidence | PASS | `/tmp/teamagent-user-collect-1778053924/v3-pane.txt` |
| V4 third-party judge | PASS | `.judge/20260506T075204Z-user-collect/judge.json` |

## usage 数据

- `total_files = 6`
- `usage_rollup.total_events = 156`
- `usage_rollup.assistant_messages = 9`
- 每个 mock user 都覆盖了 `read_csv` / `select_columns` / `groupby`
- `dev_read_user_raw = true`，真实 inter-communication 通过 `dev -> user raw transcript` 实现

## 实际修正

- V1 从“失败只记 WARN”改成“任一路失败直接中止”
- V1 改成 `user -> dev` 两阶段，dev 显式读取对应 `user*.jsonl`
- V2/V4 加了隔离 `CLAUDE_CONFIG_DIR` / `CODEX_HOME` / `HOME`
- V3 修掉了 prompt 被 variadic flag 吃掉的问题，改为 stdin 喂给 `claudefast -p`
- V3 处理了首次启动的多个 gate：theme、API key、security notes、workspace trust、MCP、external CLAUDE import
- V3 改成“先打字，等待 1s，再按 Enter”，避免 prompt 和 `/export` 只停留在输入框
- V4 改成在 `evidence-snapshot/` cwd 中只读固定文件，且由脚本回填 deterministic metrics

## judge 摘要

```json
{
  "exit_code": 0,
  "verdict": "PASS",
  "metrics": {
    "v1": { "user_count": 3, "instances": 6, "raw_files_present": true, "stream_json_events_min": 25 },
    "v2": { "handout_json_valid": true, "per_user_keys_ok": true },
    "v3": { "export_txt_present": true, "export_bytes": 1460 },
    "judge_view_only": true,
    "user_level_isolation": true
  }
}
```

## PR body 附件清单

- 本地 raw evidence：`/tmp/teamagent-user-collect-1778053924/raw/`
- 本地 V2/V3 evidence：`/tmp/teamagent-user-collect-1778053924/v2-handout.json`、`/tmp/teamagent-user-collect-1778053924/v3-export.txt`、`/tmp/teamagent-user-collect-1778053924/v3-pane.txt`
- 本地 judge snapshot：`.judge/20260506T075204Z-user-collect/evidence-snapshot/`
- 本地 judge verdict：`.judge/20260506T075204Z-user-collect/judge.json`

## 偏差

- 任务要求里的 `spawn multiple (3~6) subagent` 已满足为 3 个只读子审计 agent；实际执行 harness 仍由主线脚本串起，因为 claudefast/tmux 交互阶段需要共享同一 sandbox 与同一 evidence 路径。
- 原任务写了 `commit, push, pr, @libz`，这部分在本报告生成后继续执行。
