#!/usr/bin/env bash
# scripts/m5-demo.sh
# M5-A walking skeleton demo:
#   1. 在临时项目里跑 teamagent m5-infect
#   2. 验证 manifest + 共享层骨架已就位
#   3. 把项目 git init + commit + 模拟 push（local bare repo）
#   4. 在另一个临时目录 clone
#   5. 跑 teamagent m5-bootstrap，确认它读到了 manifest 并报告 diff
#
# 跑法（在 worktree 根目录）：
#   bash scripts/m5-demo.sh

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
WORKDIR="$(mktemp -d -t m5-demo-XXXX)"
echo "[m5-demo] workdir: $WORKDIR"

ALICE="$WORKDIR/alice-project"
BOB="$WORKDIR/bob-clone"
BARE="$WORKDIR/bare.git"

mkdir -p "$ALICE"
git init -q "$ALICE"
( cd "$ALICE" && git config user.name "alice" && git config user.email "alice@test" )

# Step 1: infect
( cd "$REPO_ROOT" && pnpm teamagent m5-infect --project-root "$ALICE" --author alice --teamagent-version 0.9.4 )

# Step 2: 验证 artifacts
test -f "$ALICE/.teamagent/manifest.json"   || { echo "missing manifest"; exit 1; }
test -d "$ALICE/.teamagent/team"             || { echo "missing team dir"; exit 1; }
test -d "$ALICE/.teamagent/shared-skills"    || { echo "missing shared-skills dir"; exit 1; }
test -f "$ALICE/.teamagent/shared-claude.md" || { echo "missing shared-claude.md"; exit 1; }
test -f "$ALICE/.githooks/pre-commit"        || { echo "missing pre-commit hook"; exit 1; }
echo "[m5-demo] infect OK"

# 验证 manifest 内容
grep -q '"created_by": "alice"'       "$ALICE/.teamagent/manifest.json" || { echo "manifest missing created_by=alice"; exit 1; }
grep -q '"teamagent_version": "0.9.4"' "$ALICE/.teamagent/manifest.json" || { echo "manifest missing teamagent_version=0.9.4"; exit 1; }
echo "[m5-demo] manifest content OK"

# Step 3: commit + bare-repo "push"
( cd "$ALICE" && git add . && git commit -qm "feat: infect project with TeamAgent contract" )
git init --bare -q --initial-branch=main "$BARE"
( cd "$ALICE" && git remote add origin "$BARE" && git branch -M main && git push -q origin main )
git -C "$BARE" symbolic-ref HEAD refs/heads/main
echo "[m5-demo] push OK"

# Step 4: Bob clones
git clone -q "$BARE" "$BOB"
test -f "$BOB/.teamagent/manifest.json" || { echo "clone missing manifest"; exit 1; }
echo "[m5-demo] clone OK, manifest present"

# Step 5: bootstrap reports diff (exit 2 表示需要补齐，是正常情况)
EXIT=0
( cd "$REPO_ROOT" && pnpm teamagent m5-bootstrap --project-root "$BOB" --check ) || EXIT=$?
echo "[m5-demo] bootstrap exit: $EXIT"
if [ "$EXIT" -ne 2 ]; then
  echo "[m5-demo] expected bootstrap exit code 2 (needs install), got $EXIT"
  exit 1
fi
echo "[m5-demo] bootstrap reported diff as expected"

echo "[m5-demo] all checks passed."
echo "[m5-demo] cleanup: rm -rf $WORKDIR"
rm -rf "$WORKDIR"
