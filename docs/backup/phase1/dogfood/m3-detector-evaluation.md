# M3 Detector 评测报告

> 日期: 2026-04-14 (M3 Commit 6)
> 数据源 1: `fixtures/sessions/` 11 条人工标注 fixture
> 数据源 2: 今天开发 TeamAgent 的真实 Claude Code 会话（994 回合）

## Fixture 评测（对照 _manifest.json）

| 指标 | Correction | Success |
|------|-----------|---------|
| Precision | 100% (7/7) | 100% (4/4) |
| Recall | 100% (7/7) | 80% (4/5) |
| DoD 阈值 | precision≥85%, recall≥70% | ✅ 达标 |

**唯一 MISS**: `correction-multi-failure-01.jsonl` turn 2 的 `one_shot_success` 未报——因为是会话最后一 turn，detector 要求"下一 turn 存在且无 denial/praise"才能判定，这是合理的保守策略。

运行方式: `pnpm tsx scripts/evaluate-detectors.ts`

## 自举评测（今天实际 Claude Code 会话）

命令: `teamagent analyze`（分析最近会话）

```
源: 最近会话 39f86e78-6da4-4c73-8d36-b9a63e52e8c2
回合数: 994

▸ 纠正时刻 56
    - explicit_denial: 14
    - suggestion_override: 3
    - code_edit: 39

▸ 成功信号 16
    - repeated_pattern: 8
    - explicit_praise: 2
    - one_shot_success: 6
```

## 观察与 Tech Debt

### 真实观察

- **explicit_denial 14 次** 大致对应今天我用"不对 / 不要 / 换 X"纠正 AI 的次数，符合体感
- **suggestion_override 3 次** 低估——今天至少 5 次指定工具选型（Zustand/dayjs/pnpm...）
- **code_edit 39 次** 显著高估

### Tech Debt 1: code_edit false positive

**现象**: code_edit 在自己的开发会话里把 AI **主动写大段代码** 也算成纠正。

**原因**: 当前 rule-based 只看"当前 turn 的 Edit 工具 new_string >> old_string"——但这对"让 AI 从头写一个新函数"也会触发。

**改进路径**:
- **M4**（短期）: LLM extractor 能读上下文，区分"用户说'我改了'" vs "用户说'帮我实现'"
- **M6**（中期）: confidence 校准——高频误提取的知识 confidence 会被 override 降权自动归档
- **长期**: 增加 detector 启发："大幅重写"只有在 **之前 AI 写过这段代码** 时才算 code_edit（需要同 file 前后对比）

### Tech Debt 2: suggestion_override recall 偏低

**现象**: rule-based 只抓"用 X 吧" + "X 更好" 句式，漏了"其实 X 更适合"、"不如用 X"、"我一般用 X"等变体。

**改进路径**: M4 LLM 提取天然覆盖语义层面，规则扩展价值有限，不修。

### Tech Debt 3: 最后 turn 的 one_shot_success 无法判定

**现象**: 会话最后一 turn 如果是成功的工具调用，由于没有"下一个 user 回复"可参考，detector 保守跳过。

**改进路径**:
- M3 不修（合理保守）
- M4 LLM 看完整上下文可判断

## M3 DoD 达成情况

- [x] Fixture precision ≥ 85% + recall ≥ 70%
- [x] analyze CLI dry-run 可用
- [x] 自举：对自己的开发会话跑 analyze 并得到数据
- [x] 公开 3 条 tech debt 给 M4 处理

## 下一步：M4

- LLM extractor 把上述 56 次纠正结构化为知识条目
- Pipeline 编排 detector → extractor → store → compiler 一条龙
- `analyze --commit` 开关
- 预期：今天 56 次纠正里 ≥10 条能被有效提取为可复用的 Personal/Team 知识
