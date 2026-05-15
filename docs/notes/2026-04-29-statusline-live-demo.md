```
   ┌──────────────────────────────────────────────────────────┐
   │  scripts/teamagent-statusline-demo.sh                    │
   │                                                          │
   │  ┌────────────┐         ┌──────────────┐                 │
   │  │ seed CJS   │ ──────▶ │ /tmp sandbox │                 │
   │  │ (sqlite)   │         │  knowledge   │                 │
   │  └────────────┘         │  global      │                 │
   │                         │  events      │                 │
   │                         └──────┬───────┘                 │
   │                                │                         │
   │             ┌──────────────────┼──────────────────┐      │
   │             ▼                                     ▼      │
   │   ┌─────────────────┐                  ┌──────────────┐  │
   │   │ tmux: watch     │                  │ tmux: claude │  │
   │   │  4 scenarios    │                  │  real TUI    │  │
   │   │  refresh /2s    │                  │  bottom line │  │
   │   └─────────────────┘                  └──────────────┘  │
   │           │                                     │        │
   │           └──────── osascript Terminal ◀────────┘        │
   └──────────────────────────────────────────────────────────┘
```

# Statusline live demo

Reproducible demo for `scripts/teamagent-statusline.cjs`. Builds an
isolated sandbox under `/tmp`, seeds project / global / events SQLite
DBs, and lets reviewers see exactly what `teamagent-statusline.cjs`
renders — both as raw script output and inside a real Claude Code TUI.

## Files

| path | role |
|---|---|
| `scripts/teamagent-statusline-demo.sh` | orchestrator (entry point) |
| `scripts/teamagent-statusline-demo-watch.sh` | per-scenario refresh loop run inside each tmux window |
| `scripts/teamagent-statusline-demo-seed.cjs` | standalone `node:sqlite` DB seeder for the sandbox |

## Usage

```bash
# both modes (default): builds 2 tmux sessions and pops Terminal for each
./scripts/teamagent-statusline-demo.sh

# only the 4-scenario watch (no real claude)
./scripts/teamagent-statusline-demo.sh --watch

# only the real-claude TUI (statusLine wired into .claude/settings.local.json)
./scripts/teamagent-statusline-demo.sh --claude

# headless: build sessions, don't open Terminal
./scripts/teamagent-statusline-demo.sh --no-popup

# tear down
./scripts/teamagent-statusline-demo.sh --cleanup
```

`--no-popup` is required on non-Darwin or when running in CI; the
script falls back to printing the `tmux attach` command.

## What you see

**watch session** — `tmux attach -t statusline-live` — four windows:

| window | scenario | expected line |
|---|---|---|
| `1·full-state` | project + global + events DBs all seeded | `TeamAgent · rules:5 · helped:3/5 · risk:1 · 刚记住踩坑` |
| `2·missing-db` | project marker but no `knowledge.db` | `⚠️  TeamAgent 未初始化本项目 · 运行 \`teamagent init\` 启用` |
| `3·global-only` | non-project cwd, only global DB | `TeamAgent · rules:3 · helped:3/5 · risk:1 · 刚记住踩坑` |
| `4·no-db` | nothing seeded anywhere | `TeamAgent 未安装 · 运行 \`npm install -g teamagent-X.Y.Z.tgz\`` |

**claude session** — `tmux attach -t statusline-claude` — boots real
`claude` inside `/tmp/teamagent-statusline-demo/claude-demo/` where
`.claude/settings.local.json` already carries the production
`statusLine` block (with the `_teamagentTag: "teamagent-statusline"`
marker that `installHook()` writes). The statusline appears at the
bottom of the Claude Code TUI.

## Sandbox layout

```
/tmp/teamagent-statusline-demo/
├── project/.teamagent/knowledge.db  ← 2 active non-wiki + 1 wiki + 1 archived
├── project-no-db/                   ← project marker, no DB
├── non-project/                     ← no marker, no DB
├── empty-non-project/               ← isolated empty cwd for "no-db" scenario
├── empty-home/                      ← isolated empty HOME for "no-db" scenario
├── home/.teamagent/global.db        ← 3 active non-wiki + 1 wiki
├── home/.teamagent/events.db        ← 5 events (matched/warned/result/updated/pitfall)
└── claude-demo/                     ← project where real claude boots
    ├── .claude/settings.local.json  ← statusLine entry
    └── .teamagent/knowledge.db      ← small seed so rules:N is non-zero
```

The user's real `~/.teamagent` is never touched. The watch sessions
override `HOME` so they read sandbox DBs only; the claude session
uses the user's real `HOME` because `claude` needs its own config dir
— meaning `rules:N` in the claude TUI naturally unions sandbox project
DB with the user's real global DB, which is the actual production
behavior.

## Reference

- Production script: `scripts/teamagent-statusline.cjs`
- Install path: `packages/cli/src/commands/install-hook.ts` (statusLine block)
- Bundling: `packages/teamagent/tsup.config.ts` (raw `.cjs` copy)
- Audit plan: `audit/plans/feature-19-statusline.md`
- Original design: `docs/superpowers/specs/2026-04-20-observability-design.md`
