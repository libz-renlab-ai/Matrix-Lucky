```text
   build entry         install path        spawn site
   ───────────         ────────────        ──────────
   tsup CJS  ──────►  dist/bin-uploader.cjs (in repo)
                              │
                              ▼
                        resolveDaemonBin()
                              │
                ┌─────────────┴──────────────┐
                ▼                            ▼
   ~/.teamagent/digital-twin/        packages/digital-twin/
       bin-uploader.cjs              dist/bin-uploader.cjs
       (user-machine,                (dev / fresh worktree
        self-installed                fallback)
        on first hit)
```

# Plan: F1 — build & install bin-uploader.cjs so daemon actually spawns

## Task description

修复 issue #146 post-mortem F1：daemon 二进制 `bin-uploader.cjs` 在 build pipeline 里不存在，导致 `tap-session.ts` 的 spawn 分支永远走 `daemonBin === null` 静默跳过；production 上 0 transcripts uploaded。

**做什么**：
- (1) 把 `src/bin-uploader.ts` 加入 `packages/digital-twin/` 的 build entry，产出 `dist/bin-uploader.cjs`（CJS, node16 target，与 `bin-prod-server.cjs` 同模式）。
- (2) 在 `bin-digital-twin-tap.ts` 的 `resolveDaemonBin` 里加一条 fallback：优先找用户机 `~/.teamagent/digital-twin/bin-uploader.cjs`（已 install 的版本），fallback 到 monorepo `dist/bin-uploader.cjs`（dev / 跑 vitest / 刚 clone fresh worktree 的情况）。
- (3) 在 `tap-session.ts:tapSession()` 第一次发现 daemon 缺失时，best-effort 自动 install：从 monorepo `dist/bin-uploader.cjs` `copyFileSync` 到 `~/.teamagent/digital-twin/bin-uploader.cjs`，复制失败不阻塞 hook（hook 永远不抛错）。
- (4) 单元测试覆盖：
  - `bin-uploader.cjs` build 产物存在
  - `resolveDaemonBin` 优先用户机 path、fallback 包内 dist、两者都缺时返回 `null`
  - `tap-session` 在 monorepo dist 存在但用户机缺失时 self-install + spawn

**怎么做**：
- 改 `packages/digital-twin/package.json` 的 `build` script 把 `bin-uploader.ts` 加进 CJS tsup 调用（与 `bin-prod-server` 同一行）。
- 改 `packages/cli/src/bin-digital-twin-tap.ts:resolveDaemonBin` 加 monorepo fallback；`bin-uploader.ts` 不动。
- 改 `packages/digital-twin/src/hooks/tap-session.ts:tapSession()` 加 self-install step（在 spawn 分支前）。Self-install 失败 silent skip，下一次 hook 再试。
- 新增/改测试：
  - `packages/digital-twin/src/hooks/__tests__/tap-session.test.ts` 加 self-install 用例
  - `packages/cli/src/__tests__/bin-digital-twin-tap.test.ts` 加 monorepo dist fallback 用例
- 不动 `runDaemon`、`mainLoop`、`uploadCcSession`、queue、process-manager（这些行为契约 F1 不碰）。

**不做什么**：
- 不修 F3（envelope schema 不一致）—— 单独 PR
- 不修 F4（recording 不接 daemon）—— 单独 PR
- 不修 F9（zero-touch 静默放大）—— 等 F1+F3 都修好后自然消失，单独评估
- 不改 `.claude/settings.json` / `digital-twin-tap.sh` shim —— 已工作
- 不动 install-hook 流（不引入新 CLI subcommand）—— self-install + dist fallback 已覆盖

## Expected outputs

- [ ] `packages/digital-twin/package.json:build` 多产出 `dist/bin-uploader.cjs`，`pnpm --filter @teamagent/digital-twin build` 后可见
- [ ] `packages/digital-twin/dist/bin-uploader.cjs` 单文件可独立 `node` 启动（runDaemon 入口被 auto-invoke），无 MODULE_NOT_FOUND
- [ ] `packages/cli/src/bin-digital-twin-tap.ts:resolveDaemonBin` 接受 monorepo dist fallback；新单测覆盖三种返回（user-installed / fallback dist / null）
- [ ] `packages/digital-twin/src/hooks/tap-session.ts` 在 user-installed 缺失但 monorepo dist 存在时，best-effort self-install + spawn；self-install 失败不抛
- [ ] vitest: `pnpm --filter @teamagent/digital-twin test` + `pnpm --filter @teamagent/cli test` 全绿
- [ ] `pnpm typecheck` 全绿
- [ ] PR description 含 4 段（task / expected outputs / how-to-verify / claudefast probes）

## How to eval (3rd-party judge harness)

按 `docs/PLAN-RESEARCH-REPORT.md` §1 三段铁律。Harness：本目录 `judge.md`（md playbook，**禁固定 bash**）。

- **§V1 RUN**（fixed tools）：
  - `pnpm --filter @teamagent/digital-twin build` 检查产物存在
  - `pnpm --filter @teamagent/digital-twin test` (vitest)
  - `pnpm --filter @teamagent/cli test` (vitest, 限定 bin-digital-twin-tap.test.ts + tap-session.test.ts)
  - `pnpm typecheck`
  - `node packages/digital-twin/dist/bin-uploader.cjs` smoke (期望: exit 2 with "config missing or disabled" log，不抛 MODULE_NOT_FOUND)
- **§V2 DUMP**：
  - `.judge/issue-146-f1/<run_id>/judge.json` 含 `{tool, exit_code, stdout_path, stderr_path, evidence_dir}` × 5 行
  - `.judge/issue-146-f1/<run_id>/evidence/` 存全部 stdout/stderr
- **§V3 READ**：
  - 一只 `claudefast -p` 只读 raw `judge.json` + 必要 evidence，输出 `pass | fail | uncertain` + 下一步。任何 `exit_code != 0`（除 bin-uploader smoke 期望 exit 2）= fail。
- **谁不能当裁判**：本 PR 作者、执行 agent、`bin-uploader.cjs` 自己、`/review` skill 自己。

## Steps

1. 改 `packages/digital-twin/package.json` build script
2. `pnpm --filter @teamagent/digital-twin build` 验证产物
3. 改 `packages/cli/src/bin-digital-twin-tap.ts` 加 monorepo fallback
4. 改 `packages/digital-twin/src/hooks/tap-session.ts` 加 self-install
5. 写 / 改测试
6. 跑 vitest + typecheck
7. 跑 judge harness（V1 RUN → V2 DUMP）
8. 跑 V3 READ（claudefast -p）
9. 写 atomic commits
10. 跑 `/review` skill loop 至 PASS
11. push + open PR + squash-merge + cleanup + pull main
12. 写 `docs/plans/issue-146-f1/report.md`

## Risks

- **R1**：tsup CJS bundle 把 `gzipSync` 等 `node:*` builtin 当外部 → 需 `--external 'node:*'` 或默认行为（`bin-prod-server` 同模式已 OK，照搬）
- **R2**：Windows path separator 问题（spawn 时用绝对路径，paths.ts 用 `node:path.join` 已规避）
- **R3**：self-install `copyFileSync` 在只读 `~` 上失败 → 已 catch + silent skip 设计

## Rollback

- Revert single PR. F1 fix is purely additive（新 build entry + 新代码分支 + 新测试），不破坏既有 contract。
