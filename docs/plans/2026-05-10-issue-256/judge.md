```text
   ┌──────────────┐    ┌──────────────┐    ┌──────────────┐
   │  V1  RUN     │ →  │  V2  DUMP    │ →  │  V3  READ    │
   │ fixed tools  │    │ judge.json   │    │ raw JSON     │
   │ exit_code +  │    │ + raw evid   │    │ → LLM judge  │
   │ stdout/err   │    │ (no LLM yet) │    │ PASS / FAIL  │
   └──────────────┘    └──────────────┘    └──────────────┘
```

# Judge harness — Issue #256

Code 不评自己。固定工具跑、固定 JSON 落盘、另一只 LLM 只读 raw artifact 决断。

## V1 RUN — fixed tools

```bash
WT=/Users/m1/projects/TeamBrain/.codex/worktrees/issue-256
RUN_DIR=$WT/.judge/2026-05-10-issue-256
mkdir -p "$RUN_DIR/raw"
cd "$WT"

# step 1: surface (4 user-facing files) must have 0 hits, except `docs/superpowers/` paths in evidence script
{
  echo '--- bin.ts ---'
  grep -nE "(superpowers|caveman|sales)" packages/cli/src/bin.ts || echo '(none)'
  echo '--- init.ts ---'
  grep -nE "(superpowers|caveman|sales)" packages/cli/src/commands/init.ts || echo '(none)'
  echo '--- packages/teamagent/CLAUDE.md ---'
  grep -nE "(superpowers|caveman|sales)" packages/teamagent/CLAUDE.md || echo '(none)'
  echo '--- evidence-phase-gaps-ab.ts (residual non-doc-path) ---'
  grep -nE "(superpowers|caveman|sales)" scripts/evidence-phase-gaps-ab.ts | grep -v 'docs/superpowers/' || echo '(only legitimate doc paths)'
} > "$RUN_DIR/raw/01-surface.out" 2> "$RUN_DIR/raw/01-surface.err"
echo $? > "$RUN_DIR/raw/01-surface.exit"

# step 2: 7 test fixture files must have 0 hits
{
  for f in \
    packages/core/src/m5/__tests__/bootstrap-diff.test.ts \
    packages/core/src/m5/__tests__/manifest.test.ts \
    packages/cli/src/__tests__/m5-cli.test.ts \
    packages/adapters/src/m5/__tests__/fs-bootstrap.test.ts \
    packages/cli/src/__tests__/install-plugins.test.ts \
    packages/cli/src/__tests__/sandbox-all-features.test.ts \
    packages/adapters/src/plugins/__tests__/claude-plugin-installer.test.ts; do
    echo "=== $f ==="
    grep -nE "(superpowers|caveman|sales)" "$f" || echo '(clean)'
  done
} > "$RUN_DIR/raw/02-fixtures.out" 2> "$RUN_DIR/raw/02-fixtures.err"
echo $? > "$RUN_DIR/raw/02-fixtures.exit"

# step 3: vitest on all touched test surfaces
pnpm exec vitest run \
  packages/core/src/m5 \
  packages/cli/src/__tests__/install-plugins.test.ts \
  packages/cli/src/__tests__/m5-cli.test.ts \
  packages/cli/src/__tests__/sandbox-all-features.test.ts \
  packages/adapters/src/m5 \
  packages/adapters/src/plugins \
  packages/core/src/init/__tests__/default-plugins.test.ts \
  > "$RUN_DIR/raw/03-vitest.out" 2> "$RUN_DIR/raw/03-vitest.err"
echo $? > "$RUN_DIR/raw/03-vitest.exit"

# step 4: root typecheck
pnpm typecheck > "$RUN_DIR/raw/04-typecheck.out" 2> "$RUN_DIR/raw/04-typecheck.err"
echo $? > "$RUN_DIR/raw/04-typecheck.exit"

# step 5: claudefast probe — what files relate to "superpowers"
claudefast -p "in THIS project, what files we have related to superpowers ?" \
  > "$RUN_DIR/raw/05-probe.out" 2> "$RUN_DIR/raw/05-probe.err"
echo $? > "$RUN_DIR/raw/05-probe.exit"
```

## V2 DUMP — `judge.json`

```json
{
  "issue": 256,
  "run_id": "2026-05-10-issue-256",
  "exit_code": "<max of step exits>",
  "metrics": {
    "user_facing_surface_clean": "<bool — step 1 stdout has 0 hits in bin.ts/init.ts/teamagent CLAUDE.md/evidence-script (the 'residual non-doc-path' grep grep -v 'docs/superpowers/' must be empty/'(only legitimate doc paths)')>",
    "fixtures_clean": "<bool — step 2 stdout shows '(clean)' for all 7 files>",
    "vitest_passed": "<bool — step 3 exit==0; counts: m5 (66) + install-plugins (12) + m5-cli (4) + sandbox (95) + adapters/m5 (11) + adapters/plugins (11) + default-plugins (10) = 209>",
    "root_typecheck_passed": "<bool — step 4 exit==0>",
    "probe_no_residual_files": "<bool — step 5 stdout does NOT list bin.ts / init.ts / packages/teamagent/CLAUDE.md / m5 fixtures / evidence-phase-gaps-ab.ts as 'related to superpowers'. The probe IS allowed to mention docs/superpowers/* (real milestone folder name) and any docs that link to it.>"
  },
  "evidence_dir": ".judge/2026-05-10-issue-256/raw/"
}
```

## V3 READ — LLM judge

```bash
claudefast -p "$(cat <<'EOF'
Read .judge/2026-05-10-issue-256/judge.json plus every file in .judge/2026-05-10-issue-256/raw/.
Return exactly one of: PASS / FAIL.

PASS criteria (ALL must hold):
  1. metrics.user_facing_surface_clean == true
  2. metrics.fixtures_clean == true
  3. metrics.vitest_passed == true
  4. metrics.root_typecheck_passed == true
  5. metrics.probe_no_residual_files == true

For metric 5 specifically:
  - Read raw/05-probe.out (the claudefast probe output).
  - It is FAIL if probe surfaces ANY of these as related-to-plugin-superpowers:
    bin.ts, init.ts, packages/teamagent/CLAUDE.md, m5 test fixtures
    (bootstrap-diff/manifest/m5-cli/fs-bootstrap test files),
    scripts/evidence-phase-gaps-ab.ts.
  - It is OK if probe mentions docs/superpowers/ (real folder name),
    docs/CONTEXT.md, docs/FASTPROBE.md, docs/README.md, docs/SELF-UPDATE.md
    (these contain legitimate references to the docs/superpowers/ path).

If FAIL, give a one-line reason naming the failing metric and quoting
the raw evidence file path. DO NOT execute code. Only read raw artifacts.
EOF
)"
```

## Already-run results (this branch)

| metric | value | evidence |
|--------|-------|----------|
| `user_facing_surface_clean` | `true` | grep returned `(none)` for bin.ts/init.ts/teamagent CLAUDE.md; `(only legitimate doc paths remain)` for evidence script |
| `fixtures_clean` | `true` | all 7 files: `(clean)` |
| `vitest_passed` | `true` | 209/209 tests across 15 files |
| `root_typecheck_passed` | `true` | `pnpm typecheck` exit 0 |
| `probe_no_residual_files` | run post-merge per V1.5 | — |
