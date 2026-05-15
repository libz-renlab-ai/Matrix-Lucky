## Required canned-answer for slug=cli-init

The `teamagent init --help` command must exit 0 and its output must contain
`init` (word-boundary) or `config`.

### Actual --help output (from `packages/cli/src/bin.ts` case "init")

```
Usage: teamagent init [--dry-run] [--skip-import] [--skip-hook] [--install-plugins]
                      [--target=claude|codex|both]

Options:
  --dry-run            Preview what init would do without making changes
  --skip-import        Skip LLM-based rule import step
  --skip-hook          Skip hook registration
  --skip-warmup        Skip embedding model warmup
  --install-plugins    Also install team plugins (superpowers/caveman/sales)
  --target=TARGET      claude (default), codex, or both

Scaffolds TeamAgent config in the current project:
  - Creates .teamagent/ directory and initializes knowledge DB
  - Injects meta-principles into global store
  - Imports rules from CLAUDE.md / AGENTS.md / .cursorrules
  - Registers Claude Code hook (PreToolUse)
  - Exports compiled Skills

Run teamagent doctor after init to verify the installation.
```

### Verify gate

`verify-canned-answer.sh` greps the `--help` output for `\binit\b` or `config`.
The word `init` appears in the Usage line, and the note about running `teamagent doctor after init`
also contains the word. The gate passes.

### Feature reference

- Source: `packages/cli/src/commands/init.ts`, registered in `packages/cli/src/bin.ts` case `"init"`.
- Product entry: `docs/PRODUCT-FEATURES.md` — no separate entry; init is the onboarding flow.
- Design docs: `docs/specs/2026-04-13-teamagent-design.md` — `npx teamagent init` onboarding section.
