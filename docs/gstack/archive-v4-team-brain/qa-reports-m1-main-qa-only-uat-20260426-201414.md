---
Migrated-from: /Users/m1/.gstack/projects/liush2yuxjtu-v4-team-brain/qa-reports/m1-main-qa-only-uat-20260426-201414.md
Source-lines: 57
Tags: gstack, archive, user-level
---

# QA-only UAT report: insights-share Claude Code plugin

Date: 2026-04-26
Branch: main
Mode: terminal UAT, no browser URL
Runner: fresh tmux session qa-v4team-20260426-200446
Scope: ~/projects/testV4team/uat.sh against installed insights-share plugin cache
Raw evidence: /Users/m1/.gstack/projects/liush2yuxjtu-v4-team-brain/qa-reports/m1-main-qa-only-uat-20260426-201414.raw.log

## Result

Status: DONE
Health score: 100/100
UAT result: PASS=97, FAIL=0
Installed plugin regression suite: 114/114 passed
Exit code: 0

## What was tested

- tmux-only naive-user environment in ~/projects/testV4team.
- Claude CLI presence, marketplace registration, plugin enabled state, plugin cache discovery.
- All 16 /insight-* skill files installed and discoverable.
- Secondary tmux cold-start behavior without leaked plugin environment.
- paperclipmini SSH config localforward on port 3100.
- Stub server health, card create/list/search/stats, client cache population.
- /insight-add PII redaction, invalid input rejection, duplicate handling, burst rate limiting.
- Alice/Bob/Charlie multi-session persistence and separate local caches.
- Frank cross-project search and /insight-promote team-memory promotion.
- Charlie /insight-log, --scope team, and --priority high search filtering.
- Carol/Dave/Eve concurrent discovery and server persistence under bulk write load.
- SessionStart insight delivery, hook injection, capture nudges, hot-path mirror cache injection.
- Stop hook async capture, /insight-flush, Unicode preservation with email redaction.
- /insight-rate, offline add/flush/retry, conflict detection/detail/resolve/notification/audit.
- Concurrent /insight-edit, non-author rejection, /insight-delete, 404/search miss, buffer recovery.
- Installed plugin regression suite, 114 assertions passed.

## Findings

No failing bugs found in this UAT run.

## Concerns

- Step 41 is quiet while tests/run.sh executes. During this run it continued for several minutes with no progress marker before finishing cleanly. This is not a failing bug, but it makes hung-vs-slow hard to distinguish for a naive tester.

## Top 3 things to fix

None from this run.

## Evidence excerpts

- installed plugin tests passed 114/114
- PASS=97 FAIL=0 log=/var/folders/ty/f0pf8_w91zb3j4fpjd0zrhvm0000gn/T//insights-uat-48976.log
- __UAT_EXIT_CODE__:0

## Report-only note

No source files were read or changed. No fixes were attempted.
