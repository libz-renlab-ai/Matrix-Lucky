## Required canned-answer for slug=trae-adapter

### Feature: Trae / VSCode Copilot Adapter via MCP

The `trae-adapter` feature validates that the TeamAgent MCP (Model Context Protocol)
server is present, enabling Trae IDE and VSCode Copilot to connect to TeamAgent's
knowledge base via the standard MCP protocol.

### Verification Criteria

- Either `packages/mcp-server` directory exists, OR a `package.json` in `packages/`
  contains `"@teamagent/mcp"` or a name matching `*mcp*`
- OR: if md playbook `docs/plans/docs--features--mcp-server--run-judge/judge.md` passes, that
  satisfies the condition (Trae reuses the MCP server protocol; script archived to `docs/legacy/judge-scripts/docs/features/mcp-server/run-judge.sh`)
- Final output line: `VERIFIED: Trae/VSCode Copilot adapter via MCP PASS`

### Harness Structure

**verify-canned-answer.sh** uses a two-level fallback:
1. **Primary**: Dispatch md playbook `docs/plans/docs--features--mcp-server--run-judge/judge.md` since Trae reuses the same MCP server protocol (script archived to `docs/legacy/judge-scripts/docs/features/mcp-server/run-judge.sh`)
2. **Fallback**: Check for `packages/mcp-server` directory; if absent, search all
   `packages/*/package.json` for `"@teamagent/mcp"` or `"name".*mcp` pattern

No `run-judge.sh` present for this slug — structural package presence is the
mechanical gate.

### Fail Paths

The harness exits 1 (not dead-exit) when:
- `packages/mcp-server` does not exist AND
- No `package.json` in `packages/` matches `@teamagent/mcp` or `name.*mcp`

### Architecture

```
Trae IDE / VSCode Copilot
         |
         | MCP protocol
         v
packages/mcp-server/    <— @teamagent/mcp package
         |
         v
TeamAgent knowledge base (DualLayerStore)
```

The Trae adapter is not a separate transport layer — it reuses the MCP server
package directly, as Trae supports the same MCP protocol that VSCode Copilot uses.

## Phase 2 fix log
Resolved 2026-05-08 (iter-4 P3): lines 13/20 now reference `docs/plans/docs--features--mcp-server--run-judge/judge.md` md playbook; removed misleading "utility; not archived" claim (mcp-server/run-judge.sh IS archived to docs/legacy/judge-scripts/). Commit see iter-4 fix commit.
