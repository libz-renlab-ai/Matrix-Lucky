# Judge Playbook: Canary Skill — claudefast Registry Probe

> Replaces archived script `docs/legacy/judge-scripts/docs/canary-verify/verify-claudefast.sh` per rule
> "third-party judge harness forbidden fixed scripts; MUST use md playbook"
> (`docs/HOWTO-PLAN-PR.md` § 3b).

## Origin
- Replaced script: `docs/legacy/judge-scripts/docs/canary-verify/verify-claudefast.sh`
- Original purpose: Invoke `claudefast -p` with file/exec tools denied to confirm the runtime's in-memory skill registry contains the `canary` skill without being able to read the SKILL.md file directly.
- Status: **ACTIVE**

## §V1 RUN
Commands MAIN agent dispatches; capture stdout/stderr to `evidence_dir = .judge/<run_id>/`:

- Step 1: Capture `claudefast` flag list to confirm `--debug` and `--debug-file` are supported.
  ```
  claudefast --help > .judge/<run_id>/claudefast.help.txt 2>&1
  ```
- Step 2: Invoke `claudefast -p` with all file/exec tools denied, a JSON schema constraint, and hook debug logging enabled. The prompt must ask the model to report canary skill registration from memory only (no disk reads).
  ```
  claudefast -p \
    --output-format json \
    --json-schema '{"type":"object","properties":{"registered":{"type":"boolean"},"name":{"type":["string","null"]},"status":{"type":"string","enum":["found","missing"]}},"required":["registered","name","status"],"additionalProperties":false}' \
    --permission-mode acceptEdits \
    --disallowedTools "Read,Bash,Glob,Grep,Edit,Write,NotebookEdit,Task" \
    --debug hooks \
    --debug-file .judge/<run_id>/claudefast.debug.log \
    "Without reading any file from disk, confirm whether you have a registered skill named exactly 'canary'. Use only your in-memory skill registry. If canary is registered return {\"registered\":true,\"name\":\"canary\",\"status\":\"found\"}; otherwise {\"registered\":false,\"name\":null,\"status\":\"missing\"}." \
    > .judge/<run_id>/claudefast.raw.json \
    2> .judge/<run_id>/claudefast.stderr.log
  ```
- Step 3: Extract the `.result` field and parse the first JSON object (stripping any trailing stop-hook noise).
  ```
  jq -r '.result' .judge/<run_id>/claudefast.raw.json \
    | python3 -c 'import sys,json; t=sys.stdin.read().strip(); obj,_=json.JSONDecoder().raw_decode(t); print(json.dumps(obj,sort_keys=True,indent=2))' \
    > .judge/<run_id>/claudefast-registry.json
  ```
- Step 4: Assert that the debug log confirms the project skill directory was loaded and `canary` was registered from `projectSettings`.
  ```
  grep -F "Loading skills from:" .judge/<run_id>/claudefast.debug.log | grep -F ".claude/skills"
  grep -F "skill 'canary' from projectSettings" .judge/<run_id>/claudefast.debug.log
  ```

## §V2 DUMP
Canonical JSON to `.judge/<run_id>/judge.json`:
```json
{
  "exit_code": 0,
  "metrics": {
    "skill_registered": true,
    "skill_name": "canary",
    "registry_status": "found",
    "debug_log_confirms_project_skill_dir": true,
    "debug_log_confirms_canary_projectSettings": true
  },
  "evidence_dir": ".judge/<run_id>/",
  "stdout_path": ".judge/<run_id>/claudefast-registry.json",
  "stderr_path": ".judge/<run_id>/claudefast.stderr.log",
  "feature_status": "active"
}
```

## §V3 READ
`claudefast -p` prompt:
> Read `.judge/<run_id>/judge.json` and evidence in `evidence_dir`.
> Emit `PASS` / `FAIL` / `SKIP`.
> PASS criteria: `exit_code` is 0; `metrics.skill_registered` is `true`; `metrics.registry_status` is `"found"`; both debug log assertions are `true`.
> FAIL criteria: `exit_code` non-zero; `skill_registered` is `false`; either debug log assertion is `false`; `claudefast-registry.json` is absent or malformed.
> SKIP if `claudefast` binary is not on PATH or `.claude/skills/canary/SKILL.md` does not exist.

## Notes
- Original logic summary: The script launched `claudefast -p` with a JSON-schema-enforced prompt and all file/read tools denied, so the model could only answer from its loaded skill registry. It then verified the debug log to confirm the project skill directory was actually scanned and the `canary` skill was registered via `projectSettings`, before extracting and normalizing the first JSON object from the raw output (stripping stop-hook noise appended after the JSON).
- Known dependencies / limitations:
  - Requires `claudefast` resolvable via PATH or `zsh -i` (interactive zsh loads the alias).
  - Requires `.claude/skills/canary/SKILL.md` to be present in the repo root.
  - Requires `docs/canary-verify/schema.json` and `docs/canary-verify/prompt.tmpl` to exist (originals referenced by the legacy script; MAIN agent should inline their content into the prompt above if those files are absent).
  - `--debug hooks --debug-file` flag availability must be confirmed via `claudefast --help` before running.
  - Stop-hook noise appended after the JSON result requires the `python3 raw_decode` extraction step; do not use plain `jq .result` alone.
