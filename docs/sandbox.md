```
  ┌─────────────────────────────────────────────────────────┐
  │              TeamBrain Local Sandbox                    │
  │                                                         │
  │  .sandbox/                                              │
  │  ├── home/          ← sandbox USER HOME                 │
  │  │   ├── .claude/   ← sandbox CLAUDE HOME              │
  │  │   ├── .teamagent/← teamagent global db              │
  │  │   └── .npmrc     ← npm prefix → .sandbox/npm        │
  │  ├── npm/           ← sandbox NPM PREFIX               │
  │  │   └── bin/teamagent  ← installed binary             │
  │  ├── project/       ← sandbox PROJECT ROOT             │
  │  │   ├── CLAUDE.md  ← compiled by teamagent init       │
  │  │   ├── AGENTS.md  → CLAUDE.md (symlink)             │
  │  │   ├── .claude/settings.local.json ← hooks registered│
  │  │   ├── .codex/skills/ ← Codex skill symlinks        │
  │  │   └── .teamagent/knowledge.db ← project rules DB   │
  │  └── tmp/                                               │
  └─────────────────────────────────────────────────────────┘
```

# TeamBrain Local Sandbox — Settings Reference for LiuShiyuMath

**Owner**: LiuShiyuMath  
**Created**: 2026-05-02  
**Root**: `/Users/m1/projects/TeamBrain/.sandbox/`

## Path Reference

| Component | Sandbox Path |
|-----------|-------------|
| Sandbox root | `/Users/m1/projects/TeamBrain/.sandbox/` |
| User home | `/Users/m1/projects/TeamBrain/.sandbox/home/` |
| Claude home (`~/.claude`) | `/Users/m1/projects/TeamBrain/.sandbox/home/.claude/` |
| Claude settings.json | `/Users/m1/projects/TeamBrain/.sandbox/home/.claude/settings.json` |
| npm prefix | `/Users/m1/projects/TeamBrain/.sandbox/npm/` |
| teamagent binary | `/Users/m1/projects/TeamBrain/.sandbox/npm/bin/teamagent` |
| Sandbox project root | `/Users/m1/projects/TeamBrain/.sandbox/project/` |
| Project hooks config | `/Users/m1/projects/TeamBrain/.sandbox/project/.claude/settings.local.json` |
| Project knowledge DB | `/Users/m1/projects/TeamBrain/.sandbox/project/.teamagent/knowledge.db` |
| Global teamagent DB | `/Users/m1/projects/TeamBrain/.sandbox/home/.teamagent/global.db` |
| Compiled CLAUDE.md | `/Users/m1/projects/TeamBrain/.sandbox/project/CLAUDE.md` |

## Installed Version

```
teamagent 0.10.1  (installed from packages/teamagent, built locally)
```

## How to Reproduce

```bash
# From TeamBrain repo root
SANDBOX_NPM=/Users/m1/projects/TeamBrain/.sandbox/npm
SANDBOX_HOME=/Users/m1/projects/TeamBrain/.sandbox/home
SANDBOX_PROJ=/Users/m1/projects/TeamBrain/.sandbox/project

# Build first
pnpm build:publish

# Install into sandbox npm prefix
npm install -g packages/teamagent \
  --prefix "$SANDBOX_NPM" \
  --cache "$SANDBOX_NPM/.cache" \
  --ignore-scripts

# Init in sandbox project
cd "$SANDBOX_PROJ"
HOME="$SANDBOX_HOME" \
PATH="$SANDBOX_NPM/bin:$PATH" \
"$SANDBOX_NPM/bin/teamagent" init --target=both

# Verify
HOME="$SANDBOX_HOME" "$SANDBOX_NPM/bin/teamagent" doctor
```

## Environment Variables for Sandbox Session

```bash
export HOME=/Users/m1/projects/TeamBrain/.sandbox/home
export NPM_CONFIG_PREFIX=/Users/m1/projects/TeamBrain/.sandbox/npm
export PATH="$NPM_CONFIG_PREFIX/bin:$PATH"
```

## Notes

- `--ignore-scripts` skips native bindings (`sharp`, `tree-sitter-*`); all core teamagent features work without them.
- The sandbox is `.gitignore`d from the main repo (add `.sandbox/` to `.gitignore` if not already).
- `doctor` output should show all ✅ checks; the sharp warning on init is cosmetic only.
