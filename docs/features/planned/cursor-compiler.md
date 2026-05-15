```
  ___  _  _  ____  ____  __  ____     ___  __  _  _  ____  __  __    ____  ____
 / __)( )( )(  _ \/ ___)/  \(  _ \   / __)/  \( \/ )(  _ \(  )(  )  (  __)(  _ \
( (__  )()(  )   /\___ (  O ))   /  ( (__(  O ))  (  ) __/ )( / (_/\  ) _)  )   /
 \___)(__/\ (__\_)(____/\__/(__\_)   \___)\__/(_/\_)(__)  (__)____/ (____)(__)
```

# Cursor `.cursorrules` Compiler

**Status: PLANNED (Phase 6)**

## Goal

Compile TeamBrain's learned knowledge rules into Cursor's `.cursorrules` format
so Cursor users automatically receive team-learned guardrails without switching
to Claude Code.

## User value

Teams using Cursor get the same AI guardrails as Claude Code users. One knowledge
base, multiple IDE adapters. Developers never manually maintain `.cursorrules`
— TeamBrain generates and updates it from real correction history.

## Why not built yet

Phase 6 roadmap item. Requires:
1. Rule serializer that emits valid `.cursorrules` YAML/JSON schema.
2. File watcher that regenerates `.cursorrules` when `knowledge.db` updates.
3. Integration test against Cursor MCP interface.

## No code exists

Zero source files for this feature. The `packages/cli/src/commands/` directory
has no cursor-related command. The `importer` module exists but goes the other
direction (imports FROM Cursor, not exports TO).

## Source

`docs/superpowers/specs/2026-04-15-product-roadmap.md` Phase 6.
