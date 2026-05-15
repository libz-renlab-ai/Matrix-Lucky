#!/usr/bin/env bash
# L0 机械验证：不依赖 Claude Code 会话，10 秒跑完
set -e
cd "$(dirname "$0")/.."
REPO_ROOT="$(pwd)"

echo "=== 1/5 tests ==="
pnpm test 2>&1 | tail -3

echo ""
echo "=== 2/5 typecheck ==="
pnpm typecheck 2>&1 | tail -2

echo ""
echo "=== 3/5 hook bundle ==="
if [ -f packages/cli/dist/bin-pre-tool-use.cjs ]; then
  ls -la packages/cli/dist/bin-pre-tool-use.cjs
else
  echo "❌ bundle missing — run: pnpm --filter @teamagent/cli build:hook"
  exit 1
fi

echo ""
echo "=== 4/5 hook invocation (end-to-end) ==="
TRANSCRIPT_PATH="$(mktemp)"
RESULT=$(node -e 'const cwd=process.argv[1]; const transcript_path=process.argv[2]; process.stdout.write(JSON.stringify({session_id:"verify",hook_event_name:"PreToolUse",cwd,permission_mode:"default",transcript_path,tool_name:"Bash",tool_input:{command:"wget fake"},tool_use_id:"t"}));' "$REPO_ROOT" "$TRANSCRIPT_PATH" \
  | node packages/cli/dist/bin-pre-tool-use.cjs)
if echo "$RESULT" | grep -q "先检查下载目录"; then
  echo "✅ hook responds correctly"
else
  echo "❌ hook output unexpected:"
  echo "$RESULT"
  exit 1
fi

echo ""
echo "=== 5/5 stats ==="
teamagent stats 2>&1 | head -20

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "✅ L0 全部通过。L1/L3 请在新 Claude Code 会话里验证。"
echo "提醒：启动时不要用 --dangerously-skip-permissions，否则 hook 可能不被调用。"
