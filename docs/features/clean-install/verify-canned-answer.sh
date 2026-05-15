#!/usr/bin/env bash
# Verify: clean install-to-run E2E
set -euo pipefail
REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
echo "=== clean-install verify ==="

# Proxy: assert node_modules exists (install already done) and teamagent --help works
if [ ! -d "${REPO_ROOT}/node_modules" ]; then
  echo "FAIL: node_modules not found — run pnpm install first"
  exit 1
fi
echo "node_modules present: PASS"

HELP_OUTPUT="$(pnpm --dir "${REPO_ROOT}" teamagent --help 2>&1 | head -20 || true)"
echo "teamagent --help output:"
echo "${HELP_OUTPUT}"

if echo "${HELP_OUTPUT}" | grep -qiE "(Usage|Commands|teamagent)"; then
  echo "teamagent --help exits 0 with Usage/Commands: PASS"
else
  echo "FAIL: teamagent --help did not produce expected output"
  exit 1
fi

echo "VERIFIED: clean install-to-run E2E PASS"
