# TeamAgent 系统展示: 九、核心技术创新（4 项）

Source index: [系统展示.md](../系统展示.md)

## 九、核心技术创新（4 项）

### 9.1 Calibrator v2：Wilson + Demerit + 5-Tier 双轨评分

**问题**：简单的 ±0.05 加减容易被噪声扰动，false positive 的代价远高于 true positive 的收益（非对称）。

**创新**：**双轨分数 + 悲观合并**——升分和降分走两条独立通道，`effective_tier = min(tier_from_confidence, tier_from_demerit)`。

| 升分通道（confidence） | 降分通道（demerit） |
|---|---|
| Wilson Score Lower Bound（统计置信区间） | 驾照扣分制（4 级死亡链） |
| 时间加权观察（半衰期 30-90 天） | 对高 tier 违规使用 log-loss 放大惩罚 |
| 用户确认权重 +0.10 | AI 忽略警告 +5｜用户 reject +10 |
| 小样本时更保守 | demerit≥5 软降、≥15 硬降、≥30 归档 |

**5 层成熟度**（experimental → probation → stable → canonical → enforced），带 hysteresis 防抖，防止噪声导致快速抖动。实测中系统已做过 6 次自动校准，其中 3 次是 tier 晋升（自举报告 Top 5）。

**Dormant 复活机制**：被归档的规则如果 demerit 指数衰减到 < 50，可以复活回 experimental——已在最近一次 fix commit 中验证生效（`63b6a51 fix(calibrator-v2): fix dormant resurrection`）。累计 3 次复活则永久归档，防"僵尸规则"死循环。

### 9.2 双层知识存储 — 路由即隐私边界

```
~/.teamagent/global.db      ← scope.level=global（机器级通用，如 "本机 python3 指向 python3"）
{project}/.teamagent/knowledge.db ← scope.level=personal/team（项目本地个人/团队知识）
[Phase 4] git transport / privacy redaction / review gates ← 团队跨机器共享
```

**写入按 scope 自动路由，查询两层合并返回**。personal/team 留在项目库，global 留在机器级全局库；跨机器团队共享仍要等 transport、脱敏和审核门闭环。

### 9.3 AttributionBus — 结构化归因而非字符串输出

组件**禁止**直接 `console.log`；所有"系统帮你做了什么"通过 `bus.emit(event)` 发 `AttributionEvent`，由 `StdoutRenderer` 统一渲染。

好处：
1. 支持 `silent/smart/verbose` 三档可见性（smart 只显示真正帮到用户的提示，避免噪音）
2. 每个事件带 `userFacingValue`（有感价值）和 `counterfactual`（反事实），verbose 模式可展示完整决策链
3. 测试用 `InMemoryAttributionBus` 断言事件，不用匹配字符串

### 9.4 Functional Core, Imperative Shell — 架构约束

强制约定：`packages/core/` 下**禁止 import `fs` / `node:fs` / `node:child_process`**。核心逻辑全是纯函数（scorer、matcher、calibrator、detector），时间等副作用源通过参数注入（`scoreEntry(entry, maxHitCount, now)`）。好处：

- 核心逻辑可被 100% 单元测试
- Windows 下 vitest 顺序跑也能跑完全部
- 重构核心算法不需要碰 IO 层

---
