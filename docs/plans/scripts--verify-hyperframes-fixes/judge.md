# Judge Playbook: HyperFrames Kokoro TTS and index.html Split Fixes (verify-hyperframes-fixes)

> Replaces archived script `scripts/verify-hyperframes-fixes.sh` per project rule
> "third-party judge harness forbidden fixed scripts; MUST use md playbook"
> (`docs/HOWTO-PLAN-PR.md` § 3b).

## Origin

- Replaced script: `docs/legacy/judge-scripts/scripts/verify-hyperframes-fixes.sh`
- Original purpose: Verify two HyperFrames fixes in `docs/hyperframes/teamagent-hook/`: (1) `narration.wav` replaced by Kokoro TTS pipeline, (2) `index.html` split to eliminate `composition_file_too_large` lint warning.
- Status: ACTIVE — the `docs/hyperframes/teamagent-hook/` directory and its assets are still present in the repo.

## §V1 RUN

Commands the MAIN agent dispatches (via subagent or `claudefast -p` probe).
Capture stdout/stderr to `evidence_dir = .judge/<run_id>/`.

- Step 1 (prerequisites): `which ffprobe node npm > .judge/<run_id>/prereqs.txt 2>&1; echo $? > .judge/<run_id>/prereqs.exit`
- Step 2 (Kokoro WAV check): `ffprobe -hide_banner -show_streams -show_format docs/hyperframes/teamagent-hook/assets/narration.wav > .judge/<run_id>/ffprobe-out.txt 2>&1; echo $? > .judge/<run_id>/ffprobe.exit`
- Step 3 (backup check): `ls -la docs/hyperframes/teamagent-hook/assets/narration.say.wav.bak > .judge/<run_id>/backup-check.txt 2>&1; echo $? > .judge/<run_id>/backup-check.exit`
- Step 4 (lint check): `cd docs/hyperframes/teamagent-hook && npx --yes hyperframes@0.4.45 lint > .judge/<run_id>/lint-out.txt 2>&1; echo $? > .judge/<run_id>/lint.exit`
- Step 5 (split dirs check): `find docs/hyperframes/teamagent-hook -maxdepth 2 -type d > .judge/<run_id>/dirs.txt 2>&1`
- Step 6 (optional render — only if `RENDER=1`): `cd docs/hyperframes/teamagent-hook && timeout 600 npx --yes hyperframes@0.4.45 render -o out/teamagent-hook.verify.mp4 > .judge/<run_id>/render-out.txt 2>&1; echo $? > .judge/<run_id>/render.exit`

## §V2 DUMP

Canonical JSON written to `.judge/<run_id>/judge.json`:

```json
{
  "exit_code": 0,
  "metrics": {
    "ffprobe_available": true,
    "narration_wav_exists": true,
    "wav_duration_seconds": 18,
    "wav_duration_in_range_14_22": true,
    "wav_encoder_is_lavf": true,
    "backup_wav_exists": true,
    "lint_exit_code": 0,
    "composition_file_too_large_absent": true,
    "render_skipped": true
  },
  "evidence_dir": ".judge/<run_id>",
  "stdout_path": ".judge/<run_id>/ffprobe-out.txt",
  "stderr_path": ".judge/<run_id>/lint-out.txt",
  "feature_status": "active"
}
```

## §V3 READ

LLM judge prompt (run via `claudefast -p`):

> Read `.judge/<run_id>/judge.json` and supporting evidence in
> `evidence_dir`. Emit verdict `PASS` / `FAIL` / `SKIP`. Criteria:
>
> - PASS if: `narration_wav_exists == true` AND `wav_duration_in_range_14_22 == true` AND `composition_file_too_large_absent == true`. `backup_wav_exists` is informational; `wav_encoder_is_lavf` is confirmatory but not blocking if ffprobe cannot parse the encoder tag. Render check is SKIP when `render_skipped == true`.
> - FAIL if: `narration_wav_exists == false`, or duration is outside [14, 22] seconds, or `composition_file_too_large_absent == false` (lint warning still present).
> - SKIP if: feature has been deleted from the project (e.g.
>   canned answer no longer in CLAUDE.md), or required infrastructure
>   is unavailable in this environment.

## Notes

- Original logic summary: The script checked four sections: (1) environment prerequisites (ffprobe, node, npm); (2) Kokoro WAV validation via `ffprobe` — asserts file existence, duration 14–22s, and Lavf encoder tag distinguishing Kokoro from macOS `say`; (3) HyperFrames lint check for absence of `composition_file_too_large`; (4) optional full render regression with resolution/fps/duration assertions (activated by `RENDER=1`). Exit code equals total failure count.
- Known limitations / dependencies:
  - `ffprobe` (part of ffmpeg) required for WAV validation; install via `brew install ffmpeg`.
  - `npx hyperframes@0.4.45` download requires network access.
  - Render section is slow (~10 minutes) and optional; set `RENDER=1` to enable.
  - Duration range [14, 22] seconds is hardcoded from the original narration content; update if script narration length changes.
