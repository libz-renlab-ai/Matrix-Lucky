#!/usr/bin/env bash
# scripts/m5-full-demo.sh
# M5-A + M5-B + M5-C + M5-D 完整端到端 demo。
#
# 场景：
#   M5-A: Alice 在干净项目 m5-infect → push 到 bare repo
#   M5-B: Alice 共享一条干净规则（→ promote L2）+ 一条含 secret 的规则（→ sealed L1）
#   M5-A: Bob clone → m5-bootstrap（发现需补齐）
#   M5-D: Bob m5-status 看到 Alice 的共享规则进入了团队
#   M5-C: Bob 修改 Alice 的规则（跨 author edit）+ 删一条
#   M5-C: Bob push → Alice pull → m5-sync 看 LWW 合并结果
#
# 跑法（在 worktree 根）：
#   bash scripts/m5-full-demo.sh

set -euo pipefail

REPO="$(cd "$(dirname "$0")/.." && pwd)"
WORK="$(mktemp -d -t m5-full-demo-XXXX)"
ALICE="$WORK/alice"
BOB="$WORK/bob"
BARE="$WORK/bare.git"

echo "[demo] workdir=$WORK"

ta() {
  ( cd "$REPO" && pnpm teamagent "$@" 2>&1 | grep -v "ExperimentalWarning\|Use \`node --trace-warnings" || true )
}

# ============ M5-A: Alice infect + push ============
echo
echo "===== M5-A: Alice infect ====="
mkdir -p "$ALICE"
git init -q "$ALICE"
( cd "$ALICE" && git config user.name "alice" && git config user.email "alice@test" )
ta m5-infect --project-root "$ALICE" --author alice --teamagent-version 0.9.4

# ============ M5-B: 共享 + 闸门 ============
echo
echo "===== M5-B: Alice 共享规则（闸门 1+2 演示）====="

echo
echo "[case 1] 干净流程规则 → 期待 promote_to_l2"
ta m5-share --project-root "$ALICE" \
  --text "PR 后必须 fetch codex review 直到 silent — 不能假定 CI green = ship" \
  --rule-id "R-postpr" --author alice --now "2026-05-06T10:00:00Z"

echo
echo "[case 2] 含 OpenAI sk- token → 期待 seal_in_l1（永封）"
ta m5-share --project-root "$ALICE" \
  --text "API key=sk-abcdef1234567890ABCDEFghijkl 用这个" \
  --rule-id "R-leaked-token" --author alice --now "2026-05-06T10:01:00Z"

echo
echo "[case 3] 含本机绝对路径 → 期待 personal/sealed"
ta m5-share --project-root "$ALICE" \
  --text "我电脑的 db 密码在 /Users/alice/.config/db.json" \
  --rule-id "R-private-path" --author alice --now "2026-05-06T10:02:00Z"

echo
echo "===== Alice 项目结构（应只见 R-postpr 进 L2）====="
ls "$ALICE/.teamagent/team/" 2>/dev/null || true
ls "$ALICE/.teamagent/team/alice/" 2>/dev/null || true

# ============ M5-A: commit + push ============
echo
echo "===== Alice commit + push ====="
( cd "$ALICE" && git add . && git commit -qm "feat: infect + share R-postpr" )
git init --bare -q --initial-branch=main "$BARE"
( cd "$ALICE" && git remote add origin "$BARE" && git branch -M main && git push -q origin main )
git -C "$BARE" symbolic-ref HEAD refs/heads/main

# ============ M5-A: Bob clone + bootstrap ============
echo
echo "===== M5-A: Bob clone + bootstrap ====="
git clone -q "$BARE" "$BOB"
( cd "$BOB" && git config user.name "bob" && git config user.email "bob@test" )
ta m5-bootstrap --project-root "$BOB" --check || true   # exit 2 = 需补齐，正常

# ============ M5-D: Bob status ============
echo
echo "===== M5-D: Bob m5-status ====="
ta m5-status --project-root "$BOB"

# ============ M5-C: Bob 跨 author 修改 + 删除 ============
echo
echo "===== M5-C: Bob 改写 Alice 的 R-postpr ====="
ta m5-share --project-root "$BOB" \
  --text "PR 后必须 fetch codex review 直到 silent — Bob 补充：建议 1 分钟后再 retry" \
  --rule-id "R-postpr" --scope team --author bob --now "2026-05-06T11:00:00Z"

echo
echo "===== M5-C: Bob 写一条新规则 ====="
ta m5-share --project-root "$BOB" \
  --text "新增 Port 必须先写契约测试再写实现，避免实现欺骗测试" \
  --rule-id "R-port-contract" --scope team --author bob --now "2026-05-06T11:05:00Z"

echo
echo "===== M5-C: m5-sync 报告 LWW 合并（Bob 这边）====="
ta m5-sync --project-root "$BOB"

echo
echo "===== Bob commit + push ====="
( cd "$BOB" && git add . && git commit -qm "feat: edit R-postpr + add R-port-contract" )
( cd "$BOB" && git push -q origin main )

# ============ M5-C: Alice pull + sync ============
echo
echo "===== Alice pull ====="
( cd "$ALICE" && git pull -q origin main )

echo
echo "===== M5-C: Alice m5-sync 看 LWW 合并 ====="
ta m5-sync --project-root "$ALICE"

# ============ M5-C: Alice 删除 Bob 改的 R-postpr ============
echo
echo "===== M5-C: Alice 删除 R-postpr（任意人删任意规则）====="
ta m5-delete --project-root "$ALICE" --rule-id "R-postpr" --by alice \
  --reason "已经过时" --now "2026-05-06T12:00:00Z"

echo
echo "===== Alice 端 m5-sync 应见 R-postpr=tombstone, R-port-contract=alive ====="
ta m5-sync --project-root "$ALICE"

# ============ M5-C: alive resurrect 测试 ============
echo
echo "===== M5-C: Bob 把 R-postpr 改回（resurrect）====="
ta m5-share --project-root "$BOB" \
  --text "PR 后必须 fetch codex review 直到 silent — Bob 改回，仍然有用" \
  --rule-id "R-postpr" --scope team --author bob --now "2026-05-06T13:00:00Z"

# 模拟 Alice 收到 Bob 的复活
mkdir -p "$ALICE/.teamagent/team/bob"
cp "$BOB/.teamagent/team/bob/R-postpr.json" "$ALICE/.teamagent/team/bob/R-postpr.json"

echo
echo "===== Alice 端 m5-sync：R-postpr 应该 resurrect 为 alive ====="
ta m5-sync --project-root "$ALICE"

# ============ Final M5-D status ============
echo
echo "===== M5-D: Alice 端最终 m5-status ====="
ta m5-status --project-root "$ALICE"

echo
echo "[demo] 全部场景跑通。清理 $WORK"
rm -rf "$WORK"
