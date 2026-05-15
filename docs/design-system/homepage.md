# TeamAgent Homepage Plan — Evidence Console

Date: 2026-05-01
Owner: Case A / Evidence Console
Status: implementation plan + copy

## Goal

首页必须在第一屏讲清 TeamAgent 的核心循环：

```text
old agent mistake -> capture -> compile rule -> enforce at runtime -> verify -> no repeat
```

中文主叙事：

> 老员工的 Claude Code 犯过的错，新来的员工的 Claude Code 不再犯。

设计使用 Case A: Evidence Console。左侧短文案，右侧深色证据控制台；不要抽象 AI 图、机器人、紫色渐变、漂浮装饰或泛 SaaS feature grid。

## Page Sections

1. **Hero / Evidence Console**
   - Desktop: 左 40% 文案，右 60% 深色 evidence console。
   - Mobile: product name -> headline -> CTA -> evidence console。
   - 首屏底部必须露出下一段 proof row 的顶部。
2. **Proof Row**
   - 用真实证据行替代功能卡片。
   - 每行说明一个可检查的运行时能力：hook、rule lineage、judge JSON、local DB、attribution。
3. **How It Works**
   - 三步：Capture mistake、Compile rule、Enforce + verify。
   - 每步配一个小型 artifact：transcript、rule card、judge result。
4. **Trust / Local Control**
   - 强调本地规则、可审计来源、可导出的证据，不强调神秘记忆。
5. **Final CTA**
   - 重复 install CTA，并给 demo / docs 入口。

## Hero Copy

Product label:

```text
TeamAgent
Runtime memory and rule enforcement for AI coding agents
```

Headline:

```text
老员工的 Claude Code 犯过的错，新来的员工的 Claude Code 不再犯。
```

Subhead:

```text
TeamAgent 把一次失败沉淀成可审计规则，在 Claude Code、Codex 和 agent 工作流里实时命中、拦截、归因，并用 judge.json 留下证据。
```

Primary CTA:

```text
Install TeamAgent
```

Install strip:

```bash
npm install -g github:libz-renlab-ai/TeamBrain#release
teamagent init
```

Secondary CTA:

```text
View evidence demo
```

Small trust note:

```text
Rules stay source-linked. Runtime actions stay inspectable.
```

## Evidence Console Content

Console title:

```text
Evidence Console
```

Console tabs:

```text
Runtime
Rule
Judge
Lineage
```

Runtime timeline:

```text
09:41:12 UserPromptSubmit  "fix failing test, skip docs"
09:41:13 RuleMatch         docs-only-scope / confidence 0.94
09:41:13 PreToolUse        blocked write outside docs/
09:41:14 AttributionBus    emitted user-visible reason
09:41:22 Stop              judge requested
```

Rule card:

```text
RULE docs-only-scope
source: AGENTS.md + docs/rules/inside-project-edits.md
trigger: "only edit docs/" task boundary
action: block non-doc file edits, explain allowed scope
tier: project rule
confidence: 0.94
```

Before / after diff:

```diff
- edit CLAUDE.md
- update .gitignore
+ edit docs/design-system/homepage.md
+ keep Markdown under 200 lines
+ report changed files and line count
```

Judge summary:

```json
{
  "exit_code": 0,
  "checks": ["scope", "line_count", "required_sections"],
  "evidence_dir": ".judge/homepage-evidence-console",
  "result": "accepted"
}
```

## CTA Details

- Primary CTA: `Install TeamAgent`; desktop sits beside install strip, mobile is full-width above console.
- Secondary CTA: `View evidence demo`; opens product demo / replay section.
- Buttons should stay short; do not explain behavior inside the label.

Final CTA copy:

```text
把团队已经踩过的坑，变成下一次 agent 自动遵守的规则。
```

Final CTA buttons:

```text
Install TeamAgent
Read the rule lineage
```

## Proof Rows

Use rows, not floating feature cards. Each row should include a monospace artifact and a short Chinese explanation.

| Proof | Artifact | Copy |
|---|---|---|
| Hook enforcement | `PreToolUse blocked` | 在工具调用前命中团队规则，危险动作不会静默发生。 |
| Rule lineage | `source: AGENTS.md` | 每条规则都有来源，不是模型临场编造。 |
| Judge evidence | `judge.json` | 验收结果来自固定 harness 的 JSON，而不是一句“看起来没问题”。 |
| Local memory | `teamagent.db` | 团队经验在本地沉淀，可检查、可迁移、可删除。 |
| Attribution | `AttributionBus.emit` | 用户能看到系统为什么介入，以及介入了什么。 |

## Responsive Notes

- Desktop hero uses 40/60 split; tablet can shift to 45/55; mobile stacks label, headline, subhead, CTA, install strip, console.
- Console on mobile should show one active tab and 4-6 evidence lines, with horizontal overflow only inside code blocks.
- Keep type stable; do not scale font size by viewport width.
- Use 8px grid, 8px max radius, and compact monospace chips for status labels.
- The next proof row must peek below the hero on common desktop and mobile viewport heights.

## Acceptance Criteria

- First viewport contains product name, headline, CTA, install command, and visible evidence console.
- Homepage uses Case A palette and typography from `DESIGN.md`.
- No AI brain, robot, purple gradient, floating orb, stock image, or generic icon grid appears.
- Evidence console includes runtime timeline, rule card, before/after diff, and `judge.json` summary.
- Page includes CTA, proof rows, responsive notes, and final CTA copy.
- Chinese is the primary language; code, status, and CTA labels may use English.
- Markdown source stays under 200 lines.
