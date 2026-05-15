#!/usr/bin/env bash
set -euo pipefail

# Installs Claude Code CLI and a compatible claudefast shim for Codex Cloud envs.
# Safe to rerun.

if ! command -v claude >/dev/null 2>&1; then
  npm install -g @anthropic-ai/claude-code
fi

BIN_DIR="${HOME}/.local/bin"
mkdir -p "$BIN_DIR"
PROFILE_FILE="${HOME}/.bashrc"

if [ ! -x "$BIN_DIR/claudefast" ]; then
  cat > "$BIN_DIR/claudefast" <<'SHIM'
#!/usr/bin/env bash
set -euo pipefail
exec claude "$@"
SHIM
  chmod +x "$BIN_DIR/claudefast"
fi

case ":${PATH}:" in
  *":${BIN_DIR}:"*) ;;
  *)
    export PATH="${BIN_DIR}:${PATH}"
    ;;
esac

if [ -f "$PROFILE_FILE" ] && ! grep -Fq 'export PATH="$HOME/.local/bin:$PATH"' "$PROFILE_FILE"; then
  {
    echo ''
    echo '# Added by TeamAgent setup: ensure claudefast shim is on PATH.'
    echo 'export PATH="$HOME/.local/bin:$PATH"'
  } >> "$PROFILE_FILE"
fi

if ! claude -h >/dev/null 2>&1; then
  echo "❌ claude is installed but cannot run 'claude -h'. Check Node/npm global bin setup." >&2
  exit 1
fi

echo "✅ claude: $(command -v claude)"
echo "✅ claudefast: $(command -v claudefast)"
echo "✅ verified: claude -h"
