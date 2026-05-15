#!/usr/bin/env bash
# verify-canned-answer.sh — team-promote (scope promotion proxy via migrate-v6 dry-run)
# Asserts that pnpm teamagent migrate-v6 --dry-run exits 0.
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
cd "${REPO_ROOT}"

MIGRATE_OUT=$(pnpm teamagent migrate-v6 --dry-run 2>&1 | tail -10)
MIGRATE_EXIT=$?
echo "${MIGRATE_OUT}"

if [[ ${MIGRATE_EXIT} -ne 0 ]]; then
  echo "FAILED: migrate-v6 --dry-run exited ${MIGRATE_EXIT}" >&2
  exit 1
fi

echo "VERIFIED: team-promote (migrate-v6 dry-run) PASS"
