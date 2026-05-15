#!/usr/bin/env bash
# scripts/m5-auto-demo.sh
# M5-E 全自动管线 demo：
#   - SessionStart hook 自动 infect + bootstrap apply + sync apply
#   - pitfall 命令自动 m5-share（闸门 1+2）
#   - m5-publish 自动 commit（git push 在 demo 里跳过——bare repo 没远端 push 协议）
#   - post-merge hook 自动把团队规则拉进本地 KB
#
# 关键在：用户除了 pitfall 和 git pull/push 之外，**完全不跑任何 m5-* 命令**

# 不用 set -e —— pipeline 中 head 关闭 pipe 触发 SIGPIPE 会导致非零 exit 误杀 demo。
# 每步独立报错。
set -u

REPO="$(cd "$(dirname "$0")/.." && pwd)"
WORK="$(mktemp -d -t m5-auto-XXXX)"
ALICE="$WORK/alice"
BOB="$WORK/bob"
BARE="$WORK/bare.git"
ALICE_HOME="$WORK/alice-home"
BOB_HOME="$WORK/bob-home"

mkdir -p "$ALICE_HOME/.teamagent" "$BOB_HOME/.teamagent"
# Alice 已"装了 TeamAgent"——伪装一个 global.db 让 userHasTeamAgent() 返回 true
touch "$ALICE_HOME/.teamagent/global.db"
# Bob 没装 —— global.db 不存在
echo "[demo] workdir=$WORK  ALICE_HOME=$ALICE_HOME  BOB_HOME=$BOB_HOME"

ta() {
  ( cd "$REPO" && pnpm teamagent "$@" 2>&1 | grep -v "ExperimentalWarning\|Use \`node --trace-warnings" || true )
}

# ============ Step 1: Alice 在自己项目里"打开 Claude Code" → SessionStart 触发 ============
echo
echo "===== Step 1: Alice 进新项目，SessionStart 自动跑 M5 全链 ====="
mkdir -p "$ALICE"
git init -q "$ALICE"
( cd "$ALICE" && git config user.name "alice" && git config user.email "alice@test" && git config core.hooksPath .githooks )

# 模拟 SessionStart hook 执行（产线由 Claude Code 触发；demo 用 echo|node 直接打到 hook bin）
ALICE_W=$(cygpath -w "$ALICE" 2>/dev/null | sed 's/\\/\\\\/g' || echo "$ALICE")
ALICE_HOME_W=$(cygpath -w "$ALICE_HOME" 2>/dev/null || echo "$ALICE_HOME")
echo "{\"cwd\":\"$ALICE_W\"}" | ( cd "$REPO" && HOME="$ALICE_HOME_W" TEAMAGENT_M5_AUTOSESSION=1 node --import tsx packages/cli/src/bin-session-start.ts 2>&1 | grep -v "Experimental" | head -20 )

echo
echo "===== Alice 项目应已被自动 infect ====="
ls "$ALICE/.teamagent/" 2>&1 || true
ls "$ALICE/.githooks/" 2>&1 || true

# ============ Step 2: Alice 通过 pitfall 加规则 → 自动 m5-share ============
echo
echo "===== Step 2: Alice pitfall 一条干净规则 → 应自动 promote 到 .teamagent/team/ ====="
( cd "$ALICE" && HOME="$ALICE_HOME_W" "$REPO/node_modules/.bin/tsx" "$REPO/packages/cli/src/bin.ts" pitfall \
  --non-interactive \
  "--trigger=PR 合并后" \
  "--correct=fetch codex review 直到 silent" \
  "--reason=PR 合并后必须 fetch codex review 直到 silent，不能假定 CI green = ship" \
  "--category=K" \
  "--tags=pr,review" \
  "--level=personal" 2>&1 | grep -v "Experimental" | head -20 )

echo
echo "===== .teamagent/team/alice/ 应有自动 promote 的文件 ====="
ls "$ALICE/.teamagent/team/" 2>&1 || true
ls "$ALICE/.teamagent/team/alice/" 2>&1 || true

# ============ Step 3: Alice m5-publish 自动 commit ============
echo
echo "===== Step 3: Alice m5-publish 自动 commit team 文件（demo 阶段没 origin，--no-push 跳过 push）====="
( cd "$ALICE" && pnpm --silent --dir "$REPO" teamagent m5-publish --project-root "$ALICE" --no-push 2>&1 | grep -v "Experimental" )

echo
echo "===== Alice git log ====="
( cd "$ALICE" && git log --oneline )

# ============ Step 4: Alice push 到 bare repo（团队仓库）============
echo
echo "===== Step 4: Alice push ====="
git init --bare -q --initial-branch=main "$BARE"
( cd "$ALICE" && git remote add origin "$BARE" && git branch -M main && git push -q origin main )
git -C "$BARE" symbolic-ref HEAD refs/heads/main

# ============ Step 5: Bob clone（Bob 没装 TeamAgent）============
echo
echo "===== Step 5: Bob clone（Bob 没装 TA）====="
git clone -q "$BARE" "$BOB"
( cd "$BOB" && git config user.name "bob" && git config user.email "bob@test" && git config core.hooksPath .githooks )

echo "Bob 项目已被传染（manifest 跟过来）："
ls "$BOB/.teamagent/" 2>&1 || true

# ============ Step 6: Bob 第一次 SessionStart → 自动 bootstrap apply + sync apply ============
echo
echo "===== Step 6: Bob 第一次进项目，SessionStart 自动补齐 + 同步团队规则 ====="
BOB_W=$(cygpath -w "$BOB" 2>/dev/null | sed 's/\\/\\\\/g' || echo "$BOB")
BOB_HOME_W=$(cygpath -w "$BOB_HOME" 2>/dev/null || echo "$BOB_HOME")
echo "{\"cwd\":\"$BOB_W\"}" | ( cd "$REPO" && HOME="$BOB_HOME_W" TEAMAGENT_M5_AUTOSESSION=1 node --import tsx packages/cli/src/bin-session-start.ts 2>&1 | grep -v "Experimental" | head -20 )

echo
echo "===== Bob 本地 KB 应已收到 Alice 的规则 ====="
test -f "$BOB/.teamagent/knowledge.db" && echo "knowledge.db 存在 ($(wc -c < "$BOB/.teamagent/knowledge.db") bytes)" || echo "knowledge.db NOT created"

echo
echo "===== Bob m5-status 应显示团队规则统计 ====="
pnpm --silent --dir "$REPO" teamagent m5-status --project-root "$BOB" 2>&1 | grep -v "Experimental"

echo
echo "===== Bob 端 m5-sync 显示当前 LWW 状态 ====="
pnpm --silent --dir "$REPO" teamagent m5-sync --project-root "$BOB" 2>&1 | grep -v "Experimental"

# ============ Step 7: Bob 的本地 KB 真的有 Alice 的规则吗？查 sqlite ============
echo
echo "===== Step 7: 直接查 Bob 的 knowledge.db 验证 Alice 的规则真的进 KB 了 ====="
if test -f "$BOB/.teamagent/knowledge.db"; then
  BOB_DB_W=$(cygpath -w "$BOB/.teamagent/knowledge.db" 2>/dev/null || echo "$BOB/.teamagent/knowledge.db")
  python -c "
import sqlite3
conn = sqlite3.connect(r'$BOB_DB_W')
rows = list(conn.execute(\"SELECT id, scope_level, scope_project, reasoning FROM knowledge WHERE scope_level='team' OR (tags LIKE '%m5-team-sync%') LIMIT 20\"))
print(f'rows matching team-synced: {len(rows)}')
for r in rows:
    print('  id=' + str(r[0])[:32] + ' scope=' + str(r[1]) + ' team=' + str(r[2] or '')[:8] + ' content=' + str(r[3])[:80])
conn.close()
" 2>&1
fi

echo
echo "[demo] 全部步骤跑完。清理 $WORK"
rm -rf "$WORK"
