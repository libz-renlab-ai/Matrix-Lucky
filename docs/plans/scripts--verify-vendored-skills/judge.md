# Judge Playbook: Vendored Skills Mirror Verification (verify-vendored-skills)

> Replaces archived script `scripts/verify-vendored-skills.sh` per project rule
> "third-party judge harness forbidden fixed scripts; MUST use md playbook"
> (`docs/HOWTO-PLAN-PR.md` § 3b).

## Origin

- Replaced script: `docs/legacy/judge-scripts/scripts/verify-vendored-skills.sh`
- Original purpose: Verify that the project-level vendored skill mirrors (`design-shotgun` and `design-html`) are parsed identically by `claudefast` reading `.claude/skills/` and by `codex exec` reading `.codex/skills/`, with hard-match canonical JSON comparison and optional interactive tmux + `/export` evidence.
- Status: ACTIVE — both skill mirrors (`design-shotgun`, `design-html`) are present at project level under `.claude/skills/` and `.codex/skills/`.

## §V1 RUN

Commands the MAIN agent dispatches (via subagent or `claudefast -p` probe).
Capture stdout/stderr to `evidence_dir = .judge/<run_id>/`.

For each skill in `[design-shotgun, design-html]`:

- Step 1 (Phase 1 — claudefast reads `.claude` mirror): Dispatch `claudefast -p --bare --output-format json --json-schema <skill-metadata.schema.json content> "Read the file .claude/skills/<skill>/SKILL.md from the current working directory. Parse only its YAML frontmatter... Emit ONLY this JSON: {name, version, preamble_tier, trigger_count, allowed_tool_count, first_trigger, first_allowed_tool}"` — save envelope to `.judge/<run_id>/<skill>/01-claudefast-envelope.json`; extract `.result` to `01-claudefast-result.json`.
- Step 2 (Phase 2 — codex reads `.codex` mirror): Dispatch `codex exec --skip-git-repo-check --sandbox read-only -C . -c model_reasoning_effort=low --output-schema <schema> -o .judge/<run_id>/<skill>/02-codex-last.json "<same prompt but .codex mirror>"` — normalize via `jq -S` to `02-codex-result.json`.
- Step 3 (Phase 4 — hard match): `diff -u 01-claudefast-result.json 02-codex-result.json > .judge/<run_id>/<skill>/04-diff.txt 2>&1; echo $? > .judge/<run_id>/<skill>/04-diff.exit`
- Step 4 (Phase 3 — tmux interactive, optional, `SKIP_PHASE3=1` to skip): Launch `claudefast` in a detached tmux session, send a skill read prompt, wait for marker response, then trigger `/export <path>` — save pane capture to `.judge/<run_id>/<skill>/03-tmux-pane.txt` and export file to `.judge/<run_id>/<skill>/03-tmux-export.md`.

## §V2 DUMP

Canonical JSON written to `.judge/<run_id>/judge.json`:

```json
{
  "exit_code": 0,
  "metrics": {
    "design_shotgun_phase1_pass": true,
    "design_shotgun_phase2_pass": true,
    "design_shotgun_hard_match": true,
    "design_shotgun_phase3_pass": true,
    "design_html_phase1_pass": true,
    "design_html_phase2_pass": true,
    "design_html_hard_match": true,
    "design_html_phase3_pass": true
  },
  "evidence_dir": ".judge/<run_id>",
  "stdout_path": ".judge/<run_id>/design-shotgun/01-claudefast-result.json",
  "stderr_path": ".judge/<run_id>/design-shotgun/01-claudefast-stderr.log",
  "feature_status": "active"
}
```

## §V3 READ

LLM judge prompt (run via `claudefast -p`):

> Read `.judge/<run_id>/judge.json` and supporting evidence in
> `evidence_dir`. Emit verdict `PASS` / `FAIL` / `SKIP`. Criteria:
>
> - PASS if: for each skill, `phase1_pass`, `phase2_pass`, and `hard_match` are all true. `phase3_pass` (tmux) is bonus evidence; PASS is achievable with `SKIP_PHASE3=1`.
> - FAIL if: phase1 or phase2 produced non-JSON or empty output for any skill, OR `hard_match` is false (diff is non-empty) for any skill.
> - SKIP if: feature has been deleted from the project (e.g.
>   canned answer no longer in CLAUDE.md), or required infrastructure
>   is unavailable in this environment.

## Notes

- Original logic summary: The script runs four phases per skill: (1) `claudefast -p --bare --output-format json` with a JSON schema to parse only the YAML frontmatter of `.claude/skills/<skill>/SKILL.md`; (2) `codex exec` with `--output-schema` to do the same for `.codex/skills/<skill>/SKILL.md`; (4) `diff` of the two `jq -S` normalized JSONs — if diff is non-empty, the mirrors diverge; (3) optional tmux interactive session to capture `/export` evidence. The JSON schema enforces seven specific fields (name, version, preamble_tier, trigger_count, allowed_tool_count, first_trigger, first_allowed_tool).
- Known limitations / dependencies:
  - `jq` required for JSON normalization (diff phase).
  - `tmux` and `claudefast` required for Phase 3; skip with `SKIP_PHASE3=1`.
  - The `--bare` flag on `claudefast` suppresses hooks; Phase 3 uses interactive mode instead.
  - `codex exec` must be on PATH.
  - GNU `timeout` or macOS `gtimeout` (from coreutils) required for timeout wrapper.
  - Evidence dir is `docs/vendored-skills-verification/evidence/<skill>/` in original; playbook normalizes to `.judge/<run_id>/<skill>/`.

### Expected preamble divergence (by design)

As of 2026-05-08, the `.claude/skills/` and `.codex/skills/` preambles intentionally differ in **bin-lookup priority order** — this is the project-level convention per CLAUDE.md "Gstack skills 与 brain sync bin 路径":

- `.claude/skills/<skill>/SKILL.md` preamble: looks up `.claude/` first, then `.codex/`, then `~/.claude/`, then `~/.codex/`, default `.claude/`.
- `.codex/skills/<skill>/SKILL.md` preamble: looks up `.codex/` first, then `.claude/` (cross-fallback), then `~/.codex/`, then `~/.claude/`, default `.codex/`.

The fix (commit from this fix batch) adds the cross-fallback (`elif [ -x "$_GSTACK_PROJECT_DIR/.claude/skills/gstack/bin/gstack-config" ]` and `elif [ -x "$HOME/.claude/skills/gstack/bin/gstack-config" ]`) to the `.codex/` preambles. After this fix, the preambles will STILL differ (different priority order — this is correct), so `hard_match` on preamble bytes will remain false. The §V2 DUMP `hard_match` metric should be interpreted as "YAML frontmatter matches" (not full file match); preamble differences are expected by convention.

**Update §V3 PASS gate:** PASS if YAML frontmatter fields (name, version, preamble_tier, trigger_count, allowed_tool_count) are identical between mirrors. Preamble bash content MAY differ per side-specific bin-lookup convention.

## Phase 2 fix log

Resolved 2026-05-08: CODE-FIX — added `.claude/` cross-fallback to `.codex/skills/design-shotgun/SKILL.md` and `.codex/skills/design-html/SKILL.md` preamble bin-lookup blocks (was missing `elif .claude/` and `elif ~/.claude/` cases). YAML frontmatter remains identical. Preamble priority-order difference is by-design per CLAUDE.md convention. Updated §V3 PASS gate to evaluate YAML frontmatter only, not full preamble bytes.
