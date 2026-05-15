# TeamAgent 90-Second Video Storyboard

## Goal

The video should make one idea stick:

> 老员工的 Claude Code 犯过的错，新来的员工的 Claude Code 不再犯。

The film language is real engineering evidence: terminal, Claude Code, Codex,
diff, hook event, `judge.json`, statusline, and dashboard.

## Structure

| Time | Beat | Viewer belief |
|---|---|---|
| 0-10s | Hook | AI agents repeat old team mistakes |
| 10-35s | Pain | The cost is real and familiar |
| 35-65s | Mechanism | TeamAgent turns mistakes into runtime rules |
| 65-85s | Proof | The next agent avoids the same mistake |
| 85-90s | CTA | Install it before the next agent starts |

## 0-10s: Hook

Visual:

- Split screen with two Claude Code sessions.
- Left: old employee session introduces a bad action.
- Right: new employee session begins the same task.
- TeamAgent statusline lights up before the new session repeats the mistake.

Caption:

```text
老员工犯过的错
新来的 Claude Code 不再犯
```

Sound:

- keyboard start
- short terminal pause
- low confirmation click when TeamAgent appears

## 10-35s: Pain

Show fast cuts of concrete failures:

- agent ignores `AGENTS.md`
- agent claims tests passed without judge evidence
- agent uses the wrong GitHub account
- agent edits the wrong worktree
- agent treats local command noise as user intent

Each cut should show:

```text
old mistake -> user correction -> lost time
```

Do not say "productivity loss" without evidence. Show the failed command,
review comment, or red diff.

## 35-65s: Mechanism

Show the TeamAgent loop:

```text
capture -> compile -> enforce -> verify
```

Shot list:

1. Transcript snippet is marked as a mistake pattern.
2. Rule card appears with trigger, correct action, and source.
3. Rule compiles into agent-readable context.
4. `PreToolUse` event pauses a risky action.
5. Agent pivots to the team-approved path.
6. `judge.json` records the evidence.

On-screen code:

```json
{
  "rule": "do not claim tests passed without judge evidence",
  "event": "PreToolUse",
  "decision": "warn",
  "evidence": ".judge/run_id/judge.json"
}
```

## 65-85s: Proof

Use a clean before/after:

Before:

```text
Looks good. Tests should pass.
```

After:

```text
RUN fixed tools
DUMP judge.json
READ evidence only
```

Then show three quick proof flashes:

- dashboard count changes
- rule tier/confidence visible
- statusline says a risk was remembered

Do not claim unverified numbers. If using `hook-pre.passed`, label it as hook
event evidence, not successful interception.

## 85-90s: CTA

Visual:

- TeamAgent wordmark.
- One install command.
- Evidence console fades into the homepage hero.

Caption:

```text
让你的 AI 员工，带着团队经验上岗。
```

CTA:

```bash
npm install -g github:libz-renlab-ai/TeamBrain#release
teamagent init
```

## Visual System

Use Case B: Terminal Native for execution scenes.
Borrow Case A: Evidence Console for opening and closing frames.
Use Case C: Knowledge Archive for one rule lineage shot.

Color:

- red for old mistake
- amber for warning
- teal for TeamAgent action
- green for verified result
- slate for neutral context

Motion:

- terminal cursor blink
- diff wipe
- event timeline snap
- rule hit highlight
- judge result transition

Avoid:

- AI brain
- robot avatar
- purple gradient glow
- stock footage
- fake dashboard metrics
- generic "ship faster" claims

## Production Notes

Keep captions under 12 Chinese characters per screen when possible.
Let real UI carry the story. Use narration only to connect evidence.

Every visual claim should map to a real file, command, hook event, or report.

