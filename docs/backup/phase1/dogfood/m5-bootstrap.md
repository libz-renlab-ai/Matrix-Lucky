# M5 Bootstrap 报告：对 teamagent 自己跑 init

> 日期: 2026-04-14 (M5 Commit 7)
> 目标: 验证 `teamagent init` 从 "新项目" 视角能成功把现有 CLAUDE.md 规则 + 4 条元原则一键装进知识库 + CLAUDE.md

## 两个场景

### 场景 A：dry-run 打 teamagent 仓库

`pnpm teamagent init --dry-run --skip-hook`

输出：
```
✓ pre-check              所有前置检查通过
✓ detect-stack           lang=javascript+typescript  pm=pnpm  test=vitest  other=claude-code+monorepo
✓ create-dirs            (dry-run) 会创建: ~/.teamagent/personal, ~/.teamagent/global, ./.teamagent
✓ load-preset            (dry-run) 会写入 4 条元原则
✓ scan-rules             CLAUDE.md: 12 bullets
✓ structure-rules        (dry-run) 会 LLM 结构化 12 条规则写入 personal store
- install-hook           skipHook=true
✓ compile-claude-md      (dry-run) 会把三个 scope 的 active 条目合并编译到 CLAUDE.md
```

**观察**:
- Stack 识别正确：TS / pnpm / vitest / monorepo / claude-code
- scan-rules 拿到 12 条 bullets——是 CLAUDE.md 人工维护段的"开发约定 + 元约束"节，自动跳过了 `<!-- TEAMAGENT:START -->` 区块里的 28 条（避免导入循环）
- 全程零写入，可放心在真实仓库上跑 dry-run

### 场景 B：真实 init 跑一个全新项目

临时目录 + 5 条合成规则的 `CLAUDE.md`：

```md
# Fake Project
- 使用 TypeScript strict mode
- HTTP 请求用 fetch，不用 axios
- 提交前 pnpm test 全绿
- commit message 格式 feat: / fix: / chore:
- 避免引入新依赖先看 package.json
```

执行 `teamagent init --skip-hook`（跳过 hook 是因为这个临时目录不装 Claude Code）。

输出：
```
✨ TeamAgent Init
✓ pre-check              所有前置检查通过
✓ detect-stack           other=claude-code
✓ create-dirs            已确保目录存在: 3 个
✓ load-preset            注入元原则 4 条（总 4 条，0 条已存在）
✓ scan-rules             CLAUDE.md: 5 bullets
✓ structure-rules        成功导入 5/5（跳过 0，失败 0）
✓ compile-claude-md      已编译 25 条 → CLAUDE.md
```

**LLM 调用**: 5 次 `claude -p`（每条规则一次），全部成功，平均 ~8 秒/次，总成本约 $0.60。

**产出**（从 store 读回、经 review 核对）:

| 原文 | LLM 结构化后 | 评分 |
|------|-------------|------|
| 使用 TypeScript strict mode | C/typescript, trigger="编写或配置 TypeScript 项目", wrong=`"strict": false`, correct=`"strict": true` | 5/5 |
| HTTP 请求用 fetch，不用 axios | E/http-client, trigger="需要发起 HTTP 请求", wrong=axios, correct=fetch | 5/5 |
| 提交前 pnpm test 全绿 | practice, trigger="准备提交代码前", correct="pnpm test 全部通过后再提交" | 5/5 |
| commit message 格式 feat:/fix:/chore: | practice, trigger="写 git commit message", correct="用 feat:/fix:/chore: 等标准前缀" | 5/5 |
| 避免引入新依赖先看 package.json | practice, trigger="考虑引入新依赖时", correct="先看 package.json 是否已有能做这件事的包" | 5/5 |

全部 5/5——M4 Extractor 对"已经写下的规则"结构化效果比对"纠正会话"更稳定，因为规则文本本身就是明确表述。

## 本次自举踩的坑（M5 真正的知识产出）

### 1. Windows 下 `HOME=xxx pnpm teamagent init` 不会重定向 homedir

自举过程中想用 `HOME=$TMP pnpm ...` 做完全隔离的测试，结果 `os.homedir()` 仍返回 `C:\Users\...`——Windows 上 Node 的 `os.homedir()` 读 `USERPROFILE` 而非 `HOME`。

**后果**: 本次运行实际把 5 条 imported 条目写进了**真实**的 personal store、4 条 preset 写进了**真实**的 global store。后续用小脚本 `scripts/remove-pollution.ts`（用完即删）按 id 前缀剔除了 5 条导入条目；4 条元原则保留（它们本来就是该装的）。

**改进**: 如果需要完全隔离的测试环境，init 应该支持 `--home-dir=path` flag（M4 的 analyze --commit 已经支持这样的注入，init 只是没暴露到 CLI 参数）。

### 2. "新项目" = cwd + 空 home 的语义边界不稳

本次 bootstrap 让"新项目"的含义变得不严格：homeDir 仍是老 homedir，只有 cwd 换了。真正意义上的"全新机器新项目"需要 homeDir 和 cwd 都换。

**改进**: Commit 7 暴露的问题比 Commit 1-6 的功能做错还要重——这正好是自举的意义：你以为已经做好的东西，在"外人视角"下会露出真正的接缝。

## DoD 评估

- [x] 给定含 CLAUDE.md 的测试项目：init 后所有规则被导入为 personal scope 知识（5/5 成功）
- [x] 安装日志清晰列出每一步（8 步，每步 ✓/✗/- 状态 + 一句 detail）
- [x] 归因块展示"4 元原则 + 5 导入"
- [x] disable/enable 可往返（Commit 6 测试覆盖）
- [x] uninstall 默认保留数据（Commit 6 测试覆盖）
- [x] 自举切入：对 teamagent 自身 dry-run 跑过一次；真实 init 在 tmp 项目上跑过一次

## 沉淀到知识库

自举暴露的两条经验值得成条目：
- Windows 下 HOME 环境变量不控制 `os.homedir()`（要用 USERPROFILE 或显式注入）
- `teamagent init` 应支持 --home-dir flag（现在没有）

后者是 feature request 性质，记为 M6/polish 待办。前者是 global/K 类知识，建议在后续 pitfall 时录入。

## 成本记录

| 项目 | LLM 调用 | 成本 (USD) |
|------|---------|-----------|
| 场景 A dry-run | 0 | 0 |
| 场景 B 真实 init | 5 | ~0.60 |
| **合计** | 5 | **~0.60** |
