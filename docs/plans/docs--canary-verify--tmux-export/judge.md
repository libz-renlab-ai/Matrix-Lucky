# Judge Playbook: Canary Skill — tmux Interactive Export

> Replaces archived script `docs/legacy/judge-scripts/docs/canary-verify/tmux-export.sh` per rule
> "third-party judge harness forbidden fixed scripts; MUST use md playbook"
> (`docs/HOWTO-PLAN-PR.md` § 3b).

## Origin
- Replaced script: `docs/legacy/judge-scripts/docs/canary-verify/tmux-export.sh`
- Original purpose: Launch `claudefast` interactively in a tmux session, dismiss workspace-trust dialogs, send the canary registry query prompt, wait for the model's assistant response containing `"status":"found"`, then `/export` the conversation as a durable artifact.
- Status: **ACTIVE**

## §V1 RUN
Commands MAIN agent dispatches; capture stdout/stderr to `evidence_dir = .judge/<run_id>/`:

- Step 1: Create a detached tmux session and launch `claudefast` interactively.
  ```
  SESSION="canary-verify-$(date +%s)"
  tmux new-session -d -s "$SESSION" -x 220 -y 60
  tmux send-keys -t "$SESSION" "zsh -ic 'claudefast'" C-m
  echo "$SESSION" > .judge/<run_id>/tmux-session-name.txt
  ```
- Step 2: Poll the pane for up to 90 s, dismissing any `Enter to confirm` workspace-trust dialogs, until `? for shortcuts` appears (idle prompt).
  ```
  # Poll loop — MAIN agent runs this as a timed check, not a shell loop.
  # Check pane content every 2 s; send Enter when "Enter to confirm" is visible;
  # break when "? for shortcuts" appears without "esc to interrupt".
  tmux capture-pane -p -t "$SESSION" > .judge/<run_id>/pane-ready.txt
  ```
- Step 3: Send the canary registry query prompt (no disk reads; from memory only) then Enter.
  ```
  PROMPT='Without reading any file from disk, confirm whether you have a registered skill named exactly canary. Use only your in-memory skill registry. Output JSON only with keys registered, name, and status. If canary is registered, copy this JSON exactly: {"registered":true,"name":"canary","status":"found"}. If canary is not registered, copy this JSON exactly: {"registered":false,"name":null,"status":"missing"}.'
  tmux send-keys -t "$SESSION" "$PROMPT"
  sleep 1
  tmux send-keys -t "$SESSION" Enter
  ```
- Step 4: Poll up to 240 s for the assistant marker `^⏺ .*"status"[[:space:]]*:[[:space:]]*"found"` in the pane. Capture pane to evidence.
  ```
  tmux capture-pane -p -t "$SESSION" > .judge/<run_id>/pane-response.txt
  ```
- Step 5: Wait for idle (up to 240 s): `? for shortcuts` present and `esc to interrupt` absent. Then `/export` the conversation.
  ```
  tmux send-keys -t "$SESSION" C-u
  sleep 1
  tmux send-keys -t "$SESSION" "/export .judge/<run_id>/canary-session"
  sleep 0.5
  tmux send-keys -t "$SESSION" C-m
  ```
- Step 6: Poll 60 s for the export file to appear. Capture final pane state and kill session.
  ```
  tmux capture-pane -p -t "$SESSION" > .judge/<run_id>/pane-final.txt
  tmux kill-session -t "$SESSION"
  ```

## §V2 DUMP
Canonical JSON to `.judge/<run_id>/judge.json`:
```json
{
  "exit_code": 0,
  "metrics": {
    "tmux_session_launched": true,
    "idle_prompt_reached": true,
    "assistant_response_found_pattern": true,
    "idle_after_response": true,
    "export_file_present": true,
    "export_path": ".judge/<run_id>/canary-session.txt"
  },
  "evidence_dir": ".judge/<run_id>/",
  "stdout_path": ".judge/<run_id>/canary-session.txt",
  "stderr_path": ".judge/<run_id>/pane-final.txt",
  "feature_status": "active"
}
```

## §V3 READ
`claudefast -p` prompt:
> Read `.judge/<run_id>/judge.json` and evidence in `evidence_dir`.
> Emit `PASS` / `FAIL` / `SKIP`.
> PASS criteria: `exit_code` is 0; `metrics.export_file_present` is `true`; `metrics.assistant_response_found_pattern` is `true`; export file is non-empty and contains `"status":"found"`.
> FAIL criteria: `exit_code` non-zero; idle prompt never reached within 90 s; assistant response pattern not matched within 240 s; idle not restored within 240 s after response; export file absent after 60 s.
> SKIP if `tmux` is not installed or `claudefast` is not resolvable via `zsh -i`.

## Notes
- Original logic summary: The script opened a tmux session and ran `claudefast` interactively. It dismissed workspace-trust dialogs via Enter-key injection, then sent the canary prompt one character at a time (not bracketed paste) to avoid multi-line-block behavior in the Claude Code TUI. It polled the pane for `^⏺ .*"status":"found"` (the assistant marker prefix, not just the substring `"canary"`, to avoid false-positives from prompt echo). After the model responded and the session returned to idle, it sent `/export` with a repo-relative path stem (to avoid Claude Code's incorrect absolute-path handling), then normalized whichever extension (`.txt` / `.md`) the CLI produced. The export file is the durable PR artifact.
- Known dependencies / limitations:
  - tmux must be installed and accessible.
  - `claudefast` must be loadable via `zsh -ic`; plain `bash` will not find the alias.
  - Stop-hook extra turns may add latency; the 240 s post-response idle wait accommodates this.
  - Claude Code TUI path handling for `/export` varies by version; MAIN agent should try both absolute and repo-relative stems and use whichever file is created.
  - Bracketed-paste mode in the TUI means keys must be sent as individual characters, not via tmux `-l` (literal/paste).
