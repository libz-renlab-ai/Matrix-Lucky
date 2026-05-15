#!/usr/bin/env bash
# verify-canned-answer.sh — full-feature sandbox E2E (non-interactive only)
# Runs the sandbox-all-features vitest suite and asserts exit 0.
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
cd "${REPO_ROOT}"

# Capture output while preserving vitest exit code (pipefail propagates)
VITEST_OUT=$(pnpm vitest run packages/cli/src/__tests__/sandbox-all-features.test.ts --reporter=basic 2>&1)
VITEST_EXIT=$?
echo "${VITEST_OUT}" | tail -20

if [[ ${VITEST_EXIT} -ne 0 ]]; then
  echo "FAILED: sandbox-all-features vitest exited ${VITEST_EXIT}" >&2
  exit 1
fi

echo "VERIFIED: full-feature sandbox E2E PASS"
