```text
   RUN ──► DUMP ──► READ
   固定工具    固定 JSON      LLM judge
   跑测试      .judge/...      只读 raw JSON
                              + evidence
                              输出 PASS/FAIL
```

# Judge Harness Playbook for HookShell + AttributionEvent Fused PR

按 `~/.claude/CLAUDE.md` testing-judge-harness 铁律：**不让代码自己评价自己**。本 PR 的所有验证产物必须经过这个 playbook 流程，由独立 LLM judge（claudefast `-p` sub-agent）读取 raw JSON + evidence 后下 PASS / FAIL。

---

## 阶段 1：RUN —— 固定工具集

每个工具产出一组 `.judge/<run_id>/<tool>.{stdout,stderr,exit,json?}` 文件。`<run_id>` = `YYYYMMDD-HHMMSS`。

```bash
RUN_ID=$(date +%Y%m%d-%H%M%S)
JUDGE_DIR=".judge/${RUN_ID}"
mkdir -p "${JUDGE_DIR}"

# 1. typecheck
pnpm typecheck > "${JUDGE_DIR}/typecheck.stdout" 2> "${JUDGE_DIR}/typecheck.stderr"
echo $? > "${JUDGE_DIR}/typecheck.exit"

# 2. test
pnpm test --coverage > "${JUDGE_DIR}/test.stdout" 2> "${JUDGE_DIR}/test.stderr"
echo $? > "${JUDGE_DIR}/test.exit"
cp coverage/coverage-summary.json "${JUDGE_DIR}/test.coverage.json" 2>/dev/null || true

# 3. walking skeleton
pnpm teamagent skeleton-demo > "${JUDGE_DIR}/skeleton.stdout" 2> "${JUDGE_DIR}/skeleton.stderr"
echo $? > "${JUDGE_DIR}/skeleton.exit"

# 4. 8-bin fixture probes
for bin in pre-tool-use post-tool-use user-prompt-submit pre-compact session-start session-end stop updater; do
  cat fixtures/hook-${bin}.json \
    | pnpm exec node packages/cli/dist/bin-${bin}.cjs \
    > "${JUDGE_DIR}/bin-${bin}.stdout" \
    2> "${JUDGE_DIR}/bin-${bin}.stderr"
  echo $? > "${JUDGE_DIR}/bin-${bin}.exit"
done

# 5. rule verification
bash scripts/verify-all-rules.sh > "${JUDGE_DIR}/rule-verify.stdout" 2> "${JUDGE_DIR}/rule-verify.stderr"
echo $? > "${JUDGE_DIR}/rule-verify.exit"

# 6. lint check (no user-visible stderr in bin-*.ts)
grep -rn 'process\.stderr\.write.*TeamAgent' packages/cli/src/bin-*.ts > "${JUDGE_DIR}/lint-bin-stderr.matches" 2>/dev/null
echo $? > "${JUDGE_DIR}/lint-bin-stderr.exit"  # exit 1 = no matches = PASS

# 7. AttributionEvent kind audit
grep -E "kind:\s*\"" packages/types/src/attribution.ts > "${JUDGE_DIR}/attribution-kinds.txt"

# 8. core FCIS audit
grep -rE "from ['\"]node:fs|from ['\"]node:child_process" packages/core/src/hook/ > "${JUDGE_DIR}/core-fcis.matches" 2>/dev/null
echo $? > "${JUDGE_DIR}/core-fcis.exit"  # exit 1 = no matches = PASS
```

---

## 阶段 2：DUMP —— 固定 JSON Schema

`.judge/<run_id>/judge.json` 必须满足以下 schema：

```typescript
interface JudgeJSON {
  run_id: string;                      // YYYYMMDD-HHMMSS
  pr_branch: string;                   // git rev-parse --abbrev-ref HEAD
  pr_sha: string;                      // git rev-parse HEAD
  exit_codes: {
    typecheck: number;                 // 0 = pass
    test: number;
    skeleton: number;
    "bin-pre-tool-use": number;
    "bin-post-tool-use": number;
    "bin-user-prompt-submit": number;
    "bin-pre-compact": number;
    "bin-session-start": number;
    "bin-session-end": number;
    "bin-stop": number;
    "bin-updater": number;
    "rule-verify": number;
    "lint-bin-stderr": number;         // 1 expected (no matches)
    "core-fcis": number;               // 1 expected (no matches)
  };
  metrics: {
    test_total: number;
    test_passed: number;
    test_failed: number;
    coverage_lines_pct: number;        // expect >= 80
    typecheck_errors: number;          // expect 0
    bin_stderr_user_visible_count: number;  // expect 0
    attribution_event_kinds_count: number;  // expect 12-20
    ports_added_count: number;         // expect 0 per ADR-0005
    files_moved_adapter_to_core: number;    // expect 5
    bin_stop_loc: number;              // expect <= 80
    skeleton_demo_passed: boolean;     // expect true
    fcis_violations_in_core_hook: number;   // expect 0
  };
  evidence_dir: string;                // .judge/<run_id>/
  generated_at: string;                // ISO 8601
}
```

---

## 阶段 3：READ —— LLM Judge（claudefast 8 路平行 probe）

| # | Probe Question | Evidence files |
|---|---------------|----------------|
| 1 | typecheck 是否 0 errors？ | `judge.json` + `typecheck.stdout` |
| 2 | 所有测试通过且覆盖率 ≥ 80%？ | `judge.json` + `test.stdout` |
| 3 | walking skeleton 仍跑通？ | `judge.json` + `skeleton.stdout` |
| 4 | 8 个 bin 全部 exit 0 且 stdout 是合法 JSON？ | `judge.json` + 8 个 `bin-*.stdout` |
| 5 | bin-*.ts 没有任何 user-visible `process.stderr.write`？ | `judge.json` + `lint-bin-stderr.matches` |
| 6 | AttributionEvent 是 discriminated union 且 kinds 在 12-20？ | `judge.json` + `attribution-kinds.txt` |
| 7 | `packages/core/src/hook/` 没有任何 fs / child_process import？ | `judge.json` + `core-fcis.matches` |
| 8 | feature verification 1+2+3 全部 pass？ | feature-verify files |

```bash
RUN_ID=<from阶段 1>
for i in 1 2 3 4 5 6 7 8; do
  claudefast -p "Read .judge/${RUN_ID}/judge.json and evidence for probe ${i}. Output ONLY single-line JSON: {\"probe\": ${i}, \"pass\": true|false, \"reason\": \"...\"}" \
    > ".judge/${RUN_ID}/probe-${i}.json" &
done
wait

cat .judge/${RUN_ID}/probe-*.json \
  | jq -s '{probes: ., overall: (all(.pass) | if . then "PASS" else "FAIL" end)}' \
  > .judge/${RUN_ID}/verdict.json
```

**任意 probe FAIL → block PR merge**。verdict.json 加入 PR contents 作为 audit trail。

---

## 失败回路

如果某 probe FAIL：
1. 读 `verdict.json` 找出 failing probe 的 reason
2. 按 `docs/PR-PLAN.md` 的 P1/P2 triage：FAIL 全是 P1 — 必须本 PR 修
3. 用 TEAMWORK 并行修
4. push 同 PR branch，重跑阶段 1+2+3
5. 直到 verdict.json overall == "PASS" 才能 merge
