---
name: pitfall
description: Record a pitfall (experience/lesson) into TeamAgent knowledge base. Use when the user says "记录一下这个坑", "记一个踩坑", "/pitfall", or wants to capture what they just learned so AI doesn't repeat the mistake.
---

# /pitfall — 记录踩坑经验到 TeamAgent

当用户想要手动记录一条踩坑或最佳实践经验时触发。操作流程：

## 1. 收集必要信息（通过对话）

问用户以下信息。如果已经从上下文得到答案就不要再问。

- **触发场景**（trigger）：什么情况下会触发这个坑？
- **错误做法**（wrong_pattern）：错在哪？（留空表示这是一条 practice 型经验而非避坑型）
- **正确做法**（correct_pattern）：应该怎么做？
- **原因**（reasoning）：为什么？

可选信息（用户不主动提就用默认值）：

- **分类**（category）：`C`=代码层 / `E`=工程层 / `S`=策略层 / `K`=认知层（默认 `E`）
- **作用域**（level）：`personal`=仅自己 / `team`=本项目成员 / `global`=所有项目（默认 `personal`）
- **性质**（nature）：`objective`=客观事实 / `subjective`=主观偏好（默认 `subjective`）

## 2. 调用底层 CLI 入库

使用 Bash 工具执行非交互模式，字段通过 flag 传递（每个 flag 值用双引号包裹以避免转义）：

```bash
pnpm teamagent pitfall --non-interactive \
  --trigger="..." \
  --wrong="..." \
  --correct="..." \
  --reason="..." \
  --category="E" \
  --level="personal" \
  --nature="subjective"
```

CLI 会：
- 写入对应 scope 的 SQLite knowledge store
- 触发 compile / propagation，刷新 TeamAgent Skills / docs 知识传播产物
- 输出归因块（"做了什么 / 知识库变化 / 传播到 / 下次体验"）

## 3. 把归因块原样展示给用户

CLI 输出的归因块结构已对齐产品设计规范，不要重写或总结——直接透传。

用户看到归因块后就知道：知识条目 id、知识库条目数变化、传播产物、下次 AI 会如何应用这条经验。

## 注意

- 如果用户只给出零散片段（比如只说"记一下 npm 别用 moment"），帮他补全 trigger/reason 等字段，必要时问 1-2 个澄清问题
- `wrong_pattern` 留空时系统会自动判定为 `practice` 型
- 触发后不需要再调用 `pitfall` 命令——一次 CLI 执行完成所有工作
