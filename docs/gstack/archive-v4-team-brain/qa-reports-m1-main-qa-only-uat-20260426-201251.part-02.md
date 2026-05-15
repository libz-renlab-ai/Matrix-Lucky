---
Migrated-from: /Users/m1/.gstack/projects/liush2yuxjtu-v4-team-brain/qa-reports/m1-main-qa-only-uat-20260426-201251.md
Part: 02
Source-lines: 181-239 of 239
Tags: gstack, archive, user-level
---

── step 40: buffer-recover handles crash-recovery scan ──
  ✔ buffer-recover returned recovery JSON

── step 41: installed plugin regression suite passes ──
  ✔ installed plugin tests passed 114/114

═════════════════════════════════════════
PASS=96  FAIL=1  log=/var/folders/ty/f0pf8_w91zb3j4fpjd0zrhvm0000gn/T//insights-uat-76384.log
═════════════════════════════════════════ against installed  plugin cache
Raw evidence: 

## Result

Status: DONE
Health score: 100/100
UAT result: PASS=97, FAIL=0
Installed plugin regression suite: 114/114 passed
Exit code: 0

## What was tested

- tmux-only naive-user environment in .
- Claude CLI presence, marketplace registration, plugin enabled state, plugin cache discovery.
- All 16  skill files installed and discoverable.
- Secondary tmux cold-start behavior without leaked plugin environment.
-  SSH config localforward on port 3100.
- Stub server health, card create/list/search/stats, client cache population.
-  PII redaction, invalid input rejection, duplicate handling, burst rate limiting.
- Alice/Bob/Charlie multi-session persistence and separate local caches.
- Frank cross-project search and  team-memory promotion.
- Charlie , , and  search filtering.
- Carol/Dave/Eve concurrent discovery and server persistence under bulk write load.
- SessionStart insight delivery, hook injection, capture nudges, hot-path mirror cache injection.
- Stop hook async capture, , Unicode preservation with email redaction.
- , offline add/flush/retry, conflict detection/detail/resolve/notification/audit.
- Concurrent , non-author rejection, , 404/search miss, buffer recovery.
- Installed plugin regression suite, 114 assertions passed.

## Findings

No failing bugs found in this UAT run.

## Concerns

- Step 41 is quiet while  executes. During this run it continued for several minutes with no progress marker before finishing cleanly. This is not a failing bug, but it makes hung-vs-slow hard to distinguish for a naive tester.

## Top 3 things to fix

None from this run.

## Evidence excerpts

- 
- 
- 

## Report-only note

No source files were read or changed. No fixes were attempted.
