#!/usr/bin/env bash
# Verify: 6-source rule ingestion pipeline
# The ingest command supports 6 sources:
#   insights, npm-audit, pr-review, git-hotspot, ci-failure, candidates
# (defined in packages/cli/src/commands/ingest.ts as IngestSource enum)
# We also confirm pitfall + importer sources exist in the codebase.
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
cd "$REPO_ROOT"

mkdir -p docs/features/six-source-ingest

FAIL=0

# Primary check: IngestSource type in ingest.ts covers the 6 CLI sources
INGEST_TS="packages/cli/src/commands/ingest.ts"

for keyword in "insights" "npm-audit" "pr-review" "git-hotspot" "ci-failure" "candidates"; do
  if grep -q "\"$keyword\"" "$INGEST_TS"; then
    echo "  [OK] ingest source '$keyword' found in $INGEST_TS"
  else
    echo "  [FAIL] ingest source '$keyword' NOT found in $INGEST_TS"
    FAIL=1
  fi
done

# Secondary check: pitfall + importer sources exist in CLI commands
if grep -rq '"pitfall"' packages/cli/src/commands/; then
  echo "  [OK] pitfall source found"
else
  echo "  [FAIL] pitfall source NOT found"
  FAIL=1
fi

if grep -rq '"importer"' packages/core/src/importer/; then
  echo "  [OK] importer source found"
else
  echo "  [FAIL] importer source NOT found"
  FAIL=1
fi

if [ "$FAIL" -ne 0 ]; then
  echo "FAIL: one or more ingest sources missing"
  exit 1
fi

echo "VERIFIED: 6-source ingestion pipeline PASS"
