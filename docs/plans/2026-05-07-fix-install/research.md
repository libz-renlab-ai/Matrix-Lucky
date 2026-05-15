```
       ┌──────────── INSTALL PIPELINE TIMING ─────────────┐
       │                                                  │
   user $ npm install -g <tarball>                        │
              │                                           │
              ▼  ① npm fetch + extract + deps   ~5–15s    │
              ▼  ② postinstall.mjs run                    │
                  ├─ Stage1 doctor + hook   (parallel)    │
                  │   timeout 15s/10s, real ≈1–3s         │
                  ├─ Stage2 warmup ⬅ BOTTLENECK           │
                  │   sync, ~120MB e5-small download      │
                  │   timeout 300_000ms                   │
                  └─ Stage3 update-state    <10ms         │
       └──────────────────────────────────────────────────┘
```

# research — fix-install

## 现状

- **Bottleneck**：`packages/teamagent/postinstall.mjs:166` 同步 `await spawnWithTimeout(... 'warmup' ..., 300_000)`。
- 模型：`Xenova/multilingual-e5-small` ~120MB，从 HuggingFace 拉。
- 用户 install 总 wall-clock 当前 = npm tarball/deps + ≈ 1–3s Stage1 + **N 分钟模型下载** + <10ms Stage3。

## 已有但未接的基础设施（issue #91）

| 文件 | 角色 |
|---|---|
| `packages/cli/src/warmup-state.ts` | atomic state file `~/.teamagent/.warmup-state.json` (`status: downloading|ready|failed`, pid, progress) |
| `packages/cli/src/commands/init.ts:589 spawnDetachedWarmup` | spawn `bin.js warmup --write-state <state>` detached + `child.unref()` + 写 placeholder; 默认 ON, `TEAMAGENT_FOREGROUND_WARMUP=1` opt-out |
| `packages/cli/src/bin-pre-tool-use.ts` | reader 已经在 `status !== "ready"` 时回退 legacy substring matcher |

`teamagent init` 已经走 detached 路径，**只剩 `postinstall.mjs` 还在同步等**。

## 约束

1. `postinstall.mjs` 是 **standalone**：不能 `import @teamagent/core` / `warmup-state.ts`（注释明写「ships standalone without bundled @teamagent/core」）。修复必须 inline 复制 placeholder 写入 + detached spawn 逻辑。
2. 路径与 init.ts 共享 `~/.teamagent/.warmup-state.json`；写出去的 schema 必须能被 `readWarmupState` 解析。
3. `seed/packs/universal.jsonl` 必须用 substring-friendly patterns（ADR 0001 consequences 第 2 条），detached 期间 legacy matcher 才能命中。已经满足（既有 universal pack）。

## ADR 0001 状态

`docs/adr/0001-two-stage-install.md` Status = **proposed**，明确写了：

> 30 秒返回 + 10 分钟后台升级 BM25+dense RRF
> 30-second-hook landing copy promise

postinstall.mjs 切 detached 后 ADR 该改为 **accepted**。

## 选项分析

| 选项 | install wall-clock | 风险 | 决议 |
|---|---|---|---|
| (A) Detached warmup（ADR canonical） | ≤30s（npm + Stage1+3） | matcher 前 ~10min 走 substring；已有 fallback | ✅ 采纳 |
| (B) `TEAMAGENT_SKIP_WARMUP=1` 默认 | ≤30s | 永不预热，首次 PreToolUse 触发同步下载 → 卡住第一次拦截 | ❌ |
| (C) 换更小模型 | 取决于模型 | 召回率改变；matching 行为偏移；不在 ADR scope | ❌ |
| (D) lazy on-first-use | 第一次拦截阻塞 | UX 与 (B) 类似 | ❌ |

(A) 最小可逆、与 init.ts/bin-pre-tool-use 一致、ADR 已 propose、escape hatch `TEAMAGENT_FOREGROUND_WARMUP=1` 给非要等齐的人。

## Worktree 位置

当前 worktree 在 `.claude/worktrees/fix-install`，违反 `CLAUDE.md` 「新建 git worktree 必须放在 `.codex/worktrees/`」。这是已存在的 worktree，本次不迁移；report.md 里 flag。

## v2 update — 2026-05-07 实测后追加

实施 v1（detached warmup）后实测真实 `npm install -g <teamagent.tgz>` wall-clock **44–51s**，超 30s 预算。归因 + 关键发现：

1. **postinstall.mjs 不再是瓶颈**：detached 后 postinstall.mjs 自身只占 ~150ms（Stage 1） + ~5ms（Stage 2 detached spawn）。
2. **真正的瓶颈是 npm 装 deps 的网络下载**：92–159 packages（含 onnxruntime-node ~30MB compressed prebuild、@xenova/transformers transitive chain）。
3. **npm 10.9.4 的 tarball install 忽略 `--omit=optional` / `--no-optional`**：把 `optionalDependencies` 当成 `dependencies` 一起装。验证：`npm install -g --omit=optional <tgz>` 后 `<prefix>/lib/node_modules/teamagent/node_modules/@xenova/transformers` 仍存在。
4. **唯一可靠的修法**：把 `@xenova/transformers` + `onnxruntime-node` 从 `packages/teamagent/package.json` **完全移除**（包括 `optionalDependencies`），只保留 sqlite-vec + tree-sitter-* + web-tree-sitter。
5. **opt-in 必须显式列包**：在 `install.sh` 的 `TEAMAGENT_INCLUDE_OPTIONAL=1` 分支用 `npm install -g <tarball> @xenova/transformers@^2.17.0 onnxruntime-node@1.14.0`，绕开 tarball-flag 失效问题。

实施 v2 后实测：median **3.32s**（3 runs，fresh cache），9 packages。详见 `report.md`。
