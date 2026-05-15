---
Migrated-from: /Users/m1/.gstack/projects/liush2yuxjtu-v4-team-brain/qa-reports/m1-main-qa-only-uat-20260426-201251.md
Part: 01
Source-lines: 1-180 of 239
Tags: gstack, archive, user-level
---

# QA-only UAT report: insights-share Claude Code plugin

Date: 2026-04-26
Branch: main
Mode: terminal UAT, no browser URL
Runner: fresh tmux session 
Scope: 
── step 1: verify tmux session ──
  ✘ NOT in tmux — open new window: tmux new -s uat

── step 2: verify cwd is testV4team ──
  ✔ cwd=/Users/m1/projects/testV4team

── step 3: claude CLI installed ──
  ✔ claude binary on PATH

── step 4: marketplace registered ──
  ✔ insights-share marketplace listed

── step 5: plugin enabled ──
  ✔ insights-share status enabled

── step 6: locate plugin cache dir ──
  ✔ PLUGIN_DIR=/Users/m1/.claude/plugins/cache/insights-share/insights-share/0.2.0

── step 7: sixteen insight-* skill commands installed ──
  ✔ /insight-add skill installed
  ✔ /insight-search skill installed
  ✔ /insight-promote skill installed
  ✔ /insight-log skill installed
  ✔ /insight-edit skill installed
  ✔ /insight-delete skill installed
  ✔ /insight-list skill installed
  ✔ /insight-conflict skill installed
  ✔ /insight-resolve skill installed
  ✔ /insight-notifications skill installed
  ✔ /insight-view skill installed
  ✔ /insight-install skill installed
  ✔ /insight-server skill installed
  ✔ /insight-help skill installed
  ✔ /insight-rate skill installed
  ✔ /insight-flush skill installed

── step 8: README on disk readable ──
  ✔ README at /Users/m1/.claude/plugins/cache/insights-share/insights-share/0.2.0/README.md

── step 9: secondary tmux cold-start shell and paperclip ssh config ──
  ✔ secondary tmux cold-start shell found installed /insight-edit
  ✔ secondary tmux started in testV4team without leaked plugin env
  ✔ paperclipmini ssh config exposes localforward 3100

── step 10: stub server boots ──
  ✔ stub /healthz returns ok (port=55933)

── step 11: POST /insights creates card ──
  ✔ card created id=ins_6f6b41a8ef24

── step 12: GET /insights returns the card ──
  ✔ list contains new card

── step 13: GET /insights/search?q=foo finds the card ──
  ✔ search hits the card

── step 14: GET /stats reports online + total>=1 ──
  ✔ stats online=true total>=1

── step 15: insights-client.sh ping ok ──
  ✔ client ping zero exit

── step 16: insights-client.sh list populates cache ──
  ✔ client list returned card and wrote cache.json

── step 17: insights-client.sh search returns the card ──
  ✔ client search hits the card

── step 18: insights-client.sh stats online=true ──
  ✔ client stats reports online

── step 19: /insight-add backing script redacts PII and rate-limits bursts ──
  ✔ /insight-add redacted direct-feedback person name
  ✔ /insight-add emitted exact email/ip redaction markers
  ✔ /insight-add rejects missing required fields
  ✔ /insight-add duplicate title returns existing card
  ✔ /insight-add rate limit blocks burst after threshold

── step 20: Alice/Bob/Charlie sessions share persisted server insights ──
  ✔ Bob fresh HOME found Alice insight from shared server
  ✔ Charlie fresh HOME saw Alice and Bob insights after server restart
  ✔ Alice/Bob/Charlie have separate populated client caches
  ✔ Alice insight update preserved related_to and resolved status
  ✔ updated insight kept author and timestamps
  ✔ search supports since/until/status filters

── step 21: Frank cross-project search follows the shared team store ──
  ✔ project B found Frank's project A/global insight

── step 22: Frank promotes cross-project RSC hotspot and Charlie audits lineage ──
  ✔ Frank multi-token search found both cross-project RSC source insights
  ✔ Frank promoted architecture/rsc to team memory with sources
  ✔ Charlie fresh HOME found promoted team memory
  ✔ Charlie --scope team search returned only team memories
  ✔ Charlie --priority high search filtered out medium-priority insight
  ✔ Charlie insight-log reproduced promoted memory provenance

── step 23: Carol/Dave concurrent writes are immediately visible to Eve ──
  ✔ Carol and Dave concurrent creates completed
  ✔ Eve realtime fetch hook saw Carol and Dave insights
  ✔ server persisted both concurrent insights without 409/500
  ✔ server preserved distinct Carol and Dave authors

── step 24: SessionStart pushes recent insights without manual search ──
  ✔ SessionStart delivered recent team insight automatically
  ✔ SessionStart delivery includes author and timestamp metadata

── step 25: bulk insight write storm keeps server searchable ──
  ✔ 50 concurrent creates completed and search returned capped bulk hits

── step 26: insights-client.sh search survives server outage from cache ──
  ✔ offline search returned cached UAT card
  ✔ stub restarted after offline-cache check

── step 27: statusline.sh modes (lite/full/ultra) ──
  ✔ statusline lite emits 💡N
  ✔ statusline full emits 🎯
  ✔ statusline ultra emits INSIGHTS

── step 28: fetch-insights.sh hook injects context for matching prompt ──
  ✔ fetch hook injected matching insight

── step 29: fetch-insights.sh stays silent on empty prompt ──
  ✔ fetch hook silent on empty prompt

── step 30: inject-insights.sh hot path reads team mirror cache offline ──
  ✔ hot-path hook injected Bob mirror lesson without server

── step 31: capture-lesson.sh nudges on trap-shaped transcript ──
  ✔ capture-lesson nudged on trap text

── step 32: capture-lesson.sh stays silent on benign transcript ──
  ✔ capture-lesson silent on benign turn

── step 33: SessionStart banner + force-install marker are idempotent ──
  ✔ SessionStart emitted welcome banner
  ✔ marker appended exactly once

── step 34: Stop hook capture-async + /insight-flush finalizes with PII redaction ──
  ✔ Stop hook stayed silent and flush finalized one lesson
  ✔ finalized lesson passed Layer-1 PII redaction
  ✔ unicode lesson preserved while email PII was redacted

── step 35: /insight-rate records Alice feedback for injected lesson ──
  ✔ rating written to repo ratings.jsonl

── step 36: /insight-add-shaped offline create queues then flushes ──
  ✔ offline add queued and flushed to server
  ✔ flushed offline insight is searchable and pending list is empty
  ✔ outbox flush failure keeps pending files for retry
  ✔ retry flush drains pending files and makes them searchable

── step 37: offline kernel-fix conflict sync, resolution, notifications, and audit ──
  ✔ Alice offline buffered three redacted kernel-fix insights
  ✔ Alice reconnect flushed 3 offline insights alongside Bob online insight
  ✔ kernel-fix conflict detection returns versions and conflict id
  ✔ conflict detail is retrievable by id
  ✔ kernel-fix conflict resolves with Alice pick
  ✔ batch promote moved Alice kernel-fix insights to team scope
  ✔ conflict resolution notification recorded
  ✔ view and audit log include resolved kernel-fix conflict

── step 38: concurrent /insight-edit preserves different-field updates ──
  ✔ Frank created an insight for concurrent edit
  ✔ two concurrent /insight-edit commands exited cleanly
  ✔ concurrent different-field edits preserved status and tags
  ✔ /insight-edit rejects non-author actor

── step 39: /insight-delete removes a card and later reads miss ──
  ✔ /insight-delete returned deleted id
  ✔ deleted insight GET returns 404
  ✔ deleted insight no longer appears in search

