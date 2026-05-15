# TeamAgent 系统展示: 十一、实测数据（全部来自系统自生成）

Source index: [系统展示.md](../系统展示.md)

## 十一、实测数据（全部来自系统自生成）

### 11.1 自举报告（`docs/dogfood/自举报告.md`，2026-04-20）

**知识库维度**：

| 维度 | 数值 |
|---|---|
| 总条目 | 73 |
| 活跃 | 64 |
| 自动归档 | 4 |
| personal scope | 51 |
| global scope | 22 |
| C 代码层 | 2 |
| E 工程层 | 23 |
| S 策略层 | 11 |
| K 认知层 | 22 |

**Hook 干预统计**：

| 事件类型 | 次数 |
|---|---|
| hook-pre.passed（放行） | 2,271 |
| hook-pre.warned（警告） | 91 |
| hook-pre.blocked（阻断） | 70 |
| ai.override.complied（AI 听劝） | 65 |
| hook-post.result | 28 |
| ai.override.ignored（AI 不听劝） | 23 |
| calibrator.adjusted | 6 |

**听劝率**（ai.override.complied / (complied + ignored)）= **65 / 88 = 73.9%**——每 4 次警告里 3 次 AI 会改做法。

**命中频次 Top 5**（规则真实被系统自己用了多少次）：

| # | 命中数 | 知识 trigger |
|---|---|---|
| 1 | 28 | 在 packages/core/ 下复用 adapter 层的逻辑 |
| 2 | 22 | （已删）rule-react-key-stable |
| 3 | 21 | （已删）rule-moment-to-dayjs |
| 4 | 20 | 在 hook 入口或 adapter 代码里调试 |
| 5 | 20 | （已删）wiki-axios-abort-signal |

### 11.2 Benchmark（`packages/benchmark/bench-report.md`，2026-04-20）

**配置**：2 组（baseline vs teamagent）× 6 任务 × 3 次重复 = 36 次 LLM 调用。

| 指标 | Baseline（裸 Claude Code） | TeamAgent | 差异 |
|---|---|---|---|
| **Wrong（犯错）** | 18 | **0** | **PRR = 100.0%** |
| Correct（正确） | 0 | 17 | — |
| Neither（无法判定） | 0 | 1 | — |
| Error（系统错误） | 0 | 0 | — |
| Tokens in/out | 468 / 32,296 | 702 / 49,215 | **+52.4%**（待优化）|
| 平均 duration | 20.3s | 28.9s | +42.1% |

**任务清单**：

1. `001-moment-vs-dayjs` — 技术选型（体积优化）
2. `002-axios-cancel` — API 废弃（CancelToken → AbortController）
3. `003-react-key` — React 框架陷阱（key=index 导致重渲染 bug）
4. `004-multi-trap-todo` — 多陷阱叠加
5. `005-xhr-vs-fetch` — 过时 API
6. `006-react-class-component` — React 类组件 → Hooks

**诚实披露**：
- Benchmark v1 为 **2 组对比**（baseline + teamagent），**Auto-Memory 与 Codacy 对比组推迟到 v3/v4**。"比 Auto-Memory + Codacy 强 10pp"是 Phase 2 最终退出标准，尚未完成。
- **Token 开销 +52.4% 超过 Phase 2 目标 1.15×**。这是目前最明确的技术债：系统为了 100% 正确率让 AI 多跑了几轮。优化方向：更精准的 hook 触发、按 tier 降级注入上下文。

### 11.3 近 30 次 commit（系统仍在持续改进）

```
7fabbe5 feat(dashboard): add live HTML dashboard + fix Windows node:sqlite path pattern
63b6a51 fix(calibrator-v2): fix dormant resurrection — rules now revive when demerit decays below 50
c031155 feat(detector): add Signal E — detect errors pasted in user message after AI tool use
f1b759f fix(pipeline): fix Stop hook retry on Windows file lock + fix v2 calibrator getting zero observations
fb008df fix(stats): include team-scope rules in stats output
9155fc4 feat(statusline): add today passed count to status line
bed3982 feat(phase3): Phase 3 complete — doctor, UX polish, npm bundle, README
...
```

每个 commit 都有 `feat(m{N})` / `fix(m{N})` / `sp{N}` 前缀，Milestone 产出在 git 历史里可溯。

---
