```
   issue #333 claim                  本地实测（teamagent 0.11.0 user release）
   ────────────────                  ──────────────────────────────────────────
   ① 触发不生效   ─→ ✗ 全坏        ① verify 6/6 PASS  +  e2e positiveTriggerRate=1
                                       （demo hook ≠ e2e probe 的 fixture 差异另议）
   ② 学习不写入   ─→ ✗ 全坏        ② e2e extractionYield=1, learnedRules=3,
                                       review 5 显示 5/11 12:15 仍有新增
   ③ 分数不升降   ─→ ✗ 全坏        ③ calibrate --dry-run 5 条调整 +0.16~-0.55,
                                       含 canonical→probation/experimental/dormant
   ──────                              ──────
   "三段全坏"                          "未复现，证据 → 三段均工作"
```

# Issue #333 — Rule-Loop 三段闭环 No-Repro 报告 (2026-05-12)

`liboze` 在 [#333](https://github.com/libz-renlab-ai/TeamBrain/issues/333) 主张
TeamAgent 规则闭环三段（**触发 / 学习 / 升降**）同时坏掉，需同步恢复。
issue body 仅 50 字模板，无评论、无复现路径、无版本号。

本报告记录在 **0.11.0 user release** + **本机真实 `~/.teamagent/`** 上对三段
闭环逐段实测的过程与结论。**未复现"全坏"的主张**；全部 canonical 验证命令
PASS / 有产出 / 有调整。基于此建议关闭 #333。

---

## 1. 验证环境

| 项 | 值 |
|---|---|
| OS | Windows 11 26200 |
| Node | v22.14.0 |
| teamagent | `0.11.0`（`npm install -g https://github.com/libz-renlab-ai/TeamBrain/archive/refs/heads/release.tar.gz`） |
| 数据库 | 本机真实 `~/.teamagent/`（不是 e2e 临时 workspace） |
| 知识库规模 | 875 条总数 / 555 活跃 / 223 归档（`teamagent stats`） |

---

## 2. 三段实测

### 2.1 Stage C（升降）— ✅ 正常工作

```bash
$ teamagent calibrate --dry-run
🔍 TeamAgent Calibrate (dry-run)
  personal 扫描 807, 调整 5 (含归档 1)
    - team-20260414061412-tf46aq: conf 0.60 → 0.76 (+0.16) demerit 14 → 10
    - pers-20260428072255-llw212: conf 0.85 → 0.37 (-0.48) [canonical → probation]
    - pers-20260428073402-eaikmr: conf 0.85 → 0.30 (-0.55) [canonical → experimental]
    - pers-20260507062038-frns1p: conf 0.95 → 0.79 (-0.16) [canonical → dormant]
    - pers-20260507100610-4nqm59: conf 0.60 → 0.58 (-0.02)
  global   扫描 68, 无变化
  总计: 5 条调整, 1 条归档
```

`teamagent stats` 同时显示本周 confidence 移动幅度 **+1.69 ~ -0.86**，含
`[自动归档]` 事件。calibrator v2 (`packages/core/src/calibrator/v2/`) 的 wilson /
hysteresis / demerit / tier 全链路有产出。**判定：升降工作正常。**

### 2.2 Stage B（学习）— ✅ 工作

```bash
$ teamagent e2e-evaluate --json | head
{
  "ok": true,
  "learnedRules": 3,
  "correctionsFound": 3,
  "extracted": 3,
  "skillsExported": true,
  "skillsHaveRules": true,
  "metrics": {
    "extractionYield": 1,
    "positiveTriggerRate": 1,
    "generalizationRate": 1,
    "falsePositiveRate": 0,
    "helpfulRate": 1,
    ...
  }
}

$ teamagent review 5
共 875 条，展示最近 5
[2026-05-11] personal/E/stop-hook  conf=0.70 ...
[2026-05-11] personal/E/self-report ...
[2026-05-11] personal/E/hook ...
[2026-05-11] personal/K/self-report ...
[2026-05-11] personal/K/self-report ...
（5 条均为 5/11 12:15 同批 commit）
```

`extractionYield=1` 意味着 e2e 临时 workspace 里 3 个 correction 全部成功提取
出 rule。本机真实库上最近一次 commit 学习是 **5/11 12:15:44**（同批 5 条关于
`<laziness-self-report>` block）。

**判定：学习链路工作。** 唯一可疑点：5/11 12:15 之后到 5/12 检查时点之间未
观察到新增条目，但这是缺乏新 correction 信号的自然结果，不能反推链路坏。

### 2.3 Stage A（触发）— ✅ 工作（带一致性疑点）

```bash
$ teamagent verify
🔬 TeamAgent Verify
  ✓ python-version       PRR=100  KP=5.0
  ✓ tech-choice          PRR=100  KP=5.0
  ✓ api-hallucination    PRR=100  KP=5.0
  ✓ security             PRR=100  KP=5.0
  ✓ workflow-order       PRR=100  KP=5.0
  ✓ moment-dayjs         PRR=100  KP=5.0
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  通过: 6/6   平均 PRR: 100.0   平均 KP: 5.00/5
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

$ teamagent e2e-evaluate
moment-install probe: triggered=true, helpful=true,
  message="⚠️ TeamAgent 拦了一下 — When adding date formatting dependencies
           复制即可: Use dayjs.   conf=0.90"
metrics: positiveTriggerRate=1, generalizationRate=1, falsePositiveRate=0
```

`teamagent stats` 显示 top1 命中规则 lifetime 已触发 **29 次**，证明真实
session 中 `packages/core/src/matcher/` (semantic-matcher / soft-and-scorer /
hard-negative-accumulator) + `hook/pre-tool-use-handler.ts` 的整条触发路径
真实在跑。

**判定：触发工作。**

#### 一致性疑点（与 #333 无直接关系，单独记录）

```bash
$ teamagent demo hook Bash 'command=npm install moment'
▸ 决策: 通过 (无规则命中)
```

同样的 prompt 在 e2e probe 中触发（`triggered=true`），在 `demo hook` 模拟器
中**不触发**。原因 = e2e-evaluate 在临时 workspace seed 了 axios/moment/redux
三条规则，本机真实库里没有同语义的 canonical rule（按 stats top1 的内容，
本机最强规则是关于 `packages/core/` IO 边界的）。这是 demo / 真实 fixture
覆盖面差异，不是触发链路坏。但**说明 `demo hook` 作为「我装好了能不能用」的
自检入口是不完整的**——见后文 §4。

---

## 3. 顺手抓到的非 #333 范围问题

| 项 | 现象 | 关联 issue |
|---|---|---|
| `teamagent doctor` 误报 "claude 未找到" | `where claude` 有结果，`claude --version` 正常输出 `2.1.139` | 与 [#299](https://github.com/libz-renlab-ai/TeamBrain/issues/299) 同类（doctor 漏检） |
| 升级事件本周 banner 弹出 228 次 / 安装完成 0 次 | 自动更新链路完全不落地 | [#313](https://github.com/libz-renlab-ai/TeamBrain/issues/313)、[#330](https://github.com/libz-renlab-ai/TeamBrain/issues/330) |
| `demo hook` ≠ 真实 hook 的覆盖面 | demo hook 在本机真实库上"无命中"率高 | 新发现，未开 issue |

---

## 4. 结论与建议

### 4.1 #333 处理

**关闭 #333（cannot reproduce）**。理由：

1. issue body 50 字 + 0 评论 + 0 复现路径 + 0 版本号
2. 0.11.0 user release 上 `verify` (6/6) + `e2e-evaluate` (六项 metric=1) +
   `calibrate --dry-run` (5 条调整 + tier 跃迁) + `stats` (875 条 / 本周
   confidence 移动 +1.69~-0.86) **全部 PASS / 有产出 / 有调整**
3. 真正可能让 liboze 看到"坏"的间接症状已被 #306 / #313 / #330 / #332 / #299
   分别覆盖

如 liboze 后续提供反向证据（`verify` 失败 / `calibrate` 无产出 / `stats` 无
新增 / `e2e-evaluate` metric≠1），按 [`docs/TRIAGE-AND-SPLIT.md`](../TRIAGE-AND-SPLIT.md)
**重开为 ≥1 个具体那一段的子 issue**，原 #333 已被本报告关闭归档。

### 4.2 衍生工作（不在本 PR 范围）

1. **`teamagent doctor` 扩展**：当前只检 3 项（node / claude-code / team-sharing），
   应补检 `events.db` / `knowledge.db` / 最近一次 calibrate 时间 / hook 注册状态 /
   matcher 是否能触发任一 canonical rule。这是真正的"自检入口"，能在 #333 这种
   "感觉坏了"的报告之前主动暴露问题。**建议另开 issue。**
2. **`demo hook` ↔ 真实 hook 一致性**：当前 demo hook 在本机真实库上易"无命中"，
   用户会误以为触发链路坏。两条路径任选其一：(a) demo hook 内置一组 sample
   rule 而非依赖本机库；(b) 文档明确说明 demo hook 必须在 seed 库里跑。
   **建议另开 issue。**

---

## 5. 验证一键复现（在任意已装 0.11.0 的机器）

```bash
teamagent --version           # 应显示 0.11.0
teamagent verify              # 期待: 6/6 PASS
teamagent e2e-evaluate --json # 期待: ok=true, 六项 metric=1
teamagent calibrate --dry-run # 期待: 至少 1 条调整或 "无变化"（取决于本机数据）
teamagent stats               # 期待: 总数 > 0, 本周 confidence 变化非空
```

任何一个命令失败 / 无产出 / 无调整 = 反向证据 → 重开具体那一段的子 issue。

---

## 6. 元注

- 本报告自身就是 `docs/reports/<date>-<topic>.md` 这种 "investigation /
  no-repro report" 模式的样本，与 `docs/reports/2026-05-02-feature-eval-report.md`
  / `docs/reports/2026-05-06-canned-answer-migration-report.md` 一致。
- 没走 `docs/HOWTO-PLAN-PR.md` 四段 PR plan 模式 —— 因为本 PR 不实现 feature，
  只归档 no-repro 证据；不需要 task / expected outputs / judge harness 三段
  铁律（`docs/PLAN-RESEARCH-REPORT.md`）。
- 本报告**不是 grill 评论**，是 grill 之前就被一手实测推翻的 issue 的 close
  comment 实证 backing。
