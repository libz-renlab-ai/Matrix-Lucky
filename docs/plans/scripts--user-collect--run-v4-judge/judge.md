# Judge Playbook: user-collect V4 third-party judge (user-collect/run-v4-judge)

> Replaces archived script `scripts/user-collect/run-v4-judge.sh` per project rule
> "third-party judge harness forbidden fixed scripts; MUST use md playbook"
> (`docs/HOWTO-PLAN-PR.md` § 3b).

## Origin

- Replaced script: `docs/legacy/judge-scripts/scripts/user-collect/run-v4-judge.sh`
- Original purpose: V4 of the user-collect data collection pipeline — third-party judge that reads an evidence snapshot (raw user/dev JSONL from 3 users + V2 handout JSON + V3 export TXT) and dispatches a separate `claudefast` (or `codex`) LLM judge to emit `judge.json` over the snapshot. The judge runs in a sandboxed `STATE_DIR` with isolated `claude-config` / `codex-home` / `home`, sourcing `scripts/dogfood-shim.sh` for env isolation.
- Status: **ACTIVE** — user-collect V1/V2/V3 utility scripts are preserved (UTILITY category, not archived); only the judge script (V4) was archived. Pipeline still runs.

## §V1 RUN

Commands the MAIN agent dispatches (via subagent or `claudefast -p` probe).
Capture stdout/stderr to `evidence_dir = .judge/<RUN_ID>/`.

Inputs: `SANDBOX` (path to user-collect output dir produced by V1/V2/V3) and optional `JUDGE_DIR` (defaults to `.judge/<USER_COLLECT_RUN_ID-or-timestamp>`).

- **Step 1 — Pre-flight required files**: assert each of these exists and is non-empty:
  - `<SANDBOX>/raw/user{1,2,3}-user.jsonl`
  - `<SANDBOX>/raw/user{1,2,3}-dev.jsonl`
  - `<SANDBOX>/v2-handout.json`
  - `<SANDBOX>/v3-export.txt`
  Any missing => exit 1 with `[user-collect] FAIL missing evidence: <path>`.
- **Step 2 — Snapshot evidence**: `cp <SANDBOX>/raw/* <JUDGE_DIR>/evidence-snapshot/`; copy `v2-handout.json`, `v2.stderr`, `v3-export.txt`, `v3-pane.txt` into the same snapshot dir.
- **Step 3 — Build manifest**: write `<JUDGE_DIR>/stdout-manifest.txt` listing the V1/V2/V3 stdout file paths.
- **Step 4 — Dispatch judge LLM**: invoke `claudefast` (or `codex exec`) with the snapshot dir as CWD, sourcing `scripts/dogfood-shim.sh` for tier-2 isolation (`DOGFOOD_CLAUDE_CONFIG_DIR`, `DOGFOOD_CODEX_HOME`, `DOGFOOD_HOME` all pointing under `<JUDGE_DIR>/judge-state/`). Pass the fixed prompt below verbatim.
- **Step 5 — Capture verdict**: judge LLM emits a single JSON object to stdout matching the schema in §V2; write to `<JUDGE_DIR>/judge.json`.

Fixed judge prompt (embedded in source; preserved here for §V1 step 4):

> 你是第三方 judge，当前工作目录就是 evidence-snapshot。
> 禁止重跑命令，禁止读取 plan.md、repo 其他文件，禁止凭感觉判断。
> 必须至少读取这些文件再下结论：
> - v2-handout.json
> - v3-export.txt
> - user1-user.jsonl, user1-dev.jsonl
> - user2-user.jsonl, user2-dev.jsonl
> - user3-user.jsonl, user3-dev.jsonl
>
> 规则:
> 1. 只基于当前目录中的证据文件归纳。
> 2. 任意必需证据缺失、不一致、或 export 太小 → FAIL，exit_code=1。
> 3. 不要 markdown，不要代码块，只输出 JSON。

## §V2 DUMP

Canonical JSON written to `<JUDGE_DIR>/judge.json` (schema is the LLM judge's output, not the harness's):

```json
{
  "exit_code": "0 | 1",
  "run_id": "<USER_COLLECT_RUN_ID>",
  "evidence_dir": "<SANDBOX>",
  "stdout_path": "<JUDGE_DIR>/stdout-manifest.txt",
  "feature_status": "active",
  "metrics": {
    "v1": { "user_count": 3, "instances": 6, "raw_files_present": "<bool>", "stream_json_events_min": "<int>" },
    "v2": { "handout_json_valid": "<bool>", "per_user_keys_ok": "<bool>" },
    "v3": { "export_txt_present": "<bool>", "export_bytes": "<int>" },
    "judge_view_only": true,
    "user_level_isolation": true
  },
  "verdict": "PASS | FAIL",
  "notes": "<one-sentence root cause or conclusion>"
}
```

## §V3 READ

LLM judge prompt (run via `claudefast -p`):

> Read `<JUDGE_DIR>/judge.json` (this is itself the judge LLM's verdict from §V1 step 4). Confirm it conforms to schema. Do NOT execute tools. Emit verdict:
>
> - **PASS** if inner `verdict == "PASS"` AND `exit_code == 0` AND all `metrics.v1.raw_files_present`, `v2.handout_json_valid`, `v2.per_user_keys_ok`, `v3.export_txt_present` are true AND `v3.export_bytes` exceeds reasonable threshold (e.g. > 100).
> - **FAIL** if inner `verdict == "FAIL"` OR any required metric absent / false.
> - **SKIP** if `<SANDBOX>` path was not produced by V1/V2/V3 (pre-flight failed in §V1 step 1).

This is a meta-judge: the inner LLM (§V1 step 4) is the actual third-party judge; the outer LLM (§V3) confirms the harness wired the inner judge correctly.

## Notes

- Original logic summary: bash `set -euo pipefail`, validates required SANDBOX files, copies into `evidence-snapshot/`, builds stdout manifest, then `env ... zsh -i -c '... source scripts/dogfood-shim.sh ... claudefast/codex ...'` to dispatch the inner judge in tier-2 isolation. Output is a JSON blob from the inner LLM.
- Dependencies: `scripts/dogfood-shim.sh` (UTILITY, kept in tree); `claudefast` or `codex` CLI; `zsh -i` available; output of upstream V1 (`run-v1.sh`), V2 (`run-v2.sh`), V3 (`run-v3.sh`).
- Limitations: SANDBOX shape is fixed (3 users × 2 views + v2-handout + v3-export); can't grade arbitrary collection configurations without extending the shape and the judge prompt.
