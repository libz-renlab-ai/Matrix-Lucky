# Design System — TeamAgent

Date: 2026-05-01

## Product Context

- **What this is:** TeamAgent is a runtime team-experience layer for Claude Code, Codex, and agent workflows.
- **Who it is for:** Engineering teams that need AI agents to inherit hard-won team rules, avoid repeated mistakes, and show evidence for their claims.
- **Category:** AI coding agent infrastructure, agent memory, rule enforcement, developer workflow.
- **Project type:** Marketing site, product video, docs/trust pages, and CLI-oriented product surfaces.

## Memorable Thing

老员工的 Claude Code 犯过的错，新来的员工的 Claude Code 不再犯。

Every visual decision should make that loop visible:

```text
mistake -> capture -> compile rule -> enforce at runtime -> verify -> no repeat
```

## Primary Direction

Use **Case A: Evidence Console** as the default brand and homepage system.

- Light engineering workbench.
- Dark evidence console as the product hero.
- Real artifacts: terminal, diff, hook event, rule card, `judge.json`, `AGENTS.md`.
- State colors carry meaning, not decoration.

Use the supporting directions intentionally:

- **Case B: Terminal Native** for product video, CLI demo, hook replay, and dark execution scenes.
- **Case C: Knowledge Archive** for docs, trust, privacy, rule lineage, onboarding, and case studies.

## Aesthetic

- **Direction:** Industrial / utilitarian engineering evidence.
- **Decoration:** Minimal to intentional. UI evidence is the decoration.
- **Mood:** Serious, inspectable, source-first, and runtime-native.
- **Avoid:** AI brains, robots, purple gradients, floating orbs, bubbly cards, generic SaaS icon grids, stock imagery.

## Typography

Use:

```css
--font-sans: "IBM Plex Sans", "Noto Sans SC", sans-serif;
--font-mono: "IBM Plex Mono", "Noto Sans Mono CJK SC", monospace;
```

Roles:

- **Display / body:** IBM Plex Sans.
- **Chinese fallback:** Noto Sans SC.
- **Code / status / event names / JSON / rule IDs:** IBM Plex Mono.

Do not use Inter, Roboto, Arial, Helvetica, Open Sans, Lato, Montserrat, Poppins, or Space Grotesk as the primary identity.

## Color

Core palette:

```css
--workbench: #F8FAFC;
--archive: #FAFAF9;
--console: #0B0F14;
--panel-dark: #111827;
--panel-light: #FFFFFF;
--text: #101820;
--text-dark: #E5E7EB;
--muted: #64748B;
--line: #D9E0E7;
--primary: #0F766E;
--primary-strong: #0D9488;
--success: #15803D;
--warning: #B45309;
--danger: #B91C1C;
--info: #2563EB;
```

Meaning:

- Red means historical mistake or active danger.
- Teal means TeamAgent action or learned rule.
- Green means verified outcome.
- Amber means warning, uncertainty, or pending verification.

## Spacing And Shape

- **Base grid:** 8px.
- **Density:** Dense enough for developers to trust, sparse enough to scan.
- **Default radius:** 8px.
- **Small utility radius:** 2px to 4px.
- **Full radius:** Only for compact status chips.

## Layout

Homepage hero:

```text
desktop: 40% copy / 60% evidence console
mobile: headline -> CTA -> evidence console
```

Rules:

- The product itself must be visible in the first viewport.
- The next section should peek below the fold.
- Use real evidence panels instead of abstract feature cards.
- Product UI can be dense; marketing copy should stay short.

## Motion

Use motion only to explain system behavior:

- log append
- rule match highlight
- diff reveal
- tool call pause
- judge result transition
- rule lineage expand/collapse

No decorative motion.

## Project Artifacts

Detailed docs:

- `docs/design-system/README.md`
- `docs/design-system/evidence-console.md`
- `docs/design-system/terminal-native.md`
- `docs/design-system/knowledge-archive.md`
- `docs/design-system/tokens.md`
- `docs/design-system/video-storyboard.md`

Project-local visual artifacts:

- `docs/design-system/artifacts/2026-05-01/mockups/design-board.html`
- `docs/design-system/artifacts/2026-05-01/mockups/variant-A-evidence-console.png`
- `docs/design-system/artifacts/2026-05-01/mockups/variant-B-terminal-native.png`
- `docs/design-system/artifacts/2026-05-01/mockups/variant-C-knowledge-archive.png`
- `docs/design-system/artifacts/2026-05-01/html-preview/finalized.html`
- `docs/design-system/artifacts/2026-05-01/html-preview/verify-desktop.png`
- `docs/design-system/artifacts/2026-05-01/html-preview/verify-tablet.png`
- `docs/design-system/artifacts/2026-05-01/html-preview/verify-mobile.png`

## Decisions Log

| Date | Decision | Rationale |
|---|---|---|
| 2026-05-01 | Use Evidence Console as the primary brand direction | It makes the product loop inspectable in one screen. |
| 2026-05-01 | Use Terminal Native for video and CLI scenes | Runtime intervention is easiest to understand when shown in the terminal. |
| 2026-05-01 | Use Knowledge Archive for docs and trust | Rule lineage reduces fear that TeamAgent invents hidden policy. |
