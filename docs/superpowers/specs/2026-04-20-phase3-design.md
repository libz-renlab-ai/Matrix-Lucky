# TeamAgent Phase 3 设计文档

> 创建日期：2026-04-20
> 版本：v1
> 状态：已审核
> 父文档：`docs/superpowers/specs/2026-04-15-product-roadmap-v2.md`

---

## 一、Phase 3 单句目标

> **把用户范围从"只有作者"扩展到"任何朋友能独立安装并持续使用"。**

Phase 3 **不扩展功能维度**（不做新的知识类型、不做团队同步），专注一件事：**让陌生人能在 5 分钟内独立装上、验证可用、并坚持用下去。**

---

## 二、设计决策

| 决策 | 选择 | 理由 |
|------|------|------|
| 目标用户语言 | 中英双语（中文为主，错误信息中文） | 初期朋友为中文用户，同时保持 GitHub 可发现性 |
| 安装方式 | `npm install -g teamagent` | 最低安装门槛，单命令完成 |
| 最大痛点 | 全覆盖（环境/输出/Hook/原生依赖） | doctor 诊断所有已知卡点 |
| npm 架构 | unscoped `teamagent`，esbuild bundle | 最简用户体验，monorepo 内部结构对用户透明 |
| 推进顺序 | 体验优先，发包居后 | 发包快但体验差 → 留存率为零，得不偿失 |

---

## 三、4 个 Sub-project（顺序执行）

```
SP3-1  teamagent doctor          环境 + 安装诊断命令
SP3-2  Init/Error UX 打磨        输出重写 + 错误消息友好化
SP3-3  npm Bundle & Publish      esbuild 打包 + 发布 teamagent@0.5.0
SP3-4  README + 5分钟上手指南    中英双语文档
```

友测（≥3 位朋友持续使用 ≥2 周）是 SP3-3 完成后的**持续验证阶段**，不是独立 Sub-project。

### Sub-project 依赖关系

```
SP3-1 (doctor)
    ↓
SP3-2 (UX polish) ← 依赖 doctor 的检查逻辑可复用
    ↓
SP3-3 (bundle & publish) ← doctor + UX 打磨完毕才发包
    ↓
SP3-4 (README) ← 发包后命令确认稳定再写文档
    ↓
友测
```

---

## 四、SP3-1: `teamagent doctor`

### 用途

陌生人装完后跑一次，即可知道哪里有问题、怎么修。`init` 命令结束时自动提示运行 `teamagent doctor`。

### 8 项检查（顺序执行，失败快退）

| # | 检查项 | 通过条件 | 失败时修复建议 |
|---|--------|---------|--------------|
| 1 | Node.js 版本 | ≥ 22.0.0 | `nvm install 22 && nvm use 22` |
| 2 | Claude Code 已安装 | `claude --version` 返回 0 | `npm install -g @anthropic-ai/claude-code` |
| 3 | sqlite-vec 可加载 | `require('sqlite-vec')` 不抛异常 | 重装 teamagent / 提示平台不支持 |
| 4 | `~/.teamagent/` 可读写 | mkdirSync + writeFile 不抛 | 检查磁盘权限/空间 |
| 5 | 项目 `.teamagent/knowledge.db` 存在 | 文件存在 + 能打开 | `teamagent init` |
| 6 | Hook 已注册 | `.claude/settings.local.json` 含 teamagent PreToolUse entry | `teamagent install-hook` |
| 7 | Hook 脚本可执行 | hook entry 路径文件存在 + node 能 require | 重装 / 重跑 init |
| 8 | CLAUDE.md 有 TeamAgent 区块 | 文件含 `TEAMAGENT:START` | `teamagent compile` |

**失败快退规则**：检查 5 失败时，6/7/8 标记 `⏭ 跳过`（而非 ❌），避免用户误以为有多个独立问题。

### 输出格式

```
teamagent doctor

环境诊断 / Environment Check
───────────────────────────────────────
✅ Node.js      v22.4.0  (需要 ≥ 22)
✅ Claude Code  v1.8.2
✅ sqlite-vec   加载成功
✅ ~/.teamagent 可读写
❌ knowledge.db 不存在
   → 运行: teamagent init
⏭  Hook 注册   (跳过，knowledge.db 先修)
⏭  Hook 脚本   (跳过)
⏭  CLAUDE.md   (跳过)

1 项失败，3 项跳过。修复后重跑 teamagent doctor
```

全通过时：

```
✅ 全部检查通过！TeamAgent 运行正常。
```

### 接口设计

```typescript
interface DoctorCheckResult {
  name: string;
  status: "pass" | "fail" | "skip";
  detail: string;
  fix?: string;      // 失败时的可执行修复命令
}

interface DoctorResult {
  checks: DoctorCheckResult[];
  passed: number;
  failed: number;
  skipped: number;
  allPassed: boolean;
}
```

### 标志

- `--fix`：对能自动修的项（5→init、6→install-hook、8→compile）直接执行，不只打印提示
- `--json`：输出机器可读 JSON（供脚本/CI 用）
- `--postinstall`：postinstall 脚本调用时的静默模式，仅打印失败项

**退出码**：全通过 exit 0，有失败 exit 1。

---

## 五、SP3-2: Init 输出 & 错误消息打磨

### 问题

当前 `renderInitResult` 是逐步骤文字堆叠，没有明确的成功/失败总结；错误消息直接暴露内部路径和技术堆栈。

### 新 init 输出结构

```
teamagent init

🔍 检测项目环境...
   技术栈: TypeScript + React + pnpm

📦 初始化知识库...
   ✅ 目录创建: .teamagent/
   ✅ 预置规则: 加载 12 条元原则
   ✅ 导入已有规则: 从 CLAUDE.md 导入 5 条

🔗 注册 Hook...
   ✅ PreToolUse Hook 已写入 .claude/settings.local.json

📄 编译 CLAUDE.md...
   ✅ 写入 3 条 canonical 规则（共 17 条活跃）

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
✅ TeamAgent 安装成功！

下一步:
  1. 重新打开 Claude Code（让 hook 生效）
  2. 运行 teamagent doctor 验证安装
  3. 运行 teamagent stats 查看知识库状态
```

失败时的最后一行变为：

```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
❌ 安装未完成，请修复以上问题后重试
   运行 teamagent doctor 获取诊断建议
```

### 错误消息原则

每条错误消息 = **现象描述（中文）+ 一条可执行的修复命令**，不暴露堆栈/内部路径。

| 现在（技术味） | 改后（可操作） |
|---|---|
| `ENOENT: no such file or directory '/home/.../.teamagent'` | `无法创建 ~/.teamagent 目录，请检查磁盘权限` |
| `BetterSqlite3 failed to load extension` | `sqlite-vec 扩展加载失败。运行 teamagent doctor 诊断` |
| `pre-check failed: CLAUDE.md 不可读写` | `CLAUDE.md 文件无写入权限，请运行: chmod 644 CLAUDE.md` |

### `--dry-run` 改进

顶部加醒目标注，与正常输出视觉区分：

```
⚠️  预览模式（--dry-run）：以下操作不会实际执行
```

---

## 六、SP3-3: npm Bundle & Publish

### 打包策略

用 **esbuild** 将所有 `@teamagent/*` 包打成多个独立 bundle（不是单文件）：

```
dist/
  bin.js                    ← 主 CLI 入口 (teamagent <cmd>)
  bin-pre-tool-use.js       ← PreToolUse hook 入口
  bin-post-tool-use.js      ← PostToolUse hook 入口
  bin-stop.js               ← Stop hook 入口
  bin-user-prompt-submit.js ← UserPromptSubmit hook 入口
```

多文件的原因：hook 脚本由 Claude Code 直接 spawn，必须独立可执行；合并到 `bin.js` 会导致 hook 路径失效。

### sqlite-vec 处理

sqlite-vec 是原生 `.node` 扩展，不能被 esbuild bundle：

- 声明为 `peerDependencies`，不强制安装
- `postinstall` 脚本调用 `teamagent doctor --postinstall` 尝试验证，失败时打印友好警告（不报错退出，不阻断安装）
- `teamagent doctor` 检查项 #3 负责最终诊断

### 发布包 `package.json` 关键字段

```json
{
  "name": "teamagent",
  "version": "0.5.0",
  "description": "自进化 AI 规则引擎 for Claude Code | Self-evolving AI rule engine",
  "bin": { "teamagent": "./dist/bin.js" },
  "engines": { "node": ">=22.0.0" },
  "files": ["dist/"],
  "scripts": {
    "build": "node scripts/bundle.mjs",
    "postinstall": "node dist/bin.js doctor --postinstall 2>/dev/null || true"
  },
  "peerDependencies": {
    "sqlite-vec": ">=0.1.0"
  },
  "peerDependenciesMeta": {
    "sqlite-vec": { "optional": true }
  }
}
```

### esbuild bundle 脚本 (`scripts/bundle.mjs`)

```javascript
import { build } from 'esbuild';

const entries = [
  'packages/cli/src/bin.ts',
  'packages/cli/src/bin-pre-tool-use.ts',
  'packages/cli/src/bin-post-tool-use.ts',
  'packages/cli/src/bin-stop.ts',
  'packages/cli/src/bin-user-prompt-submit.ts',
];

const external = ['sqlite-vec', 'better-sqlite3']; // native modules

for (const entry of entries) {
  await build({
    entryPoints: [entry],
    bundle: true,
    platform: 'node',
    target: 'node22',
    format: 'esm',
    outdir: 'dist',
    external,
    banner: { js: '#!/usr/bin/env node' },
  });
}
```

### 发布流程（Phase 3 手动）

```bash
pnpm test && pnpm typecheck
pnpm run build
# 验证 bundle 在本地能跑
node dist/bin.js --help
npm publish --access public
```

CI/CD 自动发布是 Phase 4 优化项。

### 跨平台测试矩阵

| OS | Node | 必测场景 |
|---|---|---|
| macOS 14 (ARM) | 22 | init + doctor + hook fire |
| Ubuntu 22.04 | 22 | init + doctor + hook fire |
| Windows 11 | 22 | init + doctor（hook 依赖 Git Bash） |

---

## 七、SP3-4: README & 5分钟上手指南

### README.md 结构

```markdown
# TeamAgent

> 自进化 AI 规则引擎 | Self-evolving AI rule engine for Claude Code

[一句话价值主张: 让团队踩过的坑只踩一次]

[![npm version](https://badge.fury.io/js/teamagent.svg)](...)
[![Node ≥22](https://img.shields.io/badge/node-%3E%3D22-green)]
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)]

## 快速开始 / Quick Start

[5步安装流程，代码块]

## 验证安装 / Verify Installation

teamagent doctor

## 它能做什么 / What it does

[3条核心能力]

## 主要命令 / Commands

[命令表，中文注释]

## 常见问题 / FAQ

[5条：Node版本/sqlite-vec/Hook没反应/Windows/卸载]

## 卸载 / Uninstall
```

### 5分钟上手路径（README 内嵌）

```
Step 1 (30s)   npm install -g teamagent
Step 2 (60s)   cd 你的项目 && teamagent init
Step 3 (30s)   teamagent doctor   ← 确认全绿
Step 4 (60s)   重启 Claude Code
Step 5 (验证)  让 Claude 执行任意操作，观察 hook 输出
```

### 5条 FAQ

1. **Node 版本不够**：`nvm install 22`
2. **sqlite-vec 加载失败**：`npm install -g sqlite-vec` 或 `teamagent doctor --fix`
3. **Hook 装了没反应**：必须重启 Claude Code 才生效
4. **Windows 下 hook 不工作**：需要 Git Bash，不支持 PowerShell
5. **如何卸载**：`teamagent uninstall --delete-data && npm uninstall -g teamagent`

### 不做的事

- 不单独建 docs/ 文档站（Phase 3 用户少，README 够用）
- 不做 CHANGELOG.md 自动生成（手动维护）

---

## 八、退出标准（全部满足才算 Phase 3 完成）

1. `teamagent doctor` 能诊断并给出修复建议，覆盖率 ≥ 90%（基于友测实际故障）
2. 从零安装到第一次 hook 生效 ≤ 5 分钟（`npm install` + `init` + 重启 Claude Code）
3. ≥ 3 位非作者朋友独立完成安装并持续使用 ≥ 2 周
4. macOS / Linux 各通过完整集成测试（doctor + init + hook fire）

**版本**：v0.5.0

---

## 九、测试策略

### 单元测试

- `doctor` 命令：每个检查项分别测 pass/fail/skip 路径
- `renderInitResult`：各种步骤组合的输出快照测试
- esbuild bundle：smoke test（`node dist/bin.js --help` 返回 0）

### 集成测试（跨平台 CI）

- macOS + Linux：`npm install -g teamagent && teamagent init && teamagent doctor`
- 全绿且 `doctor` 8 项全通过

### 友测验收

- 朋友按 README 安装，不借助作者指导
- 安装过程中遇到的所有问题反馈给 `doctor` 迭代
- 2 周后收集：是否继续使用、hook 命中过几次、有无误报

---

## 十、不在 Phase 3 范围内的事

- 团队同步（Phase 4）
- 多工具支持 Cursor/Windsurf（Phase 6）
- 自动 CI/CD 发布流水线（Phase 4 优化）
- 用户反馈收集系统（手动收集即可）
- WSL / BSD 支持
