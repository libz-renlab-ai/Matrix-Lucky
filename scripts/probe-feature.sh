#!/usr/bin/env bash
# probe-feature.sh — dynamically probe a TeamBrain feature via claudefast.
#
# Usage:
#   bash scripts/probe-feature.sh <feature-name>
#
# Arguments:
#   <feature-name>  Name of the feature to probe (e.g. calibrator-v2,
#                   attribution-bus, multi-tool). Must match a slug in
#                   docs/features/<feature-name>/.
#
# Behavior:
#   Step 1: Run `claudefast -h` and verify required flags are supported.
#           Bail with a clear error if any required flag is absent.
#   Step 2: Run claudefast -p with stream-json to probe the live codebase.
#           The embedded prompt directs claudefast to use Read/Grep/Glob,
#           cite file:line evidence, and refuse to invent symbols.
#   Step 3: Save artifacts under:
#             .fastprobe/feature-<feature>/probe-<UTC-timestamp>/
#               stream.jsonl   — raw stream-json output
#               answer.md      — extracted text answer
#           Print a summary to stdout.
#
# Exit codes:
#   0  — probe succeeded, artifacts written
#   1  — usage error or required claudefast flag absent
#   2  — claudefast probe invocation failed
#
# Environment:
#   CLAUDEFAST_BIN  override path to claudefast binary (default: claudefast in PATH)
#   PROBE_TIMEOUT   seconds before probe is killed (default: 180)

set -euo pipefail

# ── constants ──────────────────────────────────────────────────────────────────
REQUIRED_FLAGS=("--output-format" "--include-partial-messages" "--verbose")
DEFAULT_TIMEOUT=180

# ── helpers ───────────────────────────────────────────────────────────────────
die() { echo "probe-feature: ERROR: $*" >&2; exit 1; }
usage() {
  sed -n '/^# Usage:/,/^$/p' "$0" | grep '^#' | sed 's/^# \?//'
  exit 1
}

# ── parse args ────────────────────────────────────────────────────────────────
[[ $# -ge 1 ]] || usage
FEATURE="$1"
[[ -n "$FEATURE" ]] || die "feature name must not be empty"

# ── locate claudefast ─────────────────────────────────────────────────────────
CF_BIN="${CLAUDEFAST_BIN:-}"
if [[ -z "$CF_BIN" ]]; then
  # Try PATH first, then zsh alias fallback
  if command -v claudefast >/dev/null 2>&1; then
    CF_BIN="$(command -v claudefast)"
  else
    # Try interactive zsh to pick up alias/function definitions
    CF_BIN="zsh-alias"
  fi
fi

# Verify claudefast is reachable at all
if [[ "$CF_BIN" == "zsh-alias" ]]; then
  zsh -i -c "command -v claudefast" >/dev/null 2>&1 \
    || die "claudefast not found on PATH or as a zsh alias/function"
fi

# cf_exec <arg>... — run claudefast with the given args.
# For real binary: exec directly. For zsh-alias: spawn interactive zsh.
cf_exec() {
  if [[ "$CF_BIN" == "zsh-alias" ]]; then
    local quoted_args
    quoted_args="$(printf '%q ' "$@")"
    zsh -i -c "claudefast $quoted_args"
  else
    "$CF_BIN" "$@"
  fi
}

# ── step 1: discover flags ────────────────────────────────────────────────────
echo "probe-feature[$FEATURE]: Step 1 — discovering claudefast flags..."
HELP_OUTPUT="$(cf_exec -h 2>&1 || true)"

if [[ -z "$HELP_OUTPUT" ]]; then
  die "claudefast -h produced no output; cannot verify flags"
fi

MISSING_FLAGS=()
for flag in "${REQUIRED_FLAGS[@]}"; do
  if ! grep -qF -- "$flag" <<<"$HELP_OUTPUT"; then
    MISSING_FLAGS+=("$flag")
  fi
done

if [[ ${#MISSING_FLAGS[@]} -gt 0 ]]; then
  echo "probe-feature: FAIL — these required flags are absent from 'claudefast -h':" >&2
  for f in "${MISSING_FLAGS[@]}"; do
    echo "  $f" >&2
  done
  echo "(claudefast -h output was ${#HELP_OUTPUT} bytes)" >&2
  exit 1
fi

echo "probe-feature[$FEATURE]: all required flags confirmed present"

# ── prepare artifact directory ────────────────────────────────────────────────
TS="$(date -u +%Y%m%dT%H%M%SZ)"
ARTIFACT_DIR=".fastprobe/feature-${FEATURE}/probe-${TS}"
mkdir -p "$ARTIFACT_DIR"

STREAM_LOG="${ARTIFACT_DIR}/stream.jsonl"
ANSWER_MD="${ARTIFACT_DIR}/answer.md"

# ── step 2: run probe ─────────────────────────────────────────────────────────
PROBE_PROMPT="You are probing the TeamBrain codebase for feature: ${FEATURE}.

RULES:
1. Use only Read, Grep (rg/grep), and Glob (find) tools to explore the actual source files.
2. Search in packages/, src/, tests/, docs/features/${FEATURE}/, and any related directories.
3. For every claim, cite the exact file path and line number (file:line) as evidence.
4. If you cannot find a symbol, file, or behavior in the codebase, say 'NOT FOUND in codebase' — do not invent or hallucinate symbols, function names, or file paths.
5. Do not use knowledge from training data alone; ground every answer in what you actually read.

TASK:
Report what the feature '${FEATURE}' does, based solely on what you find in the codebase:
- Entry point files and key functions (with file:line)
- How it is invoked (CLI commands, API calls, hooks)
- What tests exist (with file:line)
- Any known limitations or NOT FOUND items

Start your response with a one-line summary, then provide evidence."

TIMEOUT_VAL="${PROBE_TIMEOUT:-$DEFAULT_TIMEOUT}"

echo "probe-feature[$FEATURE]: Step 2 — running claudefast probe (timeout ${TIMEOUT_VAL}s)..."
echo "  Artifacts: $ARTIFACT_DIR"

# Write a tiny wrapper script so timeout(1) can exec a real binary (bash) even
# when claudefast is only reachable as a zsh alias/function.  timeout cannot
# execve a shell function, but it can execve bash running a script file.
# The prompt is written to a separate file; the wrapper path is baked in as a
# literal so no quoting escapes are needed at wrapper-generation time.
WRAPPER_SCRIPT="${ARTIFACT_DIR}/.run_probe.sh"
PROMPT_FILE="${ARTIFACT_DIR}/.probe_prompt.txt"
printf '%s' "$PROBE_PROMPT" > "$PROMPT_FILE"

# Use printf to write the wrapper — avoids heredoc quoting interactions entirely.
if [[ "$CF_BIN" == "zsh-alias" ]]; then
  # zsh-alias path: wrapper execs interactive zsh so the alias is visible.
  printf '#!/usr/bin/env bash\nexec zsh -i -c '\''claudefast -p --output-format stream-json --include-partial-messages --verbose "$(cat %s)"'\''\n' \
    "$PROMPT_FILE" > "$WRAPPER_SCRIPT"
else
  # Binary path: exec claudefast directly; bake the binary path as a literal.
  printf '#!/usr/bin/env bash\nexec %s -p --output-format stream-json --include-partial-messages --verbose "$(cat %s)"\n' \
    "$CF_BIN" "$PROMPT_FILE" > "$WRAPPER_SCRIPT"
fi
chmod +x "$WRAPPER_SCRIPT"

# Run probe via wrapper; timeout can now exec bash + the wrapper script.
PROBE_EXIT=0
if command -v timeout >/dev/null 2>&1; then
  timeout "$TIMEOUT_VAL" bash "$WRAPPER_SCRIPT" > "$STREAM_LOG" 2>&1 || PROBE_EXIT=$?
else
  bash "$WRAPPER_SCRIPT" > "$STREAM_LOG" 2>&1 || PROBE_EXIT=$?
fi

if [[ $PROBE_EXIT -ne 0 ]]; then
  echo "probe-feature[$FEATURE]: WARN — claudefast exited with code $PROBE_EXIT" >&2
  echo "(stream log size: $(wc -c <"$STREAM_LOG" 2>/dev/null || echo '?') bytes)" >&2
  # Don't exit 2 immediately — partial output may still be useful; let artifact extraction proceed
fi

# ── step 3: extract answer and write report ───────────────────────────────────
echo "probe-feature[$FEATURE]: Step 3 — extracting answer from stream-json..."

# Extract text content from stream-json lines (type=="text" or "assistant" message content)
{
  echo "# Probe Report: ${FEATURE}"
  echo "Generated: ${TS}"
  echo "Probe exit code: ${PROBE_EXIT}"
  echo ""
  echo "## Answer"
  echo ""

  # Parse stream-json: extract assistant text from multiple possible event shapes
  if command -v jq >/dev/null 2>&1 && [[ -s "$STREAM_LOG" ]]; then
    # Shape 1: claudefast -p final result event (.type == "result")
    jq -r 'select(.type == "result") | .result // empty' \
      "$STREAM_LOG" 2>/dev/null | tr -d '\000' || true

    # Shape 2: streaming text deltas
    jq -r '
      select(.type == "content_block_delta" and .delta.type == "text_delta")
      | .delta.text
    ' "$STREAM_LOG" 2>/dev/null | tr -d '\000' || true

    # Shape 3: assistant message content array
    jq -r '
      select(.type == "assistant")
      | .message.content[]?
      | select(.type == "text")
      | .text
    ' "$STREAM_LOG" 2>/dev/null | tr -d '\000' || true
  else
    echo "(jq not available or stream log is empty — raw log at $STREAM_LOG)"
  fi

  echo ""
  echo "## Evidence"
  echo ""
  echo "- Stream log: \`${STREAM_LOG}\`"
  echo "- Probe exit code: ${PROBE_EXIT}"
  STREAM_BYTES="$(wc -c <"$STREAM_LOG" 2>/dev/null | tr -d ' ')"
  echo "- Stream log size: ${STREAM_BYTES} bytes"
  STREAM_LINES="$(wc -l <"$STREAM_LOG" 2>/dev/null | tr -d ' ')"
  echo "- Stream log lines: ${STREAM_LINES}"
} > "$ANSWER_MD"

# ── stdout summary ────────────────────────────────────────────────────────────
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "probe-feature[$FEATURE]: DONE"
echo "  Artifact dir : $ARTIFACT_DIR"
echo "  stream.jsonl : $STREAM_LOG ($(wc -c <"$STREAM_LOG" 2>/dev/null | tr -d ' ') bytes)"
echo "  answer.md    : $ANSWER_MD"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

if [[ $PROBE_EXIT -ne 0 ]]; then
  exit 2
fi
