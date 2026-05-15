# Judge Playbook: Feature Verify Kit — Dashboard Health Check

> Replaces archived script `docs/legacy/judge-scripts/docs/feature-verify-kit/verify-dashboard-health.sh` per rule
> "third-party judge harness forbidden fixed scripts; MUST use md playbook"
> (`docs/HOWTO-PLAN-PR.md` § 3b).

## Origin
- Replaced script: `docs/legacy/judge-scripts/docs/feature-verify-kit/verify-dashboard-health.sh`
- Original purpose: Run `pnpm teamagent dashboard --once` to regenerate `docs/dashboard.html`, then assert that the HTML contains four stable anchor strings marking a healthy dashboard output.
- Status: **ACTIVE**

## §V1 RUN
Commands MAIN agent dispatches; capture stdout/stderr to `evidence_dir = .judge/<run_id>/`:

- Step 1: Back up the existing `docs/dashboard.html` if present (restore on failure).
  ```
  [ -f docs/dashboard.html ] && cp docs/dashboard.html .judge/<run_id>/dashboard.html.bak || true
  ```
- Step 2: Run the dashboard command to regenerate the HTML file.
  ```
  pnpm --dir . teamagent dashboard --once \
    > .judge/<run_id>/dashboard-once.log \
    2>&1
  DASHBOARD_EXIT=$?
  echo "exit: $DASHBOARD_EXIT" >> .judge/<run_id>/dashboard-once.log
  ```
- Step 3: Assert the four required anchor strings are present in `docs/dashboard.html`.
  ```
  grep -F "TeamAgent 知识库看板" docs/dashboard.html
  grep -F "系统健康总结"       docs/dashboard.html
  grep -F "规则主动防护"       docs/dashboard.html
  grep -F "Retrieval Health"   docs/dashboard.html
  ```
- Step 4: Write the health JSON result.
  ```
  # MAIN agent writes .judge/<run_id>/dashboard-health.json
  # after evaluating which anchors are present vs missing.
  ```
- Step 5: Restore backup if the run was for read-only audit (optional).
  ```
  [ -f .judge/<run_id>/dashboard.html.bak ] && cp .judge/<run_id>/dashboard.html.bak docs/dashboard.html || true
  ```

## §V2 DUMP
Canonical JSON to `.judge/<run_id>/judge.json`:
```json
{
  "exit_code": 0,
  "metrics": {
    "service": "teamagent-dashboard",
    "status": "ok",
    "stable_health_signal": "系统健康总结",
    "anchors_checked": [
      "TeamAgent 知识库看板",
      "系统健康总结",
      "规则主动防护",
      "Retrieval Health"
    ],
    "anchors_missing": [],
    "html_path": "docs/dashboard.html"
  },
  "evidence_dir": ".judge/<run_id>/",
  "stdout_path": ".judge/<run_id>/dashboard-once.log",
  "stderr_path": ".judge/<run_id>/dashboard-once.log",
  "feature_status": "active"
}
```

## §V3 READ
`claudefast -p` prompt:
> Read `.judge/<run_id>/judge.json` and evidence in `evidence_dir`.
> Emit `PASS` / `FAIL` / `SKIP`.
> PASS criteria: `exit_code` is 0; `metrics.status` is `"ok"`; `metrics.anchors_missing` is an empty array; all 4 anchors are present in `docs/dashboard.html`.
> FAIL criteria: `exit_code` non-zero; `metrics.anchors_missing` is non-empty; `docs/dashboard.html` is absent or unreadable after the `dashboard --once` run.
> SKIP if `pnpm teamagent dashboard` command is not available (CLI not built) or `docs/dashboard.html` target path is not writable.

## Notes
- Original logic summary: The script ran `pnpm teamagent dashboard --once` (which writes `docs/dashboard.html`) with a backup-and-restore pattern to avoid permanently mutating the file during a read-only audit. It then used a Node.js inline script to check that the HTML output contained all four Chinese and English anchor strings that signal a complete, healthy dashboard render: the page title, the health summary section, the rule-protection section, and the Retrieval Health section. Missing anchors set `status: "missing_anchor"` and caused a non-zero exit.
- Known dependencies / limitations:
  - Requires `pnpm` and the built `teamagent` CLI (`pnpm install` + build step must have run).
  - The dashboard command writes to `docs/dashboard.html`; running this in CI modifies a tracked file — MAIN agent should stage and unstage or use the backup-restore pattern.
  - The four anchor strings are hard-coded; if the dashboard template changes its headings, the playbook anchors must be updated to match.
  - `stableHealthSignal` / `stable_health_signal` in the output is redundant (kept for fixture compatibility with the original script's JSON shape).
