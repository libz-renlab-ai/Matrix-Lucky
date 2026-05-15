---
Migrated-from: /Users/m1/.gstack/projects/liush2yuxjtu-v4-team-brain/qa-runs/plugin-terminal-20260426-211706/reports/qa-report.md
Source-lines: 48
Tags: gstack, archive, user-level
---

# QA Report: plugin-terminal-20260426-211706

Date: 2026-04-26
Lane: plugin_terminal
Actor: agent
Target: `bash ~/projects/testV4team/uat.sh`
Evidence root:
`/Users/m1/.gstack/projects/liush2yuxjtu-v4-team-brain/qa-runs/plugin-terminal-20260426-211706`

## Result

Status: complete
Verdict: pass
UAT: PASS=97 FAIL=0
Installed plugin regression suite: 114/114 passed
Exit code: 0

## Evidence

- Manifest: `manifest.json`
- Events: `uat-events.jsonl`
- Full run log: `logs/uat-full.log`

## Covered

- Fresh tmux UAT preflight.
- Marketplace registration, enabled plugin state, cache discovery, README, and all
  16 `/insight-*` skills.
- Stub server create/list/search/stats and client cache behavior.
- `/insight-add` PII redaction, invalid input, duplicate, and burst rate limit.
- Multi-session persistence, team promote, `/insight-log`, scoped search, and
  concurrent discovery.
- SessionStart delivery, hot-path injection, Stop hook flush, Unicode preservation,
  and email redaction.
- `/insight-rate`, offline add/flush/retry, conflict detection/detail/resolve,
  notifications, audit, concurrent edit, delete, and buffer recovery.
- Installed plugin regression suite at 114/114.

## Browser Lanes

No repo-owned Web URL was supplied for this run. Per
`docs/web-human-qa-evidence-contract.md`, agent_browser and human_browser lanes are
not applicable until a target URL exists.

## Notes

An earlier direct shell run produced PASS=96 FAIL=1 because it was not inside tmux.
That run is not used as the terminal/plugin lane result.
