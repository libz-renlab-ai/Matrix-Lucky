---
name: teamagent-stats
description: Show TeamAgent knowledge base statistics (total, by-scope, by-category, top hits, recent additions). Use when the user says "看一下知识库", "/stats", "teamagent stats", or asks "我现在有多少条经验".
---

# /teamagent stats — 查看知识库统计

当用户想看 TeamAgent 当前状态时触发。

## 操作

直接调用底层 CLI 并把输出原样展示：

```bash
pnpm teamagent stats
```

输出包含：
- 总数 + 活跃/归档比例
- 按作用域分布（personal / team / global）
- 按分类分布（C 代码层 / E 工程层 / S 策略层 / K 认知层）
- Top 5 高频命中条目（hit_count > 0 才显示）
- 最近 5 条新增

## 空状态处理

如果知识库为空，CLI 会输出提示并列出 `pitfall` 使用方法。直接把输出展示给用户——不要额外解释。

## 注意

- 不做数据总结或二次加工。CLI 输出的文本就是最终答案。
- 如果用户进一步追问某条具体知识，用 SQLite 查询或 CLI explain 查看 `{项目根}/.teamagent/knowledge.db` / `~/.teamagent/global.db`
