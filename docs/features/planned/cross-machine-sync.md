```
  ___  ____  __  ____  ____     __  __  __   ___  _  _  ____  _  _  ____     ____  _  _  _  _  ___
 / __)(  _ \(  )(_  _)/ ___)   (  )(  \/  ) / __)/ )( \(  _ \( )( )(  __)   / ___)( \/ )( \( )/ __)
( (__  )   / )(   )(  \___ \    )(  ))    ( ( (__ ) __ ( )   / )()(  ) _)    \___ \ )  (  )  ( \__ \
 \___)(__\_)(__) (__) (____/   (__)(__\/\__)  \___)\_)(_/(__\_)(_/\_)(__)     (____/(_/\_)(_/\_)(___/
```

# Cross-Machine Git-Sync for Team Knowledge

**Status: PLANNED (Phase 4)**

## Goal

Sync TeamBrain's learned knowledge across machines using a git-backed store.
Team members on different machines see the same rules, corrections, and
calibrated confidence scores.

## User value

A correction made by one developer on their laptop propagates to teammates'
machines automatically. No manual export/import. Knowledge accumulates across
the whole team, not just locally.

## Why not built yet

Phase 4 roadmap item. Requires:
1. Git-backed knowledge store (migrate from local JSON/SQLite to git-tracked YAML).
2. Conflict resolution strategy for concurrent rule edits.
3. Privacy/review gate before personal rules promote to team scope.
4. CI-triggered sync hook on `knowledge.db` change commits.

## Current state

`docs/features/team-share.md` documents the local `personal/team/global` scope
model. Cross-machine sync is explicitly noted as NOT YET in that doc.
`packages/cli/src/commands/team-transfer.ts` (added in 5c99a61) handles
export/import but requires manual invocation and has no e2e verify script.

## Source

`docs/superpowers/specs/2026-04-15-product-roadmap.md` Phase 4.
