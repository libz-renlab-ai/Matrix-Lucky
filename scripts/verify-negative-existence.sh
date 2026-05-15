#!/usr/bin/env bash
# Channel #8: negative-existence assertions after a default install
# Inputs:  RUN_ID (required), PREFIX (required — npm install prefix), HOMEDIR (required)
# Outputs: .judge/$RUN_ID/evidence/neg-no-xenova
#          .judge/$RUN_ID/evidence/neg-no-onnx
#          .judge/$RUN_ID/evidence/neg-no-state
set -eu

: "${RUN_ID:?RUN_ID is required}"
: "${PREFIX:?PREFIX is required}"
: "${HOMEDIR:?HOMEDIR is required}"

mkdir -p ".judge/${RUN_ID}/evidence"

EVDIR=".judge/${RUN_ID}/evidence"

# Helper: assert a path does NOT exist
assert_absent() {
  local label="$1"
  local path="$2"
  local pass_msg="$3"
  local fail_msg="$4"
  local outfile="${EVDIR}/${label}"

  if [ ! -e "${path}" ]; then
    echo "${pass_msg}" > "${outfile}"
  else
    echo "${fail_msg} ${path}" > "${outfile}"
  fi
}

# neg-no-xenova: @xenova must not be present
assert_absent \
  "neg-no-xenova" \
  "${PREFIX}/lib/node_modules/@xenova" \
  "PASS no-xenova" \
  "FAIL @xenova present at"

# neg-no-onnx: onnxruntime-node must not be present
assert_absent \
  "neg-no-onnx" \
  "${PREFIX}/lib/node_modules/onnxruntime-node" \
  "PASS no-onnxruntime-node" \
  "FAIL onnxruntime-node present at"

# neg-no-state: .warmup-state.json must not exist
assert_absent \
  "neg-no-state" \
  "${HOMEDIR}/.teamagent/.warmup-state.json" \
  "PASS no-warmup-state" \
  "FAIL .warmup-state.json present at"

# Final exit: non-zero if any assertion file starts with "FAIL "
FAIL_COUNT=$(grep -lE '^FAIL ' "${EVDIR}"/neg-* 2>/dev/null | wc -l | tr -d ' ')
if [ "${FAIL_COUNT}" -gt 0 ]; then
  echo "verify-negative-existence: ${FAIL_COUNT} negative-existence assertion(s) failed" >&2
  exit 1
fi
exit 0
