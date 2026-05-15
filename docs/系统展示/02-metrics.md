# TeamAgent 系统展示: 二、三个硬指标（开门见山）

Source index: [系统展示.md](../系统展示.md)

## 二、三个硬指标（开门见山）

| 指标 | 实测值 | 数据来源 |
|---|---|---|
| **Benchmark 犯错率相对下降 (PRR)** | **100%**（6 种典型陷阱×3 次重复，baseline 18/18 犯错 → TeamAgent 0/18 犯错） | `packages/benchmark/bench-report.md` 2026-04-20 |
| **累计实时拦截次数** | **2,432 次** hook 触发（含 70 次阻断、91 次警告、2271 次放行） | `docs/dogfood/自举报告.md` 2026-04-20 |
| **知识库自动进化** | **73 条**活跃知识、**6 次** Calibrator 置信度自动调整、**4 条**自动归档 | 同上，来自 `knowledge.db` + `events.db` 直接查询 |

**需要诚实指出的** token 开销 +52%，超出 Phase 2 目标 1.15×——目前的 trade-off 是"多花一半 token，换一次都不犯错"。该指标已进入优化池。

---
