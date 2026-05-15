# M3 — Block 绕行检测 + 规则解冻 mini-spec

状态：已实施 (2026-04-22)
作者：tianhaoxuan + Claude
分支：main

---

## 背景

手动验证拦截机制时发现三个串联的系统缺陷，会共同导致**规则分永不下降**，
自学习反馈回路失效：

### 洞 1 — matcher 僵尸规则

`packages/core/src/matcher/keyword-matcher.ts:38` 原为：

```typescript
if (rule.type !== "avoidance") continue;
if (!rule.wrong_pattern) continue;
```

但 seed/rules.jsonl 里 LLM extractor 产出了 34 条 `type=practice`
且 `wrong_pattern!=''` 的规则，其中 11 条 `enforcement=block`。
这些规则被第一行筛掉，永不命中 matcher → 永不产 hook-pre.blocked/warned
事件 → hit_count/override_count 冻住 → calibrator v2 tier 无法升降 →
永久僵尸数据，仅在 CLAUDE.md 编译时当"参考读物"出现。

**验证手段**：

```
node -e "const { DatabaseSync } = require('node:sqlite');
const db = new DatabaseSync('.teamagent/knowledge.db');
console.log(db.prepare('SELECT type, enforcement, COUNT(*) FROM knowledge GROUP BY type, enforcement').all());"
```

### 洞 2 — 解冻后的质量风险

若直接改 matcher (洞 1) 解冻 34 条规则，其中未经过 warn 期观察的
11 条 block 规则会立即生效拦 AI。wrong_pattern 由 LLM 自主产出，
部分字面量过于具体或乱填（如 `"bin-user-prompt-submit.ts"`），
可能引发高频误拦。

### 洞 3 — block 路径免疫降分

Calibrator v2 的 demerit 系统需要 demerit events 驱动：
`ai.override.ignored` / `calibrator.user_reject` / `validator.failure`。

`ai.override.ignored` 由 PostToolUse hook 在检测到同 tool_use_id 的
`hook-pre.warned` 时 emit。但：

- **block 规则 deny tool → tool 根本没执行 → harness 不触发
  PostToolUse hook → 无 ignored 事件 → 规则永远无法扣分。**
- `calibrator.user_reject` 事件 schema 定义了，但**无生产代码 emit**
  (grep `calibrator.user_reject` 只出现在消费侧和测试)。

结果：所有 enforcement=block 的规则一旦入库即"永久免疫"降分。若某条
block 规则是错的，AI 只能反复被拦，系统学不到任何反馈。

---

## 设计决策

### 三洞修法组合：A + C + 方案 1

| 洞 | 修法 | Commit |
|---|-----|-------|
| 1 | matcher 脱钩 type，仅凭 wrong_pattern 有无决定是否参与匹配 | `refactor(m3): decouple matcher from rule.type` |
| 1 延伸 | validator L0 加反向校验 `type/wrong_pattern 对齐`；extractor prompt 紧约束 | `fix(m3): validator L0 enforces type/wrong_pattern alignment` |
| 2 | 一次性 SQL 脚本降级 10 条未经观察的 practice+block 到 warn | `chore(m3): one-shot script to degrade practice+block rules` |
| 3 | PostToolUse 成功后检测同 tool_name 的近期 blocked 事件，emit `ai.override.blocked_circumvented` 进 demerit 管道 | commits 4-6 |

### 方案 1 的关键参数

| # | 决策点 | 选择 | 权衡 |
|---|-------|-----|------|
| A | 等价操作判定 | **同 tool_name + 时间窗口** | 简单；假阳性控制靠时间窗 |
| B | 时间窗口 | **5 min** (同 `detectCompliedSignals` 对称) | 太短漏报 AI 绕路；太长误杀无关操作 |
| C | cwd 约束 | **不加** | 简化；多项目 session 可能误报，接受 |
| D | demerit source 映射 | **复用 `ai_override_ignored`** | 权重一致；未来想差异化再拆 |
| E | 触发条件 | **tool 成功 (inferToolSuccess=true)** | 失败=AI 尝试了但没成功，不算绕路完成 |

### 新增核心算法

`detectBlockedCircumventedSignals(currentToolName, recentEvents, now, windowMs=300_000)`

位置：`packages/core/src/pipeline/override-signal.ts`

- 扫 recentEvents 找 `kind=hook-pre.blocked` AND `tool_name===currentToolName` AND timestamp 在窗口内
- **去重 1**：跳过已被先前 `ai.override.blocked_circumvented` 事件消费过的 knowledge_id
- **去重 2**：同一 knowledge_id 在 recentEvents 里多条 blocked 只计一次

与 `detectCompliedSignals` 对称：complied 判奖励信号（AI 被 warn 后改道），
circumvented 判惩罚信号（AI 被 block 后绕路）。

### persisted-event schema 扩展

`packages/types/src/persisted-event.ts` 的 `kind` enum 加入
`"ai.override.blocked_circumvented"`。向后兼容（新增可选值）。

### hook-pre.blocked 事件字段补全

原 blocked 事件不带 `tool_name`，新算法需要此字段。改为与 warned 对齐携带
tool_name。向后兼容：老事件无此字段 → 检测函数自然不命中（tool_name 对比 undefined）。

---

## 闭环效果

```
[被 block]
  AI 调 tool X 被 block → hook-pre.blocked 事件 (带 tool_name) 落盘
       ↓
[AI 换路子]
  AI 改用同类 tool X 的另一种调用 → PostToolUse 触发
       ↓
[侦探工作]
  扫 recent events 找 5 min 内 tool_name 匹配的 blocked
       ↓
[扣分]
  emit ai.override.blocked_circumvented → calibrator v2 demerit+
       ↓
[后续轮次]
  demerit 累加 → tier 自动降级 → enforcement 弱化或进 dormant
  规则从被 AI 反复绕开 → 系统识别其质量差 → 自动归档
```

与原 warn 路径 (complied/ignored) 组成完整正负反馈：

| 事件 | AI 行为 | calibrator 动作 |
|------|--------|----------------|
| `ai.override.complied` | 被 warn 后改道 | confidence+ (奖励) |
| `ai.override.ignored` | 被 warn 后照样干 | demerit+ (惩罚) |
| `ai.override.blocked_circumvented` | 被 block 后绕路干 | demerit+ (惩罚，M3 新) |

---

## 假阳性场景与缓解

**场景**：Session 里连续跑两个无关的 Bash 任务，第一个恰好触发 block，
第二个无关但 5 min 内跑成功 → 被误判 circumvented。

**缓解手段**：

1. **已做**：基于 tool_name 粗粒度匹配，Bash 和 Write 不会串扰
2. **可选升级**：加 input 相似度判定（Bash command token Jaccard > 阈值、
   Write file_path 相同）。观察一段时间假阳率决定是否上
3. **长期**：cwd 匹配。需给 blocked 事件再补 `cwd` 字段，侵入性更大

---

## 已知限制

- **多条 block 同 knowledge_id 的时间顺序**：若一个规则在 5 分钟内被多次 block，
  去重后只计一次 circumvented。希望更敏感的话，改 window / 放宽去重。
- **hook 失败 fallback**：bin-pre-tool-use.cjs 顶层 catch 吞错误 exit 0
  (hook error 不阻断工作流)。如果 catch 命中，不发 blocked 事件 → 侦探看不到
  → 不扣分。目前符合设计（hook 错不该误伤 AI）。
- **事件 id 冲突**：手动重试 hook 同 tool_use_id 会 `UNIQUE constraint failed`。
  生产 tool_use_id 每次 uuid 不会踩到，但测试/debug 会。未在 M3 范围内修复。

---

## 回归与验证

- 全量测试：1165/1165 绿 (含 M3 新增 17 个测试)
- 关键新测试：
  - `override-signal.test.ts`: `detectBlockedCircumventedSignals` 7 个用例（窗口内命中/窗外/tool_name不匹配/已消费去重/重复去重/多规则/windowMs 自定义/忽略 warned）
  - `pre-tool-use-sdk.test.ts`: blocked 事件携带 tool_name
  - `post-tool-use-sdk.test.ts`: 成功绕行 emit / 失败不 emit / tool_name 不同不 emit
  - `v2.test.ts`: `ai.override.blocked_circumvented` 事件 → demerit 增加
  - `keyword-matcher.test.ts`: practice+wrong_pattern 规则参与匹配 / 空 wrong_pattern 跳过
  - `l0.test.ts`: practice/avoidance 与 wrong_pattern 对齐约束

- 手动 E2E（可选做）：
  1. `echo '<local-command-caveat>'` → block（conf 1.0 规则）
  2. 5 min 内再 `echo something` → PostToolUse 侦探 → events.db 多一条
     `ai.override.blocked_circumvented` → 下一轮 calibrator 跑后规则 demerit+

---

## Commit 序列

```
009a165 feat(m3): detectBlockedCircumventedSignals core algorithm
6d77651 refactor(m3): hook-pre.blocked event carries tool_name
f1716c1 feat(m3): PostToolUse emits blocked_circumvented → demerit pipeline
12b5523 refactor(m3): decouple matcher from rule.type, key only on wrong_pattern
8e5736b fix(m3): validator L0 enforces type/wrong_pattern alignment
ceb45c8 chore(m3): one-shot script to degrade practice+block rules to warn
```

设计顺序：先补 demerit 通道（方案 1），再解冻规则（A），再防脏数据（C），
最后软着陆（洞 2）。保证任何时刻若 block 规则误拦，自动扣分机制已就位。
