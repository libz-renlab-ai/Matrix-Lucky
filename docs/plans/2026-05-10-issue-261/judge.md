```text
   ┌──────────────┐    ┌──────────────┐    ┌──────────────┐
   │  V1  RUN     │ →  │  V2  DUMP    │ →  │  V3  READ    │
   │ fixed tools  │    │ judge.json   │    │ raw JSON     │
   │ exit_code +  │    │ + raw evid   │    │ → LLM judge  │
   │ stdout/err   │    │ (no LLM yet) │    │ PASS / FAIL  │
   └──────────────┘    └──────────────┘    └──────────────┘
```

# Judge harness — Issue #261

## V1 RUN

```bash
WT=/Users/m1/projects/TeamBrain/.codex/worktrees/issue-261
RUN_DIR=$WT/.judge/2026-05-10-issue-261
mkdir -p "$RUN_DIR/raw"; cd "$WT"

# 1. residual scan
grep -nE "(superpowers|caveman|sales|knowledge-work-plugins|JuliusBrussee)" audit/runners/feature-10-install-plugins.ts audit/plans/feature-10-install-plugins.md > "$RUN_DIR/raw/01-residual.out" 2>&1; echo $? > "$RUN_DIR/raw/01-residual.exit"

# 2. typecheck
pnpm typecheck > "$RUN_DIR/raw/02-typecheck.out" 2> "$RUN_DIR/raw/02-typecheck.err"; echo $? > "$RUN_DIR/raw/02-typecheck.exit"

# 3. audit runner: must reach PASSED
pnpm exec tsx audit/runners/feature-10-install-plugins.ts > "$RUN_DIR/raw/03-audit.out" 2> "$RUN_DIR/raw/03-audit.err"; echo $? > "$RUN_DIR/raw/03-audit.exit"

# 4. probe (post-merge)
( cd /tmp && claudefast -p "in /Users/m1/projects/TeamBrain, what files contain literal 'superpowers' (skip docs/superpowers/)?" --permission-mode acceptEdits ) > "$RUN_DIR/raw/04-probe.out" 2> "$RUN_DIR/raw/04-probe.err"; echo $? > "$RUN_DIR/raw/04-probe.exit"
```

## V2 DUMP

```json
{
  "issue": 261,
  "metrics": {
    "audit_residual_clean": "<bool: step 1 grep stdout empty>",
    "typecheck_passed": "<bool: step 2 exit==0>",
    "audit_runner_passes": "<bool: step 3 exit==0 AND stdout contains 'PASSED feature-10-install-plugins'>",
    "probe_no_audit_files": "<bool: step 4 stdout does NOT list audit/runners/feature-10-install-plugins.ts or audit/plans/feature-10-install-plugins.md>"
  }
}
```

## V3 READ

```bash
claudefast -p "Read .judge/2026-05-10-issue-261/judge.json + raw/. Return PASS/FAIL. PASS iff all 4 metrics true. FAIL if probe (raw/04-probe.out) lists audit/* feature-10 files as plugin-superpowers-related."
```

## Already-run results (this branch)

| metric | value | evidence |
|---|---|---|
| `audit_residual_clean` | true | `(clean)` |
| `typecheck_passed` | true | `tsc --noEmit -p tsconfig.base.json` exit 0 |
| `audit_runner_passes` | true | `PASSED feature-10-install-plugins` |
| `probe_no_audit_files` | run post-merge | — |
