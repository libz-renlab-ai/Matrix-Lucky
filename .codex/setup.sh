#!/usr/bin/env bash
set -euo pipefail

pnpm install --frozen-lockfile

if ! command -v claude >/dev/null 2>&1 && [ -x "./node_modules/.bin/claude" ]; then
  mkdir -p "$HOME/.local/bin"
  ln -sf "$PWD/node_modules/.bin/claude" "$HOME/.local/bin/claude"
  export PATH="$HOME/.local/bin:$PATH"
fi

which claude
claude --version
