```
 __  __  ____  ____     ____  ____  ____  _  _  ____  ____
(  \/  )/ ___)(  _ \   / ___)(  __)(  _ \/ )( \(  __)(  _ \
 )    ( \___ \ ) __/    \___ \ ) _)  )   /\ \/ / ) _)  )   /
(_/\/\_)(____/(__)      (____/(____)(__\_) \__/ (____)(__\_)
```

# MCP Server: `check_pitfall` from IDE

**Status: PLANNED (Phase 2)**

## Goal

Enable any MCP-compatible IDE (Cursor, Windsurf, VS Code with Copilot) to call
`check_pitfall(description)` against the TeamBrain knowledge base in real time,
without the developer leaving their editor.

## User value

Developer types code; IDE silently queries TeamBrain; if a known pitfall matches,
a warning surfaces inline — no context switch needed. This extends TeamBrain's
interception from Claude Code sessions into any AI-assisted coding tool.

## Why not built yet

Phase 2 roadmap item. Requires:
1. An HTTP server exposing `/check_pitfall` and `/list_rules` endpoints.
2. MCP manifest (`mcp.json`) declaring the tool schema.
3. Auth token for team-scoped knowledge access.

## No code exists

There is no source file implementing this feature. The closest existing code is
`packages/core/src/matcher/` (BM25+dense RRF matcher) which will back the
endpoint once the server is built.

## Source

`docs/superpowers/specs/2026-04-15-product-roadmap.md` Phase 2.
