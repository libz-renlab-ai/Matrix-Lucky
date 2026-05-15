# VERIFY_TEMPLATE.md

`RUN pinned tools -> DUMP .judge/ + docs archive -> READ raw JSON with separate LLM judge.`

## Bedrock principle

Code does not grade itself. A fixed harness runs fixed tools, dumps raw JSON/evidence under `.judge/<run_id>/`, archives required proof under `docs/teambrain/evidence/<run_id>/`, and a separate LLM judge reads raw JSON only.

---

## Required fields per VERIFY recipe

Every TeamBrain verify entry MUST contain all of the following fields:

| Field | Type | Constraint |
|-------|------|-----------|
| `recipe_id` | string | regex `^VERIFY-[A-Z]+-\d{3}$` |
| `prerequisites` | list | concrete deps/fixtures/env vars — no "set up your env" |
| `command` | string | single executable `claudefast -p "Follow docs/plans/<slug>/judge.md ..."` dispatch line OR a concrete shell command; no "run the tests" without specifics; do not reference archived `scripts/verify/*.sh` paths |
| `expected_output` | string | regex / exact string / JSON schema / exit_code — at minimum assert output, not exit code alone |
| `failure_modes` | list | enumerated: `timeout`, `exit_code != 0`, `mismatch`, `missing_evidence`, `mock_detected` |
| `evidence_path` | string | local raw evidence dir, normally `.judge/<run_id>/`; gitignored and not sufficient for PR proof |
| `archive_path` | string | committed docs archive dir, normally `docs/teambrain/evidence/<run_id>/`; contains audit summary/index and pointers to raw evidence |
| `judge_input` | string | file path(s) the LLM judge reads — must be a file path, never "the agent's summary" |

---

## Required archive gate

Every real-task harness MUST create and validate this committed archive set before any pass verdict:

```text
docs/teambrain/evidence/<run_id>/
  INDEX.md
  transcript.md
  stdout.txt
  stderr.txt
  failures.md
  judge-summary.json
```

Missing any file above is `missing_evidence` and MUST make the harness fail, even when the tool command exits 0. `judge-summary.json` MUST be derived from `.judge/<run_id>/judge.json`; it cannot replace the raw judge JSON.

---

## Evidence retention contract

- `.judge/<run_id>/` is the canonical local raw judge output: `judge.json`, stdout/stderr, coverage, screenshots, and bulky evidence.
- `.judge/` is transient and gitignored. A PR cannot rely on `.judge/` alone to self-prove a real task.
- `docs/teambrain/evidence/<run_id>/` is the canonical committed audit archive. It contains the required archive gate files, checksums or excerpts, and pointers back to `.judge/<run_id>/`.
- Do not fabricate completion evidence. If a real task was not run, the archive must say it is a template, dry run, or missing run; never imply Real Task #1 or any named task completed without raw judge evidence.

---

## Three-stage harness skeleton

```bash
#!/usr/bin/env bash
# VERIFY harness skeleton — RUN → DUMP → READ
set -euo pipefail

RECIPE_ID="${1:?recipe_id required}"
TASK_TITLE="${2:-${RECIPE_ID}}"
RUN_ID="$(date -u +%Y%m%dT%H%M%SZ)_${RECIPE_ID}"
EVIDENCE_DIR=".judge/${RUN_ID}"
ARCHIVE_DIR="docs/teambrain/evidence/${RUN_ID}"
mkdir -p "${EVIDENCE_DIR}" "${ARCHIVE_DIR}"

# ── RUN ──────────────────────────────────────────────────────────────────────
# Pinned tool invocation; never use || true here
EXIT_CODE=0
pnpm typecheck \
  > "${EVIDENCE_DIR}/stdout.txt" \
  2> "${EVIDENCE_DIR}/stderr.txt" \
  || EXIT_CODE=$?

# Capture metrics (example: count error lines)
ERROR_COUNT=$(grep -c "error TS" "${EVIDENCE_DIR}/stdout.txt" || true)
FAILURES="No failures observed; see ${EVIDENCE_DIR}/judge.json and command logs."
if [ "${EXIT_CODE}" -ne 0 ] || [ "${ERROR_COUNT}" -ne 0 ]; then
  FAILURES="Command failed or mismatched expected output; inspect stdout/stderr."
fi

# ── DUMP ─────────────────────────────────────────────────────────────────────
cat > "${EVIDENCE_DIR}/judge.json" <<EOF
{
  "recipe_id": "${RECIPE_ID}",
  "run_id": "${RUN_ID}",
  "task_title": "${TASK_TITLE}",
  "exit_code": ${EXIT_CODE},
  "metrics": {
    "ts_error_count": ${ERROR_COUNT}
  },
  "evidence_dir": "${EVIDENCE_DIR}",
  "archive_dir": "${ARCHIVE_DIR}",
  "stdout_path": "${EVIDENCE_DIR}/stdout.txt",
  "stderr_path": "${EVIDENCE_DIR}/stderr.txt",
  "failure_list_path": "${ARCHIVE_DIR}/failures.md"
}
EOF

cp "${EVIDENCE_DIR}/stdout.txt" "${ARCHIVE_DIR}/stdout.txt"
cp "${EVIDENCE_DIR}/stderr.txt" "${ARCHIVE_DIR}/stderr.txt"
printf '%s\n' "${FAILURES}" > "${ARCHIVE_DIR}/failures.md"
cat > "${ARCHIVE_DIR}/transcript.md" <<EOF
# Transcript ${RUN_ID}

- recipe_id: ${RECIPE_ID}
- command: pnpm typecheck
- result: exit_code=${EXIT_CODE}, ts_error_count=${ERROR_COUNT}
EOF

cat > "${ARCHIVE_DIR}/judge-summary.json" <<EOF
{
  "recipe_id": "${RECIPE_ID}",
  "run_id": "${RUN_ID}",
  "exit_code": ${EXIT_CODE},
  "metrics": {
    "ts_error_count": ${ERROR_COUNT}
  },
  "raw_evidence_dir": "${EVIDENCE_DIR}",
  "archive_dir": "${ARCHIVE_DIR}",
  "raw_judge_path": "${EVIDENCE_DIR}/judge.json",
  "failure_list_path": "${ARCHIVE_DIR}/failures.md"
}
EOF

cat > "${ARCHIVE_DIR}/INDEX.md" <<EOF
# Evidence ${RUN_ID}

- recipe_id: ${RECIPE_ID}
- task_title: ${TASK_TITLE}
- raw_evidence_dir: \`${EVIDENCE_DIR}\` (local, gitignored)
- commit_sha: record here only after commit, never in run_id
- summary: \`${ARCHIVE_DIR}/judge-summary.json\`
- transcript: \`${ARCHIVE_DIR}/transcript.md\`
- stdout: \`${ARCHIVE_DIR}/stdout.txt\` (raw: \`${EVIDENCE_DIR}/stdout.txt\`)
- stderr: \`${ARCHIVE_DIR}/stderr.txt\` (raw: \`${EVIDENCE_DIR}/stderr.txt\`)
- failures: \`${ARCHIVE_DIR}/failures.md\`
EOF

MISSING=0
for f in INDEX.md transcript.md stdout.txt stderr.txt failures.md judge-summary.json; do
  [ -s "${ARCHIVE_DIR}/${f}" ] || { echo "missing_evidence:${ARCHIVE_DIR}/${f}" >&2; MISSING=1; }
done
[ -s "${EVIDENCE_DIR}/judge.json" ] || { echo "missing_evidence:${EVIDENCE_DIR}/judge.json" >&2; MISSING=1; }
[ "${MISSING}" -eq 0 ] || exit 2
if [ "${EXIT_CODE}" -ne 0 ]; then exit "${EXIT_CODE}"; fi
[ "${ERROR_COUNT}" -eq 0 ] || exit 3

# ── READ ─────────────────────────────────────────────────────────────────────
# Separate LLM judge reads raw JSON only — does NOT rerun the tool
claudefast -p "
You are a third-party judge. Read ONLY the raw JSON and evidence files below.
Do NOT rerun any commands. Output JSON with recipe_id, run_id, conclusion, and notes.

judge.json: $(cat "${EVIDENCE_DIR}/judge.json")
stdout (first 100 lines): $(head -n 100 "${EVIDENCE_DIR}/stdout.txt")
"
```

---

## Filled-in example

```yaml
recipe_id: VERIFY-PNPM-001
prerequisites: [node >= 18, pnpm installed, repo root package.json present]
command: "claudefast -p \"Follow docs/plans/scripts--verify--VERIFY-PNPM-001/judge.md\""
expected_output:
  exit_code: 0
  regex_on_stdout: "^(?!.*error TS)"  # zero lines matching "error TS"
failure_modes:
  - timeout: command runs > 120s
  - exit_code != 0: tsc found type errors
  - mismatch: exit_code=0 but stdout contains "error TS" lines
  - missing_evidence: raw judge JSON or required docs archive file missing/empty
  - mock_detected: tsconfig paths redirected to stubs
evidence_path: ".judge/{RUN_ID}/"
archive_path: "docs/teambrain/evidence/{RUN_ID}/"
judge_input: ".judge/{RUN_ID}/judge.json"
```

---

## Banned patterns

1. **Verbal sign-off** — "looks fine" is not evidence.
2. **Agent self-grading** — writer cannot be the final judge.
3. **Hidden `|| true`** — harnesses must preserve failures.
4. **Exit-code-only check** — assert stdout/stderr or JSON too.
5. **Single-LLM judge that also wrote the test** — use a separate invocation.
6. **Pseudo-code commands** — `command` must be executable.
7. **`verify_command` omitted** — every VERIFY entry needs a command.
8. **PR proof only in `.judge/`** — archive required docs proof too.
9. **Fabricated real-task evidence** — never imply completion without raw judge evidence.
