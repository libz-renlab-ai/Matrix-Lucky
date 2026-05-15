#!/usr/bin/env bash
# Verify: npm install -g entrypoint
set -euo pipefail
REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
echo "=== npm-install verify ==="

# Check that the bin field in package.json contains "teamagent"
BIN_OUTPUT="$(node -e "console.log(JSON.stringify(require('${REPO_ROOT}/packages/cli/package.json').bin))")"
echo "bin field: ${BIN_OUTPUT}"

if echo "${BIN_OUTPUT}" | grep -q "teamagent"; then
  echo "bin field contains 'teamagent': PASS"
else
  echo "FAIL: bin field does not contain 'teamagent'"
  exit 1
fi

# Check name field exists
if grep -q '"name"' "${REPO_ROOT}/packages/cli/package.json"; then
  echo "package.json has name field: PASS"
else
  echo "FAIL: package.json missing name field"
  exit 1
fi

echo "VERIFIED: npm install -g entrypoint PASS"
