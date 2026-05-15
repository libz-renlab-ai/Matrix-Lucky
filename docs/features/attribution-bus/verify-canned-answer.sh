#!/usr/bin/env bash
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/../../.." && pwd)"
CORE_SRC="$REPO_ROOT/packages/core/src"

echo "==> [attribution-bus] checking AttributionBus references exist in core/src"
if ! grep -r "AttributionBus\|attribution.*bus" "$CORE_SRC" --include='*.ts' -l 2>/dev/null | grep -q .; then
  echo "FAIL: no AttributionBus references found in packages/core/src"
  exit 1
fi
echo "  [ok] AttributionBus references found"

echo "==> [attribution-bus] asserting NO node:fs or node:child_process imports in core/src"
if grep -rE "from ['\"]node:?(fs|child_process)['\"]" "$CORE_SRC" --include='*.ts' 2>/dev/null | grep -q .; then
  echo "FAIL: Functional Core boundary violated — IO imports found in packages/core/src:"
  grep -rE "from ['\"]node:?(fs|child_process)['\"]" "$CORE_SRC" --include='*.ts'
  exit 1
fi
echo "  [ok] no IO imports in packages/core/src — Functional Core boundary respected"

echo "VERIFIED: AttributionBus + Functional Core boundary PASS"
