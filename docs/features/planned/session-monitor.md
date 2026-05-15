```
  ____  ____  ____  ____  __  __  _  _     __  __  __  _  _  __  ____  __  ____
 / ___)(  __)/ ___)/ ___)(__)(  )( \/ )   (  \/  )/  \( \( )(  )(_  _)/  \(  _ \
 \___ \ ) _) \___ \\___ \ )( / (_/) (     )    ( (  O ))  (  )(   )( (  O ))   /
 (____/(____)(____/(____/(__)\___)\_/      \_/\_/ \__/(_)\_)(__) (__) \__/(__\_)
```

# Session Monitor: Live In-Session Warnings

**Status: PLANNED (Phase 2)**

## Goal

Surface pitfall warnings in real time as the developer types, not only when
a tool call is about to fire. The monitor watches the conversation stream and
injects a warning banner when a known pitfall is detected in the user's intent.

## User value

Today, the PreToolUse hook intercepts only at tool-call time. Session Monitor
catches the mistake earlier — while the developer is still typing their request
— giving more time to course-correct before any action is taken.

## Why not built yet

Phase 2 roadmap item. Requires:
1. `UserPromptSubmit` hook (already wired) combined with a streaming text scanner.
2. Low-latency matcher path (< 100 ms) to avoid adding perceptible lag.
3. UI layer to surface warning without blocking the developer's flow.

## Current state

`UserPromptSubmit` hook is registered. `packages/core/src/narrative-scanner/`
exists for transcript scanning but runs post-session, not live. No streaming
variant exists yet.

## Source

`docs/superpowers/specs/2026-04-15-product-roadmap.md` Phase 2.
