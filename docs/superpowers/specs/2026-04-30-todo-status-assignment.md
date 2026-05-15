# TeamAgent TODO / Status / Assignment（2026-04-30）

> 更新时间：2026-04-30
> 用途：同步当前任务清单、进度状态、负责人分配与卡点。

## 变更摘要

- **T5** → 负责人更新为 **lbz + lsy**，已收到关键反馈：**Claude APP 无法使用 TeamAgent**。
- **T11** → **已删除**（RAG 性能增强不属于当前基础功能，优先完整 demo）。
- **T12** → 负责人 **lsy**，状态 **未开始**。
- **T14** → 负责人 **lsy**，状态 **未开始**。
- **T15** → **缩减范围**，仅保留“拓展到 Codex CLI”。

## 完整 TODO（更新后）

| 编号 | 任务 | 状态 | 负责人 |
| --- | --- | --- | --- |
| T1 | 查系统运行日志，反向研究规则引擎问题 | 进行中 | lsy |
| T2 | 团队功能实现（检查 + 修复 bug） | 未完成 | lbz |
| T3 | 前端看板（用户版 + 投资人版） | mock 完成 | lsy |
| T4 | 病毒式传播 | 开始推进 | lbz |
| T5 | 收集用户反馈 | 进行中 | lbz + lsy |
| T6 | 自动升级 | ✅完成 | lbz |
| T7 | 录音收集 + 自动分析 + CC 加载查询 | 未开始 | lsy |
| T8 | Claude Code 自动化提交 PR | 进行中 | lsy |
| T9 | 团队规则传播（中央服务器 vs git） | 待确认 | lbz |
| T10 | UserPromptSubmit hook 加 ASCII art | 未开始 | lsy |
| T11 | ❌ 已删除（RAG 性能增强，非基础功能） | - | - |
| T12 | 一键报告 bug | 未开始 | lsy |
| T13 | GitHub Pages 一键安装（Win + Mac） | 未开始 | 未指派 |
| T14 | 修复 teamAgent init HF 模型下载 | 未开始 | lsy |
| T15 | 拓展到 Codex CLI（缩减范围） | 未开始 | 未指派 |
| T16 | 禁用 Claude APP，检测 + 强制卸载 | 新增 | lsy |

## T5 反馈详情

- 用户反馈：**Claude APP 无法使用 TeamAgent**。
- 应对动作：**lsy 已新增 T16**，策略是检测到 Claude APP 即停止支持并要求卸载。
- 范围联动：保留 T15 的“拓展到 Codex CLI”部分，其余扩展项删除。

## 当前卡点

- 🔴 **T9 团队规则传播方案未定**：阻塞 T4 病毒传播。
- 🔴 **T14 HF 模型下载被墙**：阻塞 init 流程（现有方案：HF → mirror → ModelScope）。
- 🟠 **Schema 不一致**：`index.json` 数组 vs `{ "insights": [] }`。
- 🟠 **硬编码路径**：`C:/bzli/teamagent` + `hooks.json` 本机路径。
- ⚠️ **额度问题**：lbz 的 Claude + Codex 额度已用完。

## 未指派任务与建议

- **T13 一键安装**：建议分配给 **lbz**（与 T4 病毒传播配套）。
- **T15 拓展到 Codex CLI**：建议分配给 **lbz**（工程向，且可复用其对 CC 客户端经验）。

## 建议优先级

主线：

> T9（定方案） → T14（修 HF） → T2（团队 bug） → T4（传播） → T13（安装）

并行线：

> T16（禁用 Claude APP） + T12（bug 报告） + T10（ASCII art）
