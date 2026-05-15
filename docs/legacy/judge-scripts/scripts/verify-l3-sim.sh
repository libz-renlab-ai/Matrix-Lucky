#!/usr/bin/env bash
# L3 模拟：用我们自己的 hook bundle 扮演 Claude Code 的调用者。
set -e

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
HOOK="$REPO_ROOT/packages/cli/dist/bin-pre-tool-use.cjs"
EVENTS=~/.teamagent/events.jsonl
INITIAL_LINES=$(wc -l < "$EVENTS" 2>/dev/null || echo 0)
TRANSCRIPT_PATH="$(mktemp)"

# ---- 测试 1: Bash 下载类命令 ----
T1=$(node -e 'const cwd=process.argv[1]; const transcript_path=process.argv[2]; process.stdout.write(JSON.stringify({session_id:"sim-v1",hook_event_name:"PreToolUse",cwd,permission_mode:"default",transcript_path,tool_name:"Bash",tool_input:{command:"wget --version"},tool_use_id:"t1"}));' "$REPO_ROOT" "$TRANSCRIPT_PATH")
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "测试 1: Bash / download-like command"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
R1=$(echo "$T1" | node "$HOOK")
if echo "$R1" | grep -q "先检查下载目录"; then
  echo "✅ HIT: 命中 'check before download' 规则"
  echo "$R1" | node -e "let d=''; process.stdin.on('data',c=>d+=c); process.stdin.on('end',()=>{const o=JSON.parse(d);process.stdout.write('  permissionDecision: '+(o.hookSpecificOutput&&o.hookSpecificOutput.permissionDecision)+'\n');process.stdout.write('  systemMessage 前 60 字: '+String(o.systemMessage||'').slice(0,60)+'...\n')})"
else
  echo "❌ MISS: 未命中"
  echo "$R1"
fi
echo ""

# ---- 测试 2: Write tool with console.log content ----
T2=$(node -e 'const path=require("node:path"); const cwd=process.argv[1]; const transcript_path=process.argv[2]; process.stdout.write(JSON.stringify({session_id:"sim-v2",hook_event_name:"PreToolUse",cwd,permission_mode:"default",transcript_path,tool_name:"Write",tool_input:{file_path:path.join(cwd,"x.ts"),content:"console.log(1)"},tool_use_id:"t2"}));' "$REPO_ROOT" "$TRANSCRIPT_PATH")
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "测试 2: Write / file with team-forbidden pattern"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
R2=$(echo "$T2" | node "$HOOK")
if echo "$R2" | grep -q "AttributionBus\|trace"; then
  echo "✅ HIT: 命中 'no console.log in hook code' team 规则"
  echo "$R2" | node -e "let d=''; process.stdin.on('data',c=>d+=c); process.stdin.on('end',()=>{const o=JSON.parse(d);process.stdout.write('  permissionDecision: '+(o.hookSpecificOutput&&o.hookSpecificOutput.permissionDecision)+'\n')})"
else
  echo "❌ MISS: 未命中 (可能是 scope 过滤了)"
  echo "  result: $R2"
fi
echo ""

# ---- 测试 3: Edit tool adding fs import in core ----
T3=$(node -e 'const cwd=process.argv[1]; const transcript_path=process.argv[2]; process.stdout.write(JSON.stringify({session_id:"sim-v3",hook_event_name:"PreToolUse",cwd,permission_mode:"default",transcript_path,tool_name:"Edit",tool_input:{file_path:"packages/core/src/scorer.ts",old_string:"X",new_string:"import fs from \"node:fs\""},tool_use_id:"t3"}));' "$REPO_ROOT" "$TRANSCRIPT_PATH")
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "测试 3: Edit / add forbidden pattern to core file"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
R3=$(echo "$T3" | node "$HOOK")
if echo "$R3" | grep -q "adapter\|纯函数\|IO"; then
  echo "✅ HIT: 命中 'no fs in core' team 规则"
else
  echo "❌ MISS"
  echo "  result: $R3"
fi
echo ""

# ---- 事件留痕核对 ----
FINAL_LINES=$(wc -l < "$EVENTS")
NEW=$((FINAL_LINES - INITIAL_LINES))
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "事件留痕: 本次测试新增 $NEW 条 (events.jsonl 从 $INITIAL_LINES → $FINAL_LINES 行)"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "最后 6 条事件（应该包含本次的 3 个 intervention）:"
tail -6 "$EVENTS" | node -e "
  const lines = require('fs').readFileSync(0,'utf-8').split(/\r?\n/).filter(Boolean);
  for (const l of lines) {
    const e = JSON.parse(l);
    const t = e.tool ? e.tool.name : '-';
    console.log('  ' + e.timestamp + '  ' + e.kind.padEnd(20) + '  ' + t + '  session=' + (e.session_id||'-'));
  }
"
