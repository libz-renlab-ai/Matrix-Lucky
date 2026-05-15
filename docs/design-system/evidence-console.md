# Case A: Evidence Console

## Role

Evidence Console is the primary TeamAgent marketing-site direction.

It should own the homepage, above-the-fold product story, primary screenshots,
and the default brand feel.

## One-Screen Promise

老员工的 Claude Code 犯过的错，新来的员工的 Claude Code 不再犯。

## Aesthetic

Evidence Console is a light engineering workbench with a dark evidence console.
It should feel like a serious tool for teams that need agent behavior to be
visible, explainable, and repeatable.

It is not hacker cosplay. It is not an abstract AI memory diagram. It is the
place where a mistake becomes a verified runtime rule.

## Layout

Use a two-zone first viewport:

- Left 38-42%: product name, headline, short explanation, install CTA, demo CTA.
- Right 58-62%: evidence console showing the product loop.

The hero visual should show three connected states:

```text
old agent mistake -> TeamAgent rule compiler -> new agent blocked/verified
```

The next section should be visible at the bottom of the first viewport.

## Typography

- Display/body: IBM Plex Sans feeling.
- Code, timestamps, rule IDs, JSON, status chips: IBM Plex Mono feeling.
- Chinese fallback: Noto Sans SC.

Do not use Inter, Roboto, Arial, Helvetica, Open Sans, Lato, Montserrat,
Poppins, or Space Grotesk as the primary face.

## Color

Use a light workbench plus dark console.

```text
Workbench: #F8FAFC
Console:   #0B0F14
Primary:   #0F766E
Text:      #101820
Muted:     #64748B
Line:      #D9E0E7
Success:   #15803D
Warning:   #B45309
Danger:    #B91C1C
Info:      #2563EB
```

Use red only for old mistakes. Use teal/green for learned or verified states.
Use amber for warnings and pending decisions.

## Components

- Hero evidence console.
- Rule card with source, trigger, correct action, confidence, tier.
- Hook event timeline: `UserPromptSubmit`, `PreToolUse`, `PostToolUse`, `Stop`.
- Before/after diff with 8-12 visible lines.
- `judge.json` summary block.
- Install command strip.
- Trust proof row: tests, dashboard, local DB, attribution, dogfood report.

## Motion

Motion should explain system behavior:

- log line appends
- rule match highlight
- diff reveal
- tool call pause
- judge result transition

No decorative motion. No floating particles.

## Safe Choices

- Real product UI as brand surface.
- High-density but readable evidence panels.
- Restrained state colors.

## Creative Risk

Use "error immunity" as a metaphor, but keep it engineering-native. Do not use
medical imagery. The immune record is a rule lineage, not a biological graphic.

## Best Use

Use this case for:

- marketing homepage
- default design tokens
- sales narrative
- primary product screenshots
- final CTA sections

