# TeamAgent Design Tokens

## Purpose

These tokens turn the three design cases into a usable system.

Default direction:

- A. Evidence Console for the marketing homepage and default brand.
- B. Terminal Native for video, CLI replay, and dark execution panels.
- C. Knowledge Archive for docs, trust, privacy, and case studies.

## Typography

Primary web stack:

```css
--font-sans: "IBM Plex Sans", "Noto Sans SC", sans-serif;
--font-mono: "IBM Plex Mono", "Noto Sans Mono CJK SC", monospace;
```

Use `--font-sans` for headlines, body copy, navigation, and UI labels.
Use `--font-mono` for command lines, timestamps, rule IDs, event names,
`judge.json`, `AGENTS.md`, and status chips.

Do not use Inter, Roboto, Arial, Helvetica, Open Sans, Lato, Montserrat,
Poppins, or Space Grotesk as the primary identity.

## Type Scale

```css
--text-xs: 12px;
--text-sm: 14px;
--text-md: 16px;
--text-lg: 18px;
--text-xl: 24px;
--text-2xl: 32px;
--text-3xl: 44px;
--text-4xl: 60px;
```

Hero headlines may use `--text-4xl` on desktop and `--text-3xl` on mobile.
Console and dense product UI should mostly stay between `--text-xs` and
`--text-md`.

## Core Palette

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

Use state colors semantically. Red means historical mistake or active danger.
Green means verified outcome. Teal means learned rule or TeamAgent action.
Amber means warning, uncertainty, or pending verification.

## Case Palettes

Evidence Console:

```css
--case-bg: #F8FAFC;
--case-surface: #FFFFFF;
--case-console: #0B0F14;
--case-accent: #0F766E;
```

Terminal Native:

```css
--case-bg: #080B0E;
--case-surface: #111827;
--case-panel: #1F2937;
--case-accent: #22C55E;
```

Knowledge Archive:

```css
--case-bg: #FAFAF9;
--case-surface: #F1F5F9;
--case-accent: #155E75;
--case-archived: #6B7280;
```

## Spacing

Use an 8px base grid.

```css
--space-2xs: 2px;
--space-xs: 4px;
--space-sm: 8px;
--space-md: 16px;
--space-lg: 24px;
--space-xl: 32px;
--space-2xl: 48px;
--space-3xl: 64px;
--space-4xl: 96px;
```

Marketing sections should use `--space-3xl` to `--space-4xl` vertical rhythm.
Product evidence panels should use `--space-sm` to `--space-lg`.

## Radius

```css
--radius-xs: 2px;
--radius-sm: 4px;
--radius-md: 8px;
--radius-lg: 12px;
--radius-full: 9999px;
```

Default card and panel radius is `--radius-md`. Avoid bubbly shapes. Use
`--radius-full` only for status pills and small chips.

## Layout

Desktop hero:

```text
max-width: 1200-1320px
grid: 40% copy / 60% product evidence
```

Mobile hero:

```text
single column
headline first
CTA second
evidence timeline third
```

Marketing pages should reveal the next section within the first viewport.
Evidence UI should be dense but stable, with fixed track widths for timeline,
status, and code panels.

## Motion

Use motion only to explain system behavior:

- log append
- rule match highlight
- diff reveal
- tool call pause
- judge result transition
- lineage expand/collapse

Timing:

```css
--duration-micro: 80ms;
--duration-short: 180ms;
--duration-medium: 280ms;
--duration-long: 520ms;
--ease-enter: cubic-bezier(.16, 1, .3, 1);
--ease-exit: cubic-bezier(.7, 0, .84, 0);
--ease-move: cubic-bezier(.65, 0, .35, 1);
```

No decorative floating shapes, parallax clouds, or looping AI glow.

## Voice in UI

Prefer concrete nouns:

- mistake
- rule
- hook
- evidence
- verify
- blocked
- inherited
- team experience

Avoid vague nouns:

- intelligence
- magic
- knowledge graph
- productivity platform
- future of software

