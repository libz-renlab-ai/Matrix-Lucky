#!/usr/bin/env bash
# tbrain-verify.sh — TeamBrain RUN -> DUMP -> READ harness binary.
#
# Closes GAP-1 from Real Task #1 evidence: this is the executable harness
# referenced by VERIFY_TEMPLATE.md and TRAPS.md. It is not a wrapper around
# the agent's verbal report; it runs fixed tools, dumps raw JSON to
# .judge/<run_id>/, and validates the committed archive gate. A separate
# LLM judge MUST be invoked outside this binary.
#
# Usage:
#   scripts/verify/tbrain-verify.sh <recipe_id> <run_id> [--task-title "..."]
#
# Required:
#   recipe_id  — must match ^VERIFY-[A-Z]+-\d{3}$
#   run_id     — stable, must match ^[0-9]{8}T[0-9]{6}Z-[a-z0-9-]+$
#                (never contains a commit SHA; per evidence/README.md)
#
# Exit codes:
#   0 = all checks PASS, archive gate satisfied
#   2 = missing_evidence (one or more required files absent or empty)
#   3 = anchor sweep mismatch (key invariants missing in source files)
#   4 = canonical path sweep mismatch (path missing or empty)
#   5 = bad input (recipe_id / run_id format wrong)
set -euo pipefail

# ----------------------------------------------------------------------------
# Argument parsing
# ----------------------------------------------------------------------------
RECIPE_ID="${1:-}"
RUN_ID="${2:-}"
TASK_TITLE="${RECIPE_ID}"
shift 2 2>/dev/null || true
while [ "$#" -gt 0 ]; do
  case "$1" in
    --task-title)
      TASK_TITLE="${2:-}"
      shift 2
      ;;
    *)
      echo "tbrain-verify: unknown option: $1" >&2
      exit 5
      ;;
  esac
done

if [ -z "${RECIPE_ID}" ] || [ -z "${RUN_ID}" ]; then
  echo "usage: scripts/verify/tbrain-verify.sh <recipe_id> <run_id> [--task-title TITLE]" >&2
  exit 5
fi

if ! printf '%s' "${RECIPE_ID}" | grep -Eq '^VERIFY-[A-Z]+-[0-9]{3}$'; then
  echo "tbrain-verify: recipe_id '${RECIPE_ID}' does not match ^VERIFY-[A-Z]+-[0-9]{3}\$" >&2
  exit 5
fi

if ! printf '%s' "${RUN_ID}" | grep -Eq '^[0-9]{8}T[0-9]{6}Z-[a-z0-9-]+$'; then
  echo "tbrain-verify: run_id '${RUN_ID}' does not match ^[0-9]{8}T[0-9]{6}Z-[a-z0-9-]+\$" >&2
  exit 5
fi

EVIDENCE_DIR=".judge/${RUN_ID}"
ARCHIVE_DIR="docs/teambrain/evidence/${RUN_ID}"
mkdir -p "${EVIDENCE_DIR}"

# ----------------------------------------------------------------------------
# RUN — anchor sweep + canonical path sweep + archive gate inspection
# ----------------------------------------------------------------------------
STDOUT_PATH="${EVIDENCE_DIR}/stdout.txt"
STDERR_PATH="${EVIDENCE_DIR}/stderr.txt"
: > "${STDOUT_PATH}"
: > "${STDERR_PATH}"

ANCHOR_REGEX='must stay stable for the run|TASK_TITLE|archive_dir|Output JSON with recipe_id|metrics|missing_evidence|Never append or replace it with a commit SHA'
ANCHOR_PATHS=(
  docs/teambrain/TASK_TEMPLATE.md
  docs/teambrain/VERIFY_TEMPLATE.md
  docs/teambrain/agent_rules/claude.md
  docs/teambrain/evidence/README.md
)
ANCHOR_HITS=0
ANCHOR_FILES_WITH_HITS=0
for f in "${ANCHOR_PATHS[@]}"; do
  if [ -s "$f" ]; then
    hits=$(grep -cE "${ANCHOR_REGEX}" "$f" 2>/dev/null || echo 0)
    ANCHOR_HITS=$((ANCHOR_HITS + hits))
    if [ "${hits}" -gt 0 ]; then
      ANCHOR_FILES_WITH_HITS=$((ANCHOR_FILES_WITH_HITS + 1))
    fi
    printf 'anchor: %s hits=%s\n' "$f" "$hits" >> "${STDOUT_PATH}"
  else
    printf 'anchor: %s MISSING\n' "$f" >> "${STDERR_PATH}"
  fi
done

# Canonical path sweep — STRUCTURE.md authoritative paths.
CANON_PATHS=(
  docs/teambrain/README.md
  docs/teambrain/STRUCTURE.md
  docs/teambrain/TRAPS.md
  docs/teambrain/TRAP_FORMAT.md
  docs/teambrain/TASK_TEMPLATE.md
  docs/teambrain/VERIFY_TEMPLATE.md
  docs/teambrain/CONVERGENCE.md
  docs/teambrain/agent_rules/claude.md
  docs/teambrain/agent_rules/codex.md
  docs/teambrain/evidence/README.md
  docs/teambrain/convergence/first-pass-findings.md
  docs/teambrain/convergence/history.md
)
CANON_OK=0
CANON_MISSING=0
for p in "${CANON_PATHS[@]}"; do
  if [ -s "$p" ]; then
    CANON_OK=$((CANON_OK + 1))
    printf 'canon: %s OK\n' "$p" >> "${STDOUT_PATH}"
  else
    CANON_MISSING=$((CANON_MISSING + 1))
    printf 'canon: %s MISSING\n' "$p" >> "${STDERR_PATH}"
  fi
done

# Archive gate — enforce the 6 required files in docs/teambrain/evidence/<run_id>/.
ARCHIVE_REQUIRED=(
  INDEX.md
  transcript.md
  stdout.txt
  stderr.txt
  failures.md
  judge-summary.json
)
ARCHIVE_PRESENT=0
ARCHIVE_MISSING=0
ARCHIVE_MISSING_LIST=""
for f in "${ARCHIVE_REQUIRED[@]}"; do
  full="${ARCHIVE_DIR}/${f}"
  if [ -s "${full}" ]; then
    ARCHIVE_PRESENT=$((ARCHIVE_PRESENT + 1))
    printf 'archive: %s PRESENT\n' "${full}" >> "${STDOUT_PATH}"
  else
    ARCHIVE_MISSING=$((ARCHIVE_MISSING + 1))
    if [ -n "${ARCHIVE_MISSING_LIST}" ]; then
      ARCHIVE_MISSING_LIST+=" "
    fi
    ARCHIVE_MISSING_LIST+="${f}"
    printf 'archive: %s MISSING\n' "${full}" >> "${STDOUT_PATH}"
  fi
done

# ----------------------------------------------------------------------------
# Exit code precedence (highest wins; bad-input exit 5 already returned above):
#   4 = canon path missing (structural breakage — harness cannot operate correctly)
#   3 = anchor hits below floor (key invariants have disappeared from source)
#   2 = archive gate failed (missing_evidence=true; evidence not yet committed)
# ----------------------------------------------------------------------------
EXIT_CODE=0
MISSING_EVIDENCE=false
if [ "${CANON_MISSING}" -ne 0 ]; then
  EXIT_CODE=4
fi
if [ "${ARCHIVE_MISSING}" -ne 0 ]; then
  MISSING_EVIDENCE=true          # set unconditionally — even when EXIT_CODE is already 4
  if [ "${EXIT_CODE}" -eq 0 ]; then
    EXIT_CODE=2
  fi
fi
# Anchor floor: every anchor file must have at least 1 hit (per-file check, not aggregate sum).
ANCHOR_FLOOR="${#ANCHOR_PATHS[@]}"
if [ "${ANCHOR_FILES_WITH_HITS}" -lt "${ANCHOR_FLOOR}" ]; then
  if [ "${EXIT_CODE}" -eq 0 ]; then
    EXIT_CODE=3
  fi
fi

# ----------------------------------------------------------------------------
# DUMP — raw judge.json + summary mirror under archive (if archive_dir exists).
# ----------------------------------------------------------------------------
# Escape user-controlled strings for safe JSON embedding.
TASK_TITLE_JSON=$(printf '%s' "${TASK_TITLE}" | sed 's/\\/\\\\/g; s/"/\\"/g')
ARCHIVE_MISSING_LIST_JSON=$(printf '%s' "${ARCHIVE_MISSING_LIST}" | sed 's/\\/\\\\/g; s/"/\\"/g')
JUDGE_PATH="${EVIDENCE_DIR}/judge.json"
cat > "${JUDGE_PATH}" <<EOF
{
  "recipe_id": "${RECIPE_ID}",
  "run_id": "${RUN_ID}",
  "task_title": "${TASK_TITLE_JSON}",
  "exit_code": ${EXIT_CODE},
  "metrics": {
    "anchor_hits": ${ANCHOR_HITS},
    "anchor_floor": ${ANCHOR_FLOOR},
    "canonical_paths_ok": ${CANON_OK},
    "canonical_paths_missing": ${CANON_MISSING},
    "anchor_files_with_hits": ${ANCHOR_FILES_WITH_HITS},
    "archive_present": ${ARCHIVE_PRESENT},
    "archive_missing": ${ARCHIVE_MISSING},
    "archive_missing_list": "${ARCHIVE_MISSING_LIST_JSON}"
  },
  "missing_evidence": ${MISSING_EVIDENCE},
  "evidence_dir": "${EVIDENCE_DIR}",
  "archive_dir": "${ARCHIVE_DIR}",
  "stdout_path": "${STDOUT_PATH}",
  "stderr_path": "${STDERR_PATH}",
  "failure_list_path": "${ARCHIVE_DIR}/failures.md"
}
EOF

# Final stdout summary line for callers piping output into log capture.
printf '\nRESULT recipe_id=%s run_id=%s exit_code=%s anchor_hits=%s canon_ok=%s/%s archive_present=%s/%s\n' \
  "${RECIPE_ID}" "${RUN_ID}" "${EXIT_CODE}" \
  "${ANCHOR_HITS}" "${CANON_OK}" "${#CANON_PATHS[@]}" \
  "${ARCHIVE_PRESENT}" "${#ARCHIVE_REQUIRED[@]}" \
  >> "${STDOUT_PATH}"

cat "${STDOUT_PATH}"

exit "${EXIT_CODE}"
