```text
        WORKTREE_TASK.md
              │
   ┌──────────┼──────────┐
   │          │          │
 sandbox   pandas      4-级
 (3 user)  mock task  verify
   │          │          │
   └──────────┼──────────┘
              ▼
   ┌──────────────────────┐
   │ V1 raw  (user+dev)   │  ──► /tmp/.../raw/*.jsonl
   ├──────────────────────┤
   │ V2 structured handout│  ──► /tmp/.../v2-handout.json
   ├──────────────────────┤
   │ V3 e2e + /export     │  ──► /tmp/.../v3-export.txt
   ├──────────────────────┤
   │ V4 judge (3rd party) │  ──► .judge/<run>/judge.json
   └──────────────────────┘
              │
              ▼
       PR body attachments
              │
            @libz
```

# 2026-05-06 user-collect plan

> 文档级别：plan。配套 `2026-05-06-user-collect-report.md` 在执行结束后写。
> 行数预算：< 200 行。每段铁律不可省。

---

## 1. Task description（做什么 / 怎么做 / 不做什么）

**目标**：用 sandbox 隔离的 3 个 mock 用户跑「学 Python pandas」会话，端到端跑通 `claudefast` 多实例采集 → 结构化解析 → e2e 交互 export → 第三方 LLM judge 闭环；产物全部落到 sandbox 与 `.judge/<run>/`，最终作为 attachment 附到 PR body。

**怎么做**：

- **Sandbox**：`/tmp/teamagent-user-collect-<epoch>/{user1,user2,user3}/{claude-config,codex-home,home}`，复用 `scripts/dogfood-shim.sh` 的 env 隔离思路（`CLAUDE_CONFIG_DIR` / `CODEX_HOME` / `HOME` 三连改写）。
- **Mock 任务**：固定 prompt — `请帮我学 Python pandas，演示 read_csv / dataframe 选列 / groupby 三个最小例子`。
- **V1 raw collect**：先并发跑 3 路 user `claudefast -p --output-format stream-json ...`，再跑 3 路 dev；dev prompt 必须读取对应 user 的 raw transcript，形成真实 inter-communication。总实例数仍为 3×2 = 6，但按 user→dev 两阶段执行；总并发 ≤ 8。
- **V2 structured verifier**：用 repo-owned `claudefast` 跑开发者侧 verifier，但通过隔离 `CLAUDE_CONFIG_DIR` / `CODEX_HOME` / `HOME` 只读 `$SANDBOX/raw/*`，输出 handout JSON。
- **V3 e2e interactive**：tmux 自动化跑 1 个 interactive `claudefast`，prompt 必须覆盖 `read_csv` / 选列 / `groupby` 三例；完成后 `/export` 落盘到 sandbox `.txt`，并保留 pane scrollback。
- **V4 judge**：第三方 `claudefast -p` 在隔离 cwd 里只读 `evidence-snapshot/`，限制为 `Read` tool，写 `.judge/<run>/judge.json`。被测 ≠ 评判，符合 user-level CLAUDE.md testing-judge-harness 铁律。
- **执行编排**：主 agent 不下场；spawn 3~6 个 opus1M subagent（或 agent team）分担 V1/V2/V3/V4 + collector。`claudefast` 全局并发 ≤ 16。

**不做**：

- 不在主 agent 里直接跑业务逻辑。
- 不把 user-level `~/.claude/skills/`、`~/.claude/plugins/`、`~/.claude/projects/*/memory/` 带进 sandbox。
- 不把 sandbox 中间产物 git push 到 repo；只走 PR body attachment。
- 不开 draft PR；不 force push；不在 main 直接修；不 `git reset --hard`。
- 不用 `--bare`；不用 `--include-hook-events`（非 canonical）。
- 不让被测会话自己评自己。

---

## 2. Expected outputs（可验收交付物清单）

| # | Path | 说明 | 验收 |
|---|------|------|------|
| 1 | `docs/plans/2026-05-06-user-collect-plan.md` | 本文件 | 含 ASCII art + 三段，行数 < 200 |
| 2 | `docs/plans/2026-05-06-user-collect-report.md` | 执行复盘 | 列实际偏差、judge verdict、attachment 清单 |
| 3 | `scripts/user-collect/run-v1.sh` | V1 dispatcher | 跑 6 路 claudefast，落 raw |
| 4 | `scripts/user-collect/run-v2.sh` | V2 structured verifier | 输出 v2-handout.json |
| 5 | `scripts/user-collect/run-v3.sh` | V3 tmux e2e + /export | 输出 v3-export.txt |
| 6 | `scripts/user-collect/run-v4-judge.sh` | V4 judge harness | 输出 judge.json |
| 7 | `/tmp/teamagent-user-collect-<epoch>/raw/{user1..3}-{user,dev}.{jsonl,debug.log,stderr.log,help.txt}` | V1 raw | 6 份 jsonl 每份 ≥ 1 stream-json event；debug / stderr / help 同步保留 |
| 8 | `/tmp/teamagent-user-collect-<epoch>/v2-handout.json` | V2 structured | 含 per-user metrics |
| 9 | `/tmp/teamagent-user-collect-<epoch>/v3-export.txt` | V3 export | 非空，含三类 pandas 例子 |
| 10 | `/tmp/teamagent-user-collect-<epoch>/v3-pane.txt` | V3 pane evidence | 保留 `/export` 前后的交互滚屏 |
| 11 | `.judge/<run_id>/judge.json` | V4 verdict | 含 `exit_code` / `metrics` / `evidence_dir` / `stdout_path` / `verdict` |
| 12 | PR body | 普通 PR（非 draft）+ 全部 attachment | `@libz` review；feature verification 1+2+3 写进 PR body |

---

## 3. Third-party judge harness（一堆 JSON + LLM 裁判）

**Run（固定工具）**：

```bash
SANDBOX="/tmp/teamagent-user-collect-$(date +%s)"
RUN_ID="$(date -u +%Y%m%dT%H%M%SZ)"
EVIDENCE="$SANDBOX"
JUDGE_DIR=".judge/$RUN_ID"
mkdir -p "$JUDGE_DIR"

# 1) V1 raw collect (先 user 再 dev，≤ 8 并发)
bash scripts/user-collect/run-v1.sh "$SANDBOX" 2>&1 | tee "$JUDGE_DIR/v1.stdout"
# 2) V2 structured handout
bash scripts/user-collect/run-v2.sh "$SANDBOX" 2>&1 | tee "$JUDGE_DIR/v2.stdout"
# 3) V3 e2e + /export
bash scripts/user-collect/run-v3.sh "$SANDBOX" 2>&1 | tee "$JUDGE_DIR/v3.stdout"
# 4) V4 LLM judge（cwd 锁本 repo，禁 user-level skill）
bash scripts/user-collect/run-v4-judge.sh "$SANDBOX" "$JUDGE_DIR"
```

**Dump（一堆 JSON）** — 每步都写 raw stdout/stderr + stream-json + hooks debug log；任何缺失 evidence 直接 FAIL。最终 `judge.json` schema：

```json
{
  "exit_code": 0,
  "run_id": "<RUN_ID>",
  "evidence_dir": "/tmp/teamagent-user-collect-<epoch>",
  "stdout_path": ".judge/<RUN_ID>/v{1,2,3,4}.stdout",
  "metrics": {
    "v1": { "user_count": 3, "instances": 6, "raw_files_present": true, "stream_json_events_min": 1, "dev_read_user_raw": true },
    "v2": { "handout_json_valid": true, "per_user_keys": ["turns","tools","pandas_examples_seen"] },
    "v3": { "export_txt_present": true, "export_bytes_min": 100 },
    "judge_view_only": true,
    "user_level_isolation": true
  },
  "verdict": "PASS|FAIL",
  "notes": "..."
}
```

**Read（LLM judge）** — V4 由独立 `claudefast -p` 在隔离 cwd 跑，只 `--add-dir evidence-snapshot/` 且只开 `Read` tool，prompt 固定为：

```text
你是第三方 judge。只读 EVIDENCE_DIR 下的 raw JSON 与 .stdout 文件。
不得凭感觉判断；不得读 plan.md。给出 PASS/FAIL + 一句根因。
返回纯 JSON，schema 同上。
```

**禁止**：plan 作者、执行 subagent、被测代码自己写 verdict；judge 实例不得读 plan.md；不得复用 V1/V2/V3 的 sandbox env。

---

## 4. Agent teams 编排

| Team member | 职责 | 并发约束 |
|-------------|------|----------|
| `lead`（本 agent） | 编排、TaskUpdate、commit/push/PR、不下场 | — |
| `agent-A` (opus1M) | 写脚本 V1/V2/V3/V4 + sandbox 骨架 | 1 |
| `agent-B` (opus1M) | 跑 V1 dispatch（6 路 claudefast） | claudefast ≤ 8 |
| `agent-C` (opus1M) | 跑 V2 + V3 | claudefast ≤ 4 |
| `agent-D` (opus1M) | 跑 V4 judge + 写 report.md | claudefast ≤ 2 |

总 `claudefast` 全局并发 ≤ 16（user-level CLAUDE.md 元约束 + WORKTREE_TASK.md 第 14 行）。

---

## 5. 执行 gate

- **进入条件**：plan.md 已写完（本文件存在）、TaskList 8 项已建。
- **退出条件**：`.judge/<run>/judge.json.verdict == "PASS"` 且 PR 已开（非 draft）、`@libz` 已 mention、attachment 全部上传。
- **失败处理**：FAIL 时不强转 PASS；report.md 记录失败原因 + 下一步建议；PR 标题前缀 `[wip]` 但仍非 draft。
