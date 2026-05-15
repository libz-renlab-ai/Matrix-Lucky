# TeamAgent Verify 报告

> 生成时间: 2026-04-15T03:46:54.116Z
> 场景数: 5

## 总览

| 指标 | 值 |
|------|----|
| 通过率 | 5/5 (100%) |
| 平均 PRR (Pitfall Reduction Rate) | 100.0 |
| 平均 KP (Knowledge Precision, 1-5) | 5.00 |

## 每个场景明细

### python-version ✓

- PRR: 100
- KP: 5.00

**Phase A (踩坑)**:

- detector 调用: ✓
- 识别到纠正: 1 条
  - explicit_denial: ✓

**Phase B (学习)**:

- 规则生成: ✓
  - category == C: ✓
  - type == avoidance: ✓
  - nature == objective: ✓
  - wrong_pattern contains "python": ✓
  - correct_pattern contains "python3": ✓

**Phase C (避坑)**:

- 期望行为: block
- 实际行为: block
- 通过: ✓

### tech-choice ✓

- PRR: 100
- KP: 5.00

**Phase A (踩坑)**:

- detector 调用: ✓
- 识别到纠正: 1 条
  - explicit_denial: ✓

**Phase B (学习)**:

- 规则生成: ✓
  - category == E: ✓
  - type == avoidance: ✓
  - nature == subjective: ✓
  - wrong_pattern contains "redux": ✓
  - correct_pattern contains "Zustand": ✓

**Phase C (避坑)**:

- 期望行为: warn
- 实际行为: warn
- 通过: ✓

### api-hallucination ✓

- PRR: 100
- KP: 5.00

**Phase A (踩坑)**:

- detector 调用: ✓
- 识别到纠正: 1 条
  - explicit_denial: ✓

**Phase B (学习)**:

- 规则生成: ✓
  - category == C: ✓
  - type == avoidance: ✓
  - nature == objective: ✓
  - wrong_pattern contains "removeAt": ✓
  - correct_pattern contains "splice": ✓

**Phase C (避坑)**:

- 期望行为: block
- 实际行为: block
- 通过: ✓

### security ✓

- PRR: 100
- KP: 5.00

**Phase A (踩坑)**:

- detector 调用: ✓
- 识别到纠正: 1 条
  - explicit_denial: ✓

**Phase B (学习)**:

- 规则生成: ✓
  - category == S: ✓
  - type == avoidance: ✓
  - nature == objective: ✓
  - wrong_pattern contains "sk-": ✓
  - correct_pattern contains "process.env": ✓

**Phase C (避坑)**:

- 期望行为: block
- 实际行为: block
- 通过: ✓

### workflow-order ✓

- PRR: 100
- KP: 5.00

**Phase A (踩坑)**:

- detector 调用: ✓
- 识别到纠正: 1 条
  - explicit_denial: ✓

**Phase B (学习)**:

- 规则生成: ✓
  - category == S: ✓
  - type == avoidance: ✓
  - nature == subjective: ✓
  - wrong_pattern contains "git add .": ✓
  - correct_pattern contains "具体文件": ✓

**Phase C (避坑)**:

- 期望行为: warn
- 实际行为: warn
- 通过: ✓

---

## 关于这份报告

5 个场景测试系统能否完成完整闭环（**踩坑识别 → 知识提取 → 后续拦截**）。
Phase B 用 mock LLM 注入确定响应——实际部署时是真 `claude -p`，输出会有抖动但 shape 一致。

PRR=100% 表示规则成功在 Phase C 拦住了相似错误；KP=5/5 表示提取的规则字段全部符合预期。
