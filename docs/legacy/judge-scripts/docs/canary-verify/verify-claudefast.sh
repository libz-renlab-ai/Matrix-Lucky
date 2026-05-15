#!/usr/bin/env zsh
# Verifier 1/3: claudefast (claude code, MiniMax fast profile) queries its own
# in-memory skill registry for a skill named "canary" and emits a normalized
# JSON matching docs/canary-verify/schema.json.
#
# Crucial: this script DENIES Read/Bash/Glob/Grep/Edit/Write/NotebookEdit so
# the model literally cannot open the SKILL.md file. The answer must come from
# the runtime's registered skill list — the only thing this verifier is
# supposed to be checking.
#
# Pre-step (per spec): MODULE --help first.
# Output: docs/canary-verify/runs/claudefast.json (extracted JSON only)
#
# This script MUST be run from the repo root.

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
cd "$REPO_ROOT"

OUT_DIR="docs/canary-verify/runs"
mkdir -p "$OUT_DIR"

SKILL_PATH="$REPO_ROOT/.claude/skills/canary/SKILL.md"
SCHEMA_PATH="$REPO_ROOT/docs/canary-verify/schema.json"
PROMPT_TMPL="$REPO_ROOT/docs/canary-verify/prompt.tmpl"

[[ -f "$SKILL_PATH"   ]] || { echo "FATAL: $SKILL_PATH missing" >&2; exit 1; }
[[ -f "$SCHEMA_PATH"  ]] || { echo "FATAL: $SCHEMA_PATH missing" >&2; exit 1; }
[[ -f "$PROMPT_TMPL"  ]] || { echo "FATAL: $PROMPT_TMPL missing" >&2; exit 1; }

# Load claudefast function from interactive zsh.
emulate -L zsh
setopt local_options
source "${ZDOTDIR:-$HOME}/.zshrc" 2>/dev/null || true
type claudefast >/dev/null 2>&1 || { echo "FATAL: claudefast not loaded" >&2; exit 1; }

echo "[1/3] MODULE --help (claude)"
claude --help >"$OUT_DIR/claudefast.help.txt" 2>&1
echo "       wrote $OUT_DIR/claudefast.help.txt ($(wc -l <"$OUT_DIR/claudefast.help.txt") lines)"

PROMPT="$(cat "$PROMPT_TMPL")"
SCHEMA_JSON="$(cat "$SCHEMA_PATH")"

echo "[2/3] claudefast -p with file/exec tools DENIED, --json-schema enforced"
RAW="$OUT_DIR/claudefast.raw.json"
DEBUG="$OUT_DIR/claudefast.debug.log"
claudefast -p \
  --debug-file "$DEBUG" \
  --output-format json \
  --json-schema "$SCHEMA_JSON" \
  --permission-mode acceptEdits \
  --disallowedTools "Read,Bash,Glob,Grep,Edit,Write,NotebookEdit,Task" \
  -- "$PROMPT" >"$RAW" 2>"$OUT_DIR/claudefast.stderr.log"
rm -f "$OUT_DIR/latest"

grep -F "Loading skills from:" "$DEBUG" | grep -F "$REPO_ROOT/.claude/skills" >/dev/null || {
  echo "FATAL: Claude Code did not load project skill dir $REPO_ROOT/.claude/skills" >&2
  echo "       see $DEBUG" >&2
  exit 1
}
grep -F "skill 'canary' from projectSettings" "$DEBUG" >/dev/null || {
  echo "FATAL: Claude Code did not register projectSettings skill 'canary'" >&2
  echo "       see $DEBUG" >&2
  exit 1
}

echo "[3/3] extract .result, take first JSON object only, normalize"
EXTRACTED="$OUT_DIR/claudefast.json"
# .result may include trailing noise from Claude Code's stop hook
# (e.g. a <laziness-self-report> block). Use raw_decode to consume
# only the first JSON value and ignore everything after.
jq -e -r '.result' "$RAW" \
  | python3 -c '
import sys, json
text = sys.stdin.read().strip()
obj, _ = json.JSONDecoder().raw_decode(text)
print(json.dumps(obj, sort_keys=True, indent=2))
' >"$EXTRACTED"

echo "OK -> $EXTRACTED"
echo
cat "$EXTRACTED"
