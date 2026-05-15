# TeamAgent Design System Directions

Date: 2026-05-01

This directory records the three approved visual cases from `/design-consultation`.
All three serve the same product memory:

> 老员工的 Claude Code 犯过的错，新来的员工的 Claude Code 不再犯。

## Core Positioning

TeamAgent is not generic AI memory, a linter, a compliance dashboard, employee
monitoring, or an AI wrapper. It is a runtime team-experience layer for Claude
Code, Codex, and agent workflows.

The product loop:

```text
mistake -> capture -> compile rule -> enforce at runtime -> verify -> no repeat
```

## The Three Cases

| Case | Use | File |
|---|---|---|
| A. Evidence Console | Main marketing homepage and primary brand direction | [evidence-console.md](evidence-console.md) |
| B. Terminal Native | Product video, CLI demo, hook replay, dark execution scenes | [terminal-native.md](terminal-native.md) |
| C. Knowledge Archive | Docs, trust, case studies, rule lineage, team handoff | [knowledge-archive.md](knowledge-archive.md) |

## Implementation Guides

| Guide | Use | File |
|---|---|---|
| Design tokens | Shared type, color, spacing, radius, and motion rules | [tokens.md](tokens.md) |
| Video storyboard | 90-second launch video structure and shot language | [video-storyboard.md](video-storyboard.md) |
| Homepage plan | Case A homepage sections and page copy | [homepage.md](homepage.md) |
| Product video | Case B 90-second script and shot plan | [product-video.md](product-video.md) |
| Trust docs page | Case C docs/trust sections and copy | [trust-docs-page.md](trust-docs-page.md) |

## Shared Rules

- Use real engineering evidence: terminal, diff, hook event, `AGENTS.md`,
  rule card, `judge.json`, statusline, dashboard, and attribution output.
- Repeat the product loop visually. Do not rely on abstract "memory" language.
- Avoid purple gradients, AI brains, robots, floating orbs, generic stock
  imagery, bubbly cards, and three-column SaaS feature grids.
- Use color as state language: old error, learned rule, warning, blocked action,
  verified result.
- Keep layouts dense enough for developers to trust, but not so dense that the
  first viewport becomes unreadable.

## Project-Level Source Of Truth

The project-level design source is now [../../DESIGN.md](../../DESIGN.md).
Use that file first for implementation decisions, then use this directory for
case-specific detail.

## Project-Local Visual References

The generated design artifacts have been copied into this repo:

```text
docs/design-system/artifacts/2026-05-01/
```

Key files:

- `mockups/variant-A-evidence-console.png`
- `mockups/variant-B-terminal-native.png`
- `mockups/variant-C-knowledge-archive.png`
- `mockups/design-board.html`
- `html-preview/finalized.html`
- `html-preview/verify-desktop.png`
- `html-preview/verify-tablet.png`
- `html-preview/verify-mobile.png`
