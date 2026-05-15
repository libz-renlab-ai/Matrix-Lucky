# Judge Playbook: Feature Verify Kit — tmux Interactive Prompt Response

> Replaces archived script `docs/legacy/judge-scripts/docs/feature-verify-kit/verify-tmux-interactive.sh` per rule
> "third-party judge harness forbidden fixed scripts; MUST use md playbook"
> (`docs/HOWTO-PLAN-PR.md` § 3b).

## Origin
- Replaced script: `docs/legacy/judge-scripts/docs/feature-verify-kit/verify-tmux-interactive.sh`
- Original purpose: Launch `claudefast` interactively in a tmux session, send a feature-verification explanatory prompt, wait for a complete response, then `/export` the conversation as a durable artifact for inclusion in the PR.
- Status: **ACTIVE**

## §V1 RUN
Commands MAIN agent dispatches; capture stdout/stderr to `evidence_dir = .judge/<run_id>/`:

- Step 1: Kill any pre-existing `teamagent-feature-verify` session and create a fresh detached session running `claudefast`.
  ```
  SESSION="teamagent-feature-verify"
  tmux kill-session -t "$SESSION" 2>/dev/null || true
  tmux new-session -d -s "$SESSION" -x 220 -y 60 -c "$(pwd)" "claudefast"
  echo "$SESSION" > .judge/<run_id>/tmux-session-name.txt
  ```
- Step 2: Poll up to 60 s (2 s intervals) for `Claude Code` text to appear in the pane (signals UI ready).
  ```
  tmux capture-pane -t "$SESSION" -p > .judge/<run_id>/pane-ready.txt
  ```
- Step 3: Clear input line and send the feature-verification explanatory prompt.
  ```
  PROMPT='EXPLAIN ONLY: how do we use claude stream json and tmux + interactive claude to verify if our features work ?'
  tmux send-keys -t "$SESSION" C-u
  tmux send-keys -t "$SESSION" "$PROMPT"
  tmux send-keys -t "$SESSION" C-m
  ```
- Step 4: Poll up to 180 s (3 s intervals) for the response to complete. Handle any `Do you want to proceed?` dialogs by sending `1` then Enter. Stop polling when `esc to interrupt` and `queued messages` are both absent from the pane tail.
  ```
  tmux capture-pane -t "$SESSION" -p | tail -8 > .judge/<run_id>/pane-streaming.txt
  ```
- Step 5: Wait 10 s for stop-hook follow-up turns to settle, then clear input and send `/export` with a repo-relative stem.
  ```
  EXPORT_REL="docs/feature-verify-kit/runs/tmux-export"
  tmux send-keys -t "$SESSION" C-u
  sleep 1
  tmux send-keys -t "$SESSION" "/export $EXPORT_REL"
  tmux send-keys -t "$SESSION" C-m
  ```
- Step 6: Poll 60 s (2 s intervals) for the export file to appear (check `.txt`, `.md`, and no-extension variants). Capture final pane state, send `/exit`, kill session.
  ```
  tmux capture-pane -t "$SESSION" -p > .judge/<run_id>/pane-final.txt
  tmux send-keys -t "$SESSION" "/exit" C-m
  sleep 1
  tmux kill-session -t "$SESSION" 2>/dev/null || true
  # Normalize whichever file was created to .judge/<run_id>/tmux-export.md
  ```

## §V2 DUMP
Canonical JSON to `.judge/<run_id>/judge.json`:
```json
{
  "exit_code": 0,
  "metrics": {
    "tmux_session_launched": true,
    "ui_ready_within_60s": true,
    "response_complete_within_180s": true,
    "stop_hook_settled": true,
    "export_file_present": true,
    "export_path": ".judge/<run_id>/tmux-export.md"
  },
  "evidence_dir": ".judge/<run_id>/",
  "stdout_path": ".judge/<run_id>/tmux-export.md",
  "stderr_path": ".judge/<run_id>/pane-final.txt",
  "feature_status": "active"
}
```

## §V3 READ
`claudefast -p` prompt:
> Read `.judge/<run_id>/judge.json` and evidence in `evidence_dir`.
> Emit `PASS` / `FAIL` / `SKIP`.
> PASS criteria: `exit_code` is 0; `metrics.export_file_present` is `true`; `metrics.ui_ready_within_60s` is `true`; `metrics.response_complete_within_180s` is `true`; export file is non-empty.
> FAIL criteria: `exit_code` non-zero; `claudefast` UI did not become ready within 60 s; response did not complete within 180 s; export file absent after 60 s polling.
> SKIP if `tmux` is not installed or `claudefast` is not on PATH.

## Notes
- Original logic summary: The script created a detached tmux session running `claudefast`, polled until `Claude Code` text appeared in the pane, then sent an explanatory prompt about stream-json + interactive tmux verification. It polled the bottom 8 lines of the pane every 3 s, automatically pressing `1`+Enter for any `Do you want to proceed?` permission dialogs, and stopped when neither `esc to interrupt` nor `queued messages` was visible. After a 10 s stop-hook settling pause it sent `/export` with a repo-relative stem (because Claude Code incorrectly strips leading slashes from absolute paths), then polled 60 s for any of the three export file variants (`.txt`, `.md`, no extension) and normalized the winner. The export file is the durable PR evidence artifact proving interactive claudefast responds to prompts correctly.
- Known dependencies / limitations:
  - `tmux` must be installed; `claudefast` must be on PATH (not only in zsh alias).
  - Stop-hook turns add unpredictable latency; the 10 s pre-export sleep is a heuristic and may need extending for slow hosts.
  - Claude Code TUI `/export` path resolution has version-specific behavior; MAIN agent should accept any of `.txt`, `.md`, or bare-stem outputs.
  - The prompt is deliberately vague (`EXPLAIN ONLY: ...`) to avoid triggering tool-use that would require permission dialogs — the test verifies interactive responsiveness, not tool correctness.
