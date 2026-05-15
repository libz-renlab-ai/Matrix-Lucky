#!/usr/bin/env bash
# Verify: Embedding-based conflict detection (Jaccard ≥ 0.85 in L0 validator)
# Primary: grep for embedding_conflict in l0.ts
# Secondary: run validator tests
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
cd "$REPO_ROOT"

mkdir -p docs/features/embedding-conflict

FAIL=0

# Primary: grep for embedding_conflict keyword in l0.ts
if grep -l "embedding_conflict" packages/core/src/validator/l0.ts > /dev/null 2>&1; then
  echo "  [OK] embedding_conflict keyword found in l0.ts"
else
  echo "  [FAIL] embedding_conflict NOT found in l0.ts"
  FAIL=1
fi

# Also assert Jaccard threshold constant
if grep -q "JACCARD_CONFLICT_THRESHOLD" packages/core/src/validator/l0.ts; then
  echo "  [OK] JACCARD_CONFLICT_THRESHOLD constant found"
else
  echo "  [FAIL] JACCARD_CONFLICT_THRESHOLD NOT found"
  FAIL=1
fi

# Secondary: run validator tests
OUT="$(pnpm vitest run --reporter=basic packages/core/src/validator 2>&1 | tail -10)"
VITEST_EXIT=$?
echo "$OUT"

if [ "$VITEST_EXIT" -ne 0 ]; then
  echo "  [FAIL] validator tests exited $VITEST_EXIT"
  FAIL=1
else
  echo "  [OK] validator tests pass"
fi

if [ "$FAIL" -ne 0 ]; then
  echo "FAIL: embedding-based conflict detection check failed"
  exit 1
fi

echo "VERIFIED: embedding-based conflict detection PASS"
