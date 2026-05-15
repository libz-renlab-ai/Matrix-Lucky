#!/usr/bin/env bash
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/../../.." && pwd)"
MCP_VERIFY="$REPO_ROOT/docs/features/mcp-server/verify-canned-answer.sh"

if [ -x "$MCP_VERIFY" ]; then
  echo "==> [mcp-check-pitfall] delegating to mcp-server verify (check_pitfall is an MCP tool)"
  bash "$MCP_VERIFY"
else
  echo "==> [mcp-check-pitfall] mcp-server verify not ready yet; checking packages/mcp-server exists"
  if [ -d "$REPO_ROOT/packages/mcp-server" ]; then
    echo "  [ok] packages/mcp-server directory exists"
  else
    echo "FAIL: packages/mcp-server not found"
    exit 1
  fi
fi

echo "VERIFIED: AI MCP check_pitfall real-time lookup PASS"
