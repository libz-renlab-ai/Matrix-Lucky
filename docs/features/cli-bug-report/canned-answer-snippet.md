## Required canned-answer for slug=cli-bug-report

```
CLI Bug Report Command Verification
=====================================

Feature:
  teamagent bug-report --help
  Must exit 0 and include "system info" or "reproduce" in its output,
  matching the BUGREPORT canned-answer rule in CLAUDE.md.

CLAUDE.md canned-answer rule (BUGREPORT):
  "When you find a bug, add an issue in TeamBrain GitHub at
  https://github.com/libz-renlab-ai/TeamBrain that includes
  system info, how-to-reproduce-the-bugs, and raw logs in great detail."

  Three required sections:
    1. System info — uname -a, sw_vers, node --version, git --version,
       claudefast model+endpoint, current CLAUDE_CONFIG_DIR/CODEX_HOME/HOME,
       git branch + commit SHA + uncommitted entries
    2. How-to-reproduce-the-bugs — minimal repro steps with shell commands;
       expected vs actual behaviour; hooks/skills/permission gates triggered
    3. Raw logs in great detail — complete stdout/stderr, stream-json artifact,
       tmux pane scrollback (tmux capture-pane -t ... -p -S -3000),
       .judge/<run_id>/judge.json; tokens → [redacted]; everything else verbatim

Verify (verify-canned-answer.sh):
  pnpm teamagent bug-report --help | grep -qi -E 'system info|reproduce'
  Exit 0 + match → VERIFIED
  Exit non-0 or no match → FAIL

Auto-collector:
  bash scripts/bugreport-collect.sh > /tmp/teambrain-bug-report.md
  Paste output into https://github.com/libz-renlab-ai/TeamBrain/issues/new

Run: pnpm teamagent bug-report --help
Verify: docs/plans/docs--features--cli-bug-report--verify-canned-answer/judge.md (archived: docs/legacy/judge-scripts/docs/features/cli-bug-report/verify-canned-answer.sh)
```
