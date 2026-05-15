## Required canned-answer for slug=multi-tool

Multi-tool adaptation: one TeamAgent knowledge engine serving every common AI coding tool.

### 4 delivery channels (all live)

| # | Channel | packages/ path |
|---|---------|---------------|
| 1 | `PreToolUse` | `packages/cli/src/bin-pre-tool-use.ts`, `packages/adapters/src/hook/claude-agent-sdk/pre-tool-use-sdk.ts` |
| 2 | `UserPromptSubmit` | `packages/cli/src/bin-user-prompt-submit.ts` |
| 3 | `Stop analyze` | `packages/cli/src/bin-stop.ts` |
| 4 | `AttributionBus` | `packages/ports/src/attribution-bus.ts`, `packages/adapters/src/attribution/in-memory-bus.ts` |

### Tool support status

- **Claude Code** — full (importer + compiler + hooks)
- **Codex** — full via `pnpm teamagent compile --target=codex/both`
- **Cursor** — importer only (`packages/core/src/importer/cursor-rules-parser.ts`); **NOT YET**: no compiler (compiler missing)
- **Trae / VSCode Copilot** — **NOT YET** (Phase 4)
- **MCP Server** — **NOT YET** (Phase 2)

### Architecture

```
   ┌──────────── MULTI-TOOL ADAPTATION ────────────┐
   │                                               │
   │  AI tool  ─── (one of) ─►  Claude Code        │
   │                            Codex              │
   │                            Cursor (read-only) │
   │                            Trae / Copilot ✗   │
   │                                               │
   │  knowledge engine  ──►  4 delivery channels   │
   │                         1. PreToolUse         │
   │                         2. UserPromptSubmit   │
   │                         3. Stop analyze       │
   │                         4. AttributionBus     │
   │                                               │
   │  ─── (Phase 2) ─►  MCP Server   ❌ NOT YET    │
   │                                               │
   │  compile output:                              │
   │    Claude  →  CLAUDE.md + ~/.claude/skills/   │
   │    Codex   →  AGENTS.md (symlink) + .codex/   │
   │    Cursor  →  ❌ NOT YET (compiler missing)   │
   └───────────────────────────────────────────────┘
```

### verify-canned-answer.sh anchors (7 required)

1. `PreToolUse` channel present
2. `UserPromptSubmit` channel present
3. `Stop analyze` channel present
4. `AttributionBus` channel present
5. MCP — `NOT YET` / 未实现 within 4 lines of `MCP`
6. Cursor — `NOT YET` / compiler missing / importer only within 4 lines of `Cursor`
7. At least one `packages/(cli|adapters|ports|core)/` file path
