# Phase 1 历史存档

> 归档日期：2026-04-15（Phase 1 收尾、Phase 2 启动时归档）

本目录存放 Phase 1 期间产生的**历史文档**。它们记录"Phase 1 发生了什么"，不是 Phase 2+ 的活文档。

不要在 Phase 2+ 的开发中以这些文档为真相源——真相源是：
- `docs/specs/2026-04-13-teamagent-design.md`（v5.2，系统的原始设计，仍然有效）
- `docs/superpowers/specs/2026-04-15-product-roadmap.md`（Phase 2+ 路线图）
- `docs/superpowers/specs/2026-04-15-phase2-design.md`（Phase 2 设计）
- `docs/specs/2026-04-15-phase2-backlog.md`（Phase 1 遗留漏洞）

## 目录内容

### `specs/`

| 文件 | 说明 |
|------|------|
| `2026-04-14-teamagent-phase1-plan.md` | Phase 1 的 7 个 Milestone 计划（v1.2）。已全部执行完毕。 |

### `dogfood/`

| 文件 | 说明 |
|------|------|
| `m3-detector-evaluation.md` | M3 里程碑 detector 评测报告 |
| `m4-extraction-evaluation.md` | M4 里程碑 LLM extractor 评测报告 |
| `m5-bootstrap.md` | M5 里程碑 init 流程自举报告 |
| `m6-calibration.md` | M6 里程碑 Calibrator 评测报告 |
| `m7-final.md` | M7 Phase 1 收尾综合报告 |
| `verify-report.md` | 2026-04-15 `pnpm verify` 的快照（下次运行会在 `docs/dogfood/` 生成新的） |
| `自举报告.md` | 2026-04-15 `pnpm dogfood-report` 的快照（同上） |

## 恢复

需要把某个文件拿回 active 目录时，用 `git mv` 保留历史即可。
