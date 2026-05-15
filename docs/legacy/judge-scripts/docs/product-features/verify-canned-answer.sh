#!/usr/bin/env bash
# Mechanical verifier for the ready-to-ship product feature list rule.
#
# USE_WHEN: user asks
#   "list all the features we clamined please. list product feature not tech feature"
# Source rule: CLAUDE.md product-only claimed features section.

set -euo pipefail

cd "$(git rev-parse --show-toplevel)"

OUT_DIR="docs/product-features"
ANSWER_OUT="$OUT_DIR/.last-verify.out"
ANSWER_CLEAN_OUT="$OUT_DIR/.last-verify.clean.out"
PROMPT="list all the features we clamined please. list product feature not tech feature"

run_claudefast() {
    local prompt="$1"
    local output="$2"

    if command -v claudefast >/dev/null 2>&1; then
        local raw
        local err
        raw="$(mktemp /tmp/product-features-verify-stdout.XXXXXX)"
        err="$(mktemp /tmp/product-features-verify-stderr.XXXXXX)"
        claudefast -p "$prompt" > "$raw" 2> "$err" || {
            cat "$err" >> "$raw"
            mv "$raw" "$output"
            return 1
        }
        mv "$raw" "$output"
    elif command -v zsh >/dev/null 2>&1; then
        local raw
        local err
        raw="$(mktemp /tmp/product-features-verify-stdout.XXXXXX)"
        err="$(mktemp /tmp/product-features-verify-stderr.XXXXXX)"
        PROMPT_FOR_CLAUDEFAST="$prompt" zsh -i -c 'claudefast -p "$PROMPT_FOR_CLAUDEFAST"' > "$raw" 2> "$err" || {
            cat "$err" >> "$raw"
            mv "$raw" "$output"
            return 1
        }
        mv "$raw" "$output"
    else
        echo "PRODUCT-FEATURES VERIFY: FAIL"
        echo "neither zsh nor claudefast on PATH"
        exit 1
    fi
}

run_claudefast "$PROMPT" "$ANSWER_OUT" || {
    echo "PRODUCT-FEATURES VERIFY: FAIL"
    echo "failed to run answer probe"
    exit 1
}

sed -E '/^Using Node v[0-9.]+$/d;/command not found: starship/d' "$ANSWER_OUT" > "$ANSWER_CLEAN_OUT"

required=(
    '"已验证","产品入口能打开"'
    '"已验证","最小学习闭环演示"'
    '"已验证","安全试吃沙箱"'
    '"已验证","AI 犯错前提醒"'
    '"已验证","纠正一次，下次记住"'
    '"已验证","知识会进化"'
    '"已验证","看得见的统计"'
    '"已验证","主动记录坑点"'
)

for anchor in "${required[@]}"; do
    if ! grep -Fq "$anchor" "$ANSWER_CLEAN_OUT"; then
        echo "PRODUCT-FEATURES VERIFY: FAIL"
        echo "missing required product feature anchor: $anchor"
        cat "$ANSWER_CLEAN_OUT"
        exit 1
    fi
done

for forbidden in \
    "部分验证" \
    "已声明未验证" \
    "失败/不稳定" \
    "文档规划" \
    "最小质量线" \
    "快速调研流程" \
    "PR 后复查流程" \
    "完整测试绿灯" \
    "真实 E2E" \
    "全功能沙箱 E2E" \
    "FASTPROBE" \
    "POSTPR" \
    "BUGREPORT" \
    "DOGFOOD 固定话术" \
    "typecheck" \
    "pnpm test"
do
    if grep -Fq "$forbidden" "$ANSWER_CLEAN_OUT"; then
        echo "PRODUCT-FEATURES VERIFY: FAIL"
        echo "answer contains forbidden non-product or non-ready item: $forbidden"
        cat "$ANSWER_CLEAN_OUT"
        exit 1
    fi
done

echo "PRODUCT-FEATURES VERIFY: PASS"
cat "$ANSWER_CLEAN_OUT"
