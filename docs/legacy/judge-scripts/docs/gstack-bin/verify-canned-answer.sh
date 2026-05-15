#!/usr/bin/env bash
# Mechanical verifier for the "gstack skills / brain sync bin path" rule.
#
# USE_WHEN: user asks
#   "gstack skills and brain sync bin — project level or user level ?"
# Source rule: CLAUDE.md "Gstack skills 与 brain sync bin 路径" section.

set -euo pipefail

cd "$(git rev-parse --show-toplevel)"

OUT_DIR="docs/gstack-bin"
ANSWER_OUT="$OUT_DIR/.last-verify.out"
ANSWER_CLEAN_OUT="$OUT_DIR/.last-verify.clean.out"
PROMPT="gstack skills and brain sync bin - project level or user level ?"

run_claudefast() {
    local prompt="$1"
    local output="$2"
    local raw
    local err
    local pid
    local elapsed=0

    raw="$(mktemp /tmp/gstack-bin-verify-stdout.XXXXXX)"
    err="$(mktemp /tmp/gstack-bin-verify-stderr.XXXXXX)"

    if command -v claudefast >/dev/null 2>&1; then
        claudefast -p "$prompt" > "$raw" 2> "$err" &
    elif command -v zsh >/dev/null 2>&1; then
        PROMPT_FOR_CLAUDEFAST="$prompt" zsh -i -c 'claudefast -p "$PROMPT_FOR_CLAUDEFAST"' > "$raw" 2> "$err" &
    else
        echo "GSTACK-BIN VERIFY: FAIL"
        echo "neither zsh nor claudefast on PATH"
        exit 1
    fi

    pid=$!
    while kill -0 "$pid" 2>/dev/null; do
        if [ "$elapsed" -ge 45 ]; then
            kill "$pid" 2>/dev/null || true
            sleep 1
            kill -9 "$pid" 2>/dev/null || true
            cat "$err" >> "$raw"
            mv "$raw" "$output"
            echo "GSTACK-BIN VERIFY: FAIL"
            echo "answer probe timed out after 45s"
            cat "$output"
            exit 1
        fi
        sleep 1
        elapsed=$((elapsed + 1))
    done

    if ! wait "$pid"; then
        cat "$err" >> "$raw"
        mv "$raw" "$output"
        return 1
    fi
    mv "$raw" "$output"
}

answer_probe_ok=0
for attempt in 1 2 3; do
    run_claudefast "$PROMPT" "$ANSWER_OUT" || {
        echo "GSTACK-BIN VERIFY: FAIL"
        echo "failed to run answer probe"
        cat "$ANSWER_OUT"
        exit 1
    }
    sed -E '/^Using Node v[0-9.]+$/d;/command not found: starship/d' "$ANSWER_OUT" > "$ANSWER_CLEAN_OUT"
    if grep -Fqi "project level" "$ANSWER_CLEAN_OUT"; then
        answer_probe_ok=1
        break
    fi
    sleep 1
done

if [ "$answer_probe_ok" -ne 1 ]; then
    echo "GSTACK-BIN VERIFY: FAIL"
    echo "answer does not say project level"
    cat "$ANSWER_CLEAN_OUT"
    exit 1
fi

if grep -Eiq '(^|[^a-z])user level([^a-z]|$)' "$ANSWER_CLEAN_OUT" &&
    ! grep -Eiq 'not (use|depend|rely|using).*user level|user level.*(fallback|not used|not depended|不依赖|不用|不沿用|只作为)|不依赖 user level|不用 user level|不沿用 user level' "$ANSWER_CLEAN_OUT"; then
    echo "GSTACK-BIN VERIFY: FAIL"
    echo "answer appears to select user level"
    cat "$ANSWER_CLEAN_OUT"
    exit 1
fi

echo "GSTACK-BIN VERIFY: PASS"
cat "$ANSWER_CLEAN_OUT"
