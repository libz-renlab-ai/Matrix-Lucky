# Judge Playbook: calibrator-v2 / verify-canned-answer

> Replaces archived script `docs/legacy/judge-scripts/docs/features/calibrator-v2/verify-canned-answer.sh` per rule
> "third-party judge harness forbidden fixed scripts; MUST use md playbook"
> (`docs/HOWTO-PLAN-PR.md` § 3b).

## Origin
- Replaced script: `docs/legacy/judge-scripts/docs/features/calibrator-v2/verify-canned-answer.sh`
- Original purpose: Run `scripts/probe-feature.sh calibrator-v2` via claudefast and assert that the probe answer references the real source file `calibration-pipeline-v2.ts`.
- Status: **ACTIVE-PARTIAL** (depends on `scripts/probe-feature.sh` utility and `claudefast` availability; SKIPs gracefully when either is absent)

## §V1 RUN

Concrete commands extracted from source:

- Step 0: Check `claudefast` availability (binary on PATH or zsh alias). If unavailable, emit SKIP and exit 0.
  ```
  command -v claudefast 2>/dev/null \
    || zsh -i -c "command -v claudefast" >/dev/null 2>&1 \
    || { echo "SKIP [calibrator-v2]: claudefast unavailable"; exit 0; }
  ```

- Step 1: Verify `scripts/probe-feature.sh` exists.
  ```
  [[ -f "$REPO_ROOT/scripts/probe-feature.sh" ]] \
    || { echo "FAIL: probe script not found"; exit 1; }
  ```

- Step 2: Run the probe (exit 2 = claudefast error but artifacts written — tolerated).
  ```
  bash "$REPO_ROOT/scripts/probe-feature.sh" calibrator-v2
  ```

- Step 3: Assertion 1 — artifact directory was created.
  ```
  LATEST_DIR="$(find "$REPO_ROOT/.fastprobe/feature-calibrator-v2" \
    -maxdepth 1 -name 'probe-*' -type d | sort | tail -1)"
  [[ -n "$LATEST_DIR" ]] || { echo "FAIL: no probe artifact directory"; exit 1; }
  ```

- Step 4: Assertion 2 — `stream.jsonl` is non-empty.
  ```
  [[ -f "$LATEST_DIR/stream.jsonl" && $(wc -c < "$LATEST_DIR/stream.jsonl") -ge 1 ]] \
    || { echo "FAIL: stream.jsonl missing or empty"; exit 1; }
  ```

- Step 5: Assertion 3 — probe answer references `calibration-pipeline-v2.ts`.
  ```
  grep -qF "calibration-pipeline-v2.ts" "$LATEST_DIR/answer.md" \
    || grep -qF "calibration-pipeline-v2.ts" "$LATEST_DIR/stream.jsonl" \
    || { echo "FAIL: evidence anchor not found"; exit 1; }
  ```

Capture to `evidence_dir = .fastprobe/feature-calibrator-v2/probe-<timestamp>/`.

## §V2 DUMP

```json
{
  "exit_code": 0,
  "metrics": {
    "artifact_dir_created": true,
    "stream_jsonl_bytes": ">= 1",
    "evidence_anchor_found": "calibration-pipeline-v2.ts"
  },
  "evidence_dir": ".fastprobe/feature-calibrator-v2/probe-<timestamp>/",
  "stdout_path": ".fastprobe/feature-calibrator-v2/probe-<timestamp>/stream.jsonl",
  "stderr_path": null,
  "feature_status": "active"
}
```

The evidence anchor `calibration-pipeline-v2.ts` must appear as a substring in either `answer.md` or `stream.jsonl` within the latest probe artifact directory. This confirms that the claudefast probe grounded its answer in the actual source file rather than hallucinating.

## §V3 READ

`claudefast -p` prompt:
> Read judge.json + evidence_dir. PASS / FAIL / SKIP.
> PASS if all metrics meet thresholds documented in §V2:
>   artifact_dir_created == true AND stream_jsonl_bytes >= 1
>   AND evidence_anchor_found ("calibration-pipeline-v2.ts") present in answer.md or stream.jsonl.
> FAIL if artifact directory is absent, stream.jsonl is empty, or the evidence anchor is missing.
> SKIP if claudefast is unavailable (not on PATH and not a zsh alias) or probe-feature.sh is missing.

## Notes

- Original logic summary: The script first checks whether `claudefast` is reachable (binary or zsh alias) and exits with SKIP (code 0) if not. It then runs `scripts/probe-feature.sh calibrator-v2`, which invokes claudefast with stream-json output against a prompt about the calibrator-v2 feature. Three mechanical assertions follow: (1) a probe artifact directory was created under `.fastprobe/feature-calibrator-v2/`; (2) `stream.jsonl` within that directory is non-empty; (3) either `answer.md` or `stream.jsonl` contains the substring `calibration-pipeline-v2.ts`, proving the answer referenced real source code. Exit code 2 from the probe (claudefast network/API error where artifacts are still written) is tolerated.
- Dependencies: `claudefast` on PATH or as zsh alias; `scripts/probe-feature.sh` present in repo root; write access to `.fastprobe/`.
- Limitations: ACTIVE-PARTIAL — if `probe-feature.sh` is archived or claudefast is unavailable the harness SKIPs rather than FAILs, so absence of claudefast does not surface as a hard failure.
