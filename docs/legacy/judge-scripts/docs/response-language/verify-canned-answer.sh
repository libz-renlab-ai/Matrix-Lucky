#!/usr/bin/env bash
# Mechanical verifier for the TeamBrain response-language rule.
#
# USE_WHEN: user asks
#   "based on this project rule, what language agent uses when talk with users and asked in english"
# Source rule: CLAUDE.md "用户沟通语言" section.

set -euo pipefail

cd "$(git rev-parse --show-toplevel)"

OUT_DIR="docs/response-language"
ANSWER_OUT="$OUT_DIR/.last-verify.out"
ANSWER_CLEAN_OUT="$OUT_DIR/.last-verify.clean.out"
PROMPT="based on this project rule, what language agent uses when talk with users and asked in english"

run_claudefast() {
    local prompt="$1"
    local output="$2"

    if command -v claudefast >/dev/null 2>&1; then
        local raw
        local err
        raw="$(mktemp /tmp/response-language-verify-stdout.XXXXXX)"
        err="$(mktemp /tmp/response-language-verify-stderr.XXXXXX)"
        claudefast -p "$prompt" > "$raw" 2> "$err" || {
            cat "$err" >> "$raw"
            mv "$raw" "$output"
            return 1
        }
        mv "$raw" "$output"
    elif command -v zsh >/dev/null 2>&1; then
        local raw
        local err
        raw="$(mktemp /tmp/response-language-verify-stdout.XXXXXX)"
        err="$(mktemp /tmp/response-language-verify-stderr.XXXXXX)"
        PROMPT_FOR_CLAUDEFAST="$prompt" zsh -i -c 'claudefast -p "$PROMPT_FOR_CLAUDEFAST"' > "$raw" 2> "$err" || {
            cat "$err" >> "$raw"
            mv "$raw" "$output"
            return 1
        }
        mv "$raw" "$output"
    else
        echo "RESPONSE-LANGUAGE VERIFY: FAIL"
        echo "neither zsh nor claudefast on PATH"
        exit 1
    fi
}

run_claudefast "$PROMPT" "$ANSWER_OUT" || {
    echo "RESPONSE-LANGUAGE VERIFY: FAIL"
    echo "failed to run answer probe"
    exit 1
}

sed -E '/^Using Node v[0-9.]+$/d;/command not found: starship/d' "$ANSWER_OUT" > "$ANSWER_CLEAN_OUT"

if ! grep -q '中文。' "$ANSWER_CLEAN_OUT"; then
    echo "RESPONSE-LANGUAGE VERIFY: FAIL"
    echo "answer does not contain the required Chinese sentinel"
    cat "$ANSWER_CLEAN_OUT"
    exit 1
fi

if LC_ALL=C grep -q '[A-Za-z]' "$ANSWER_CLEAN_OUT"; then
    echo "RESPONSE-LANGUAGE VERIFY: FAIL"
    echo "answer contains English letters"
    cat "$ANSWER_CLEAN_OUT"
    exit 1
fi

normalized_answer=$(tr -d '\r' < "$ANSWER_CLEAN_OUT" | sed '/^[[:space:]]*$/d')
if [ "$normalized_answer" != "中文。" ]; then
    echo "RESPONSE-LANGUAGE VERIFY: FAIL"
    echo "answer must be exactly: 中文。"
    cat "$ANSWER_CLEAN_OUT"
    exit 1
fi

echo "RESPONSE-LANGUAGE VERIFY: PASS"
cat "$ANSWER_CLEAN_OUT"
