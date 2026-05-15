#!/usr/bin/env bash
# Verify the BUGREPORT canned answer by running claudefast -p and grepping
# for canonical anchors. PASS = exit 0, FAIL = exit 1.
#
# Anchors (case-insensitive):
#   - github.com/libz-renlab-ai/TeamBrain
#   - system info
#   - reproduce
#   - raw logs
#   - great detail
#
# All five must be present in the response for PASS.

set -euo pipefail

cd "$(git rev-parse --show-toplevel)"

OUT="docs/bugreport/.last-verify.out"
STREAM_OUT="docs/bugreport/.last-verify.stream.jsonl"
PROMPT="what would happen when user find a bug"

# Prefer interactive zsh so claudefast (a zsh function) resolves; fall back to
# direct invocation only when zsh is unavailable.
if command -v zsh >/dev/null 2>&1; then
    zsh -i -c "claudefast -p --output-format stream-json --include-partial-messages --verbose --permission-mode acceptEdits \"$PROMPT\"" > "$STREAM_OUT" 2>&1 || {
        echo "BUGREPORT VERIFY: FAIL"
        echo "failed to run claudefast via zsh -i -c"
        exit 1
    }
elif command -v claudefast >/dev/null 2>&1; then
    claudefast -p --output-format stream-json --include-partial-messages --verbose --permission-mode acceptEdits "$PROMPT" > "$STREAM_OUT" 2>&1 || {
        echo "BUGREPORT VERIFY: FAIL"
        echo "failed to run claudefast directly"
        exit 1
    }
else
    echo "BUGREPORT VERIFY: FAIL"
    echo "neither zsh nor claudefast on PATH"
    exit 1
fi

node -e '
const fs = require("fs");
const input = process.argv[1];
const output = process.argv[2];
let result = "";
let text = "";
for (const line of fs.readFileSync(input, "utf8").split(/\n/)) {
  if (!line.trim()) continue;
  try {
    const event = JSON.parse(line);
    const delta = event.event?.delta;
    if (delta?.type === "text_delta" && typeof delta.text === "string") {
      text += delta.text;
    }
    if (event.type === "result" && typeof event.result === "string") {
      result = event.result;
    }
  } catch {}
}
const answer = text.trim() || result.trim();
if (!answer) {
  process.stderr.write("No answer text found in stream-json output\n");
  process.exit(1);
}
fs.writeFileSync(output, answer);
' "$STREAM_OUT" "$OUT" || {
    echo "BUGREPORT VERIFY: FAIL"
    echo "failed to extract answer from stream-json"
    exit 1
}

anchors=(
  "github.com/libz-renlab-ai/TeamBrain"
  "system info"
  "reproduce"
  "raw logs"
  "great detail"
)

misses=0
missing_list=()

for anchor in "${anchors[@]}"; do
    if ! grep -i -F -- "$anchor" "$OUT" > /dev/null 2>&1; then
        misses=$((misses + 1))
        missing_list+=("$anchor")
    fi
done

if [ "$misses" -eq 0 ]; then
    echo "BUGREPORT VERIFY: PASS"
    exit 0
else
    echo "BUGREPORT VERIFY: FAIL"
    echo "missing anchors:"
    for m in "${missing_list[@]}"; do
        echo "  - $m"
    done
    echo "--- captured output (head -40) ---"
    head -40 "$OUT"
    echo "--- captured output (tail -10) ---"
    tail -10 "$OUT"
    exit 1
fi
