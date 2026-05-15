# TeamAgent 系统展示: 十七、引用与可追溯

Source index: [系统展示.md](../系统展示.md)

## 十七、引用与可追溯

所有数据均可审计：

- **设计文档**：`docs/specs/2026-04-13-teamagent-design.md`（v5.2）、`docs/superpowers/specs/2026-04-15-product-roadmap-v2.md`、`docs/superpowers/specs/2026-04-15-phase2-design-v2.md`
- **技术文档**：`docs/SYSTEM.md`（开发者视角完整技术细节，读完理解 90%）
- **实测报告**：`docs/dogfood/自举报告.md`、`packages/benchmark/bench-report.md`（系统自动生成，未经人工修饰）
- **源代码入口**：`packages/cli/src/bin*.ts`（4 个 hook + CLI）、`packages/core/src/calibrator/v2/`（核心算法）
- **Dashboard**：`docs/dashboard.html`（打开可看实时可视化）
- **Git 历史**：`feat(m{N})` / `fix(m{N})` / `sp{N}` 前缀可按 Milestone 过滤

---

*本文档对齐 2026-04-20 代码截面生成。如代码变更，请以实测报告的最新数字为准。*
