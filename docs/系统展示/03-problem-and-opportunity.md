# TeamAgent 系统展示: 三、为什么做这个系统

Source index: [系统展示.md](../系统展示.md)

## 三、为什么做这个系统

### 3.1 问题

开发团队今天已经普遍把 AI（Claude Code、Cursor）作为主力协作伙伴。但有两类痛点在日常反复出现：

1. **同一个坑不停踩** — AI 上周被纠正过"用 dayjs 替代 moment"，这周换个 session 照犯不误。
2. **经验无法复用** — 资深工程师今天踩过的弯路，明天新人照着 AI 的回答再踩一遍；团队有人摸索出的最佳做法，其他人的 AI 不知道。

手写维护 `CLAUDE.md`、`.cursorrules` 等静态规则文件只是**单人、静态、易过期**的止痛药。Anthropic 自己在 2026-03 上线的 Auto-Memory + Auto-Dream 解决了一半——"从纠正中学习"，但仍然是**事后被动补记忆**，AI 思考 / 动手的时刻没有拦截动作。

### 3.2 机会（市场空位）

做过竞品扫描（详见 `docs/superpowers/specs/2026-04-15-product-roadmap-v2.md` 第四节），2×2 象限显示一个明显的市场真空：

```
                   手写规则              自动捕获规则
                  ┌──────────────────┬──────────────────────┐
  实时拦截         │ Microsoft AGT    │ ⚠️ 市场空位            │
                  │ Codacy Guardrails│  ← TeamAgent 独占位置  │
                  │ OWASP Agentic RT │                       │
                  ├──────────────────┼──────────────────────┤
  事后/上下文      │ .cursorrules     │ Claude Auto-Memory    │
  参考            │ CLAUDE.md (static)│ claude-mem            │
                  │                   │ /insights             │
                  └──────────────────┴──────────────────────┘
```

每一家都只占一边：要么手写 + 实时，要么自动 + 事后。**TeamAgent 是目前唯一同时做到"自动捕获 + 实时拦截"的系统**。

---
