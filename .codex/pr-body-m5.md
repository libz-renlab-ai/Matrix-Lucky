# M5 团队病毒式传播 + 规则同步（Team Viral Sync）

## Summary

新增 M5 milestone：让 TeamAgent 从"个人工具"变成"团队工具"。

- **M5-A 传染 + 引导**：项目里写"必装契约"（manifest + bootstrap 入口 + hook
  锚点 + 共享层骨架），新协作者 clone 后 bootstrap 自动重建本机 TeamAgent 形态
- **M5-B 隐私三层 + 双闸门**：L1 个人本地（默认）/ L2 项目共享（进 git）/
  L3 沙箱；闸门 1 硬性密钥扫描（永封）+ 闸门 2 作用域分类（保守倾向）
- **M5-C 自动同步 + tombstone**：LWW（last-writer-wins）+ tombstone 合并；
  任意人改/删任意规则；alive resurrect（晚 alive 覆盖早 tombstone）；保留
  original_author lineage
- **M5-D 多点拦截 + 可见面板**：pre-commit hook 警告而不阻塞（spec §8 降级原则）；
  TEAMAGENT_BOOTSTRAP_SKIP=1 escape hatch；`teamagent m5-status` 综合面板

## 文档

- 设计 spec：`docs/superpowers/specs/2026-05-06-m5-team-viral-sync-design.md`
- 实现 plan：`docs/superpowers/plans/2026-05-06-m5a-infect-and-bootstrap.md`

## 新增 Port（先契约后实现，元约束遵守）

| Port | 契约 tests | 实现位置 |
|---|---|---|
| `BootstrapPort` | 5 | `packages/adapters/src/m5/fs-bootstrap.ts` |
| `SecretScanPort` | 12（黄金集，含必中 + 必放） | `packages/core/src/m5/secret-scanner.ts` |
| `ScopeClassifierPort` | 6 | `packages/core/src/m5/scope-classifier.ts` |
| `TeamRuleStorePort` | 6 | `packages/adapters/src/m5/fs-team-rule-store.ts` |

## 新增 CLI 命令

```
teamagent m5-infect [--project-root=<p>] [--author=<n>]
teamagent m5-bootstrap [--project-root=<p>] [--check]
teamagent m5-share --text "<规则文本>" [--rule-id=<id>] [--scope=personal|team] [--author=<n>]
teamagent m5-sync [--project-root=<p>]
teamagent m5-delete --rule-id=<id> [--by=<n>] [--reason=<text>]
teamagent m5-status [--project-root=<p>]
```

## 验证（如何验证）

### 1. 单元 + 契约 + 集成测试

`pnpm exec vitest run packages/core/src/m5 packages/adapters/src/m5 packages/cli/src/__tests__/m5-cli.test.ts packages/cli/src/__tests__/m5-bc-cli.test.ts`

**结果：83/83 passed**

| 测试模块 | 数 | 类型 |
|---|---|---|
| manifest | 7 | 纯函数 |
| infect-planner | 5 | 纯函数 |
| bootstrap-diff | 6 | 纯函数 |
| secret-scanner | 12 | 契约（黄金集） |
| scope-classifier | 6 | 契约 |
| auto-share-pipeline | 6 | 纯函数（决策表） |
| team-rule | 7 | 纯函数 |
| lww-merge | 8 | 纯函数 |
| fs-bootstrap | 5 | Port 契约 |
| fs-team-rule-store | 6 | Port 契约 |
| m5-cli (A) | 4 | CLI 集成 |
| m5-bc-cli (B/C/D) | 11 | CLI 集成 + 端到端 |

### 2. M5-A walking skeleton 端到端 demo

`bash scripts/m5-demo.sh` — Alice infect → push → Bob clone → bootstrap

### 3. M5 完整端到端 demo（A+B+C+D）

`bash scripts/m5-full-demo.sh` 覆盖：

- Alice infect 项目
- Alice 共享 3 条规则：纯流程（promote）+ 含 token（sealed）+ 含本机路径（personal）
- Alice push → Bob clone → bootstrap 报告 diff → status 看到 1 条共享规则
- Bob 跨 author 改 Alice 的 R-postpr（lineage 保留 original=alice）
- Bob 写新规则 R-port-contract
- Bob push → Alice pull → m5-sync 显示合并结果
- Alice 删除 R-postpr（任意人删任意规则）
- Bob resurrect R-postpr（晚 alive 覆盖早 tombstone）
- 最终 status：3 个 claim → alive=2 / tombstoned=0

实际跑通的关键输出节选：

```
[m5-share] rule_id=R-postpr
  闸门 1 (密钥扫描): 0 命中
  闸门 2 (作用域): shareable — 命中 shareable 信号: PR/CI/测试; 项目约定; AI/工具链
  动作: promote_to_l2

[m5-share] rule_id=R-leaked-token
  闸门 1 (密钥扫描): 1 命中
  动作: seal_in_l1

[m5-sync] 读到 3 个 claim，合并为 2 条规则。
  ✓ R-port-contract (claim=bob, original=bob): 新增 Port 必须先写契约测试...
  ✗ R-postpr (tombstone by alice, original=alice)

[m5-share] rule_id=R-postpr  (Bob resurrect)
  ✓ R-postpr (claim=bob, original=alice): PR 后必须 fetch codex review — Bob 改回
```

### 4. typecheck

`pnpm --filter @teamagent/{types,ports,adapters,cli} typecheck` — 全过

### 5. 全项目测试套件

`pnpm test` — 1545/1547 通过；2 个失败：

- `analyze.test.ts` (EBUSY on knowledge.db unlink) — pre-existing Windows file-lock
  flake，与 M5 无关（git blame 显示该测试早于 M5 commit）
- `pitfall.test.ts` (timeout 30000ms when run with full suite) — 同样为 pre-existing
  flake；单独跑 `pnpm exec vitest run packages/cli/src/__tests__/pitfall.test.ts`
  全过（43/43）

## 元约束遵守清单

- [x] **新增 Port 必须先写契约测试再写实现**：4 个新 Port 全部 contract → impl
- [x] **Functional Core, Imperative Shell**：所有纯逻辑（manifest 解析、infect plan、
  bootstrap diff、secret scan、scope classify、auto-share decide、team rule
  parse/serialize、LWW merge）放 `packages/core/m5/`，无 fs/child_process
- [x] **Walking Skeleton 不断裂**：本 commit 全套 M5 测试 + 两个 demo 全绿
- [x] **commit message 格式**：全部 `feat(m5):` / `fix(m5):` 前缀
- [x] **PR 是普通 PR，不是 draft**：本 PR 默认普通

## Out of scope（spec 已记录）

- AttributionBus 事件接入（M5-A→D 的所有自动动作目前走 stdout；spec §11 已说明
  CLI 命令 stdout 即用户面向通道，AttributionBus 服务于 hook 触发场景；后续把
  m5-bootstrap 接入 SessionStart hook 时再补）
- 实际 plugin/hook 安装（M5-A bootstrap 当前只 check + 报 diff；M5-A2 / M5-D 后续
  做实际安装动作）
- 自动 commit + push（M5-C 当前只本地 LWW 合并；自动 idle 检测 + 后台 push 留作
  M5-D2）
- LLM-based scope classifier（M5-B 当前是启发式；后续可换 embedding-based）

## Test plan

- [x] M5-A demo (`bash scripts/m5-demo.sh`) PASS
- [x] M5 full demo (`bash scripts/m5-full-demo.sh`) PASS
- [x] M5 单元 + 集成 + 契约 83/83 PASS
- [x] M5 涉及包 typecheck 全过
- [ ] CI 跑通
- [ ] Codex review 不再有 P1/P2

🤖 Generated with [Claude Code](https://claude.com/claude-code)
