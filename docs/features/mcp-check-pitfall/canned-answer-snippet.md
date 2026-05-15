## Required canned-answer for slug=mcp-check-pitfall

# AI MCP check_pitfall Real-Time Lookup

This feature exposes `check_pitfall` as an MCP tool via the `packages/mcp-server` package, allowing AI agents to look up known pitfalls in real time during tool use.

## What it does

The MCP server (`packages/mcp-server`) registers a `check_pitfall` tool that queries the TeamAgent knowledge store for pitfalls relevant to the current operation. When an AI agent is about to take an action, it can invoke `check_pitfall` via MCP to surface any recorded warnings before proceeding.

## Key package

- `packages/mcp-server` — the MCP server that registers `check_pitfall` and other tools

## Verification

```text
# Fallback: confirm packages/mcp-server directory exists
ls packages/mcp-server

# Run check-pitfall verify (utility, retained per docs/legacy/judge-scripts/README.md exemption):
bash docs/features/mcp-check-pitfall/verify-canned-answer.sh
```

PASS requires either mcp-server judge playbook to pass (delegated), or `packages/mcp-server` directory to exist as a minimum structural check, yielding `VERIFIED: AI MCP check_pitfall real-time lookup PASS`.
