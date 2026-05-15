#!/usr/bin/env bash
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/../../.." && pwd)"

echo "==> [internet-rag] running vitest for packages/core/src/rag"
output="$(cd "$REPO_ROOT" && pnpm vitest run packages/core/src/rag --reporter=basic 2>&1 | tail -10)"
echo "$output"

if echo "$output" | grep -q "Test Files.*0 passed\|FAIL\|Error:"; then
  echo "FAIL: internet RAG tests did not pass"
  exit 1
fi

echo "VERIFIED: internet RAG (paper/blog/docs ranker) PASS"
