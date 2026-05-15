# TeamAgent 系统展示: 八、自进化的 4 个子能力（系统"越用越聪明"的具体实现）

Source index: [系统展示.md](../系统展示.md)

## 八、自进化的 4 个子能力（系统"越用越聪明"的具体实现）

### 8.1 自动记忆错误 — Stop Hook 3 阶段流水线

```
Stop Hook 触发
├── analyze：从会话 transcript 里识别"纠正时刻"
│   Signal A: 显式否定词（"别这样"、"不对"）
│   Signal B: 多次失败后成功（N 次报错 → 一次通过）
│   Signal C: 用户 override（AI 建议 X，用户改成 Y）
│   Signal D: AI 主动改策略（"换个方法"）
│   Signal E: 错误粘贴（用户在下一条消息里贴工具的失败输出）
│   → 多信号融合后调用 LLM 提取结构化 KnowledgeEntry
│
├── calibrate：根据历史命中结果调整所有规则 confidence
│   干预成功 +0.05｜用户确认 +0.10｜AI 遵守警告 +0.03
│   AI 忽略警告 −0.08｜用户 override −0.15｜90 天未命中 −0.05
│
└── compile：重新生成 CLAUDE.md + SKILL.md 文件
   按 score=confidence×0.4 + hit_count×0.3 + recency×0.2 + enforcement×0.1 排序
   Top 15 写入 CLAUDE.md TEAMAGENT 区块
```

### 8.2 自动记忆经验 — 成功信号检测

框架已就位（`packages/core/src/success-detector/`），检测"一次成功 + 用户表扬 + 重复使用"等信号。当前累积 10+ 条成功模式，等 benchmark v2 验证后上线。

### 8.3 自动置信度管理 — Calibrator v2（核心创新，见第九节）

### 8.4 自动知识传播 — Phase 4 规划

个人高置信规则 → 自动提议同步到团队 DB；团队新加入成员自动继承团队全部 canonical+ 规则。当前是规划阶段。

---
