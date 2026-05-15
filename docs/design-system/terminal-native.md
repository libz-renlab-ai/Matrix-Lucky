# Case B: Terminal Native

## Role

Terminal Native is the product video and demo direction.

It should own CLI scenes, hook replay, terminal screenshots, launch videos,
and moments where TeamAgent visibly interrupts a bad agent action.

## One-Screen Promise

TeamAgent 把 Claude Code 犯过的错，变成下一次执行前的实时拦截。

## Aesthetic

Terminal Native is a refined agent cockpit. It is dark, dense, and direct.
The page should feel like Claude Code, Codex, git, tests, and judge evidence are
all visible in the same execution room.

Avoid cheap black-and-green hacker styling. The product should feel precise,
not theatrical.

## Layout

Use multi-pane execution surfaces:

- left pane: previous failure or source transcript
- center pane: active agent run and tool call timeline
- right pane: rule match, `judge.json`, verification output
- bottom strip: statusline or event stream

The main sequence:

```text
command -> risky action -> PreToolUse pause -> rule hit -> corrected action -> verify
```

## Typography

- Primary terminal/code: Commit Mono, Berkeley Mono, or similar technical mono.
- Support copy: Source Sans 3 feeling or another quiet readable sans.
- Chinese fallback: Noto Sans SC.

Use monospace for more than code: status, timestamps, rule IDs, and event names.

## Color

```text
Background: #080B0E
Panel:      #111827
Surface:    #1F2937
Text:       #E5E7EB
Muted:      #9CA3AF
Active:     #22C55E
Warning:    #F59E0B
Danger:     #EF4444
Info:       #38BDF8
Review:     #A3E635
```

Use green only for active/pass states. Do not flood the page with neon.

## Components

- CLI install command.
- Claude Code session replay.
- Codex task card.
- `PreToolUse` rule hit overlay.
- Terminal diff panel.
- Judge harness output.
- Event stream with timestamps.
- Statusline showing rules, helped count, and risk.

## Motion

Use video-native motion:

- terminal cursor blink
- command replay
- typed but readable logs
- event timeline snap
- red old mistake freezes before execution
- green verified state lands after judge output

Motion should make the runtime intervention obvious.

## Safe Choices

- Terminal, diff, and JSON are familiar to developer buyers.
- Dark execution scenes work well in video.
- A runtime pause is easier to understand than a static architecture diagram.

## Creative Risk

Treat the hook as a "现场裁判" for agent actions. This makes the product
memorable, but the copy must clarify that TeamAgent corrects agent behavior,
not human creativity.

## Best Use

Use this case for:

- 90-second product video
- CLI docs hero
- hook demo pages
- launch GIFs
- install walkthroughs

