```text
   ┌──────────────┐    ┌──────────────┐    ┌──────────────┐
   │  V1  RUN     │ →  │  V2  DUMP    │ →  │  V3  READ    │
   │ fixed tools  │    │ judge.json   │    │ raw JSON     │
   │ exit_code +  │    │ + raw evid   │    │ → LLM judge  │
   │ stdout/err   │    │ (no LLM yet) │    │ PASS / FAIL  │
   └──────────────┘    └──────────────┘    └──────────────┘
```

# Judge harness — Issue #258

Code 不评自己。固定工具跑、固定 JSON 落盘、另一只 LLM 只读 raw artifact 决断。

## V1 RUN — fixed tools

```bash
WT=/Users/m1/projects/TeamBrain/.codex/worktrees/issue-258
RUN_DIR=$WT/.judge/2026-05-10-issue-258
mkdir -p "$RUN_DIR/raw"; cd "$WT"

# 1. evidence script: superpowers literal must be empty (only docs/backup/ paths now)
grep -nE "(superpowers|caveman|sales)" scripts/evidence-phase-gaps-ab.ts > "$RUN_DIR/raw/01-evidence.out" 2>&1; echo $? > "$RUN_DIR/raw/01-evidence.exit"

# 2. README.md: 0 hits
grep -nE "(superpowers|caveman|sales)" README.md > "$RUN_DIR/raw/02-readme.out" 2>&1; echo $? > "$RUN_DIR/raw/02-readme.exit"

# 3. root CLAUDE.md: links must point to -v2 files (which exist)
grep -nE "superpowers" CLAUDE.md > "$RUN_DIR/raw/03-claude.out" 2>&1; echo $? > "$RUN_DIR/raw/03-claude.exit"
ls docs/superpowers/specs/2026-04-15-product-roadmap-v2.md docs/superpowers/specs/2026-04-15-phase2-design-v2.md docs/backup/phase2-superseded/2026-04-22-product-roadmap-v3.md > "$RUN_DIR/raw/03-paths.out" 2> "$RUN_DIR/raw/03-paths.err"; echo $? > "$RUN_DIR/raw/03-paths.exit"

# 4. typecheck
pnpm typecheck > "$RUN_DIR/raw/04-typecheck.out" 2> "$RUN_DIR/raw/04-typecheck.err"; echo $? > "$RUN_DIR/raw/04-typecheck.exit"

# 5. claudefast probe — gate
( cd /tmp && claudefast -p "I am asking about the project at /Users/m1/projects/TeamBrain. Run: cd /Users/m1/projects/TeamBrain && grep -rln 'superpowers' --include='*.ts' --include='*.md' --include='*.json' . 2>/dev/null | grep -v node_modules | grep -v '.git/' | grep -v '.claude/worktrees/' | grep -v '.codex/worktrees/' | sort. Return a markdown list. Skip docs/superpowers/ folder paths." --permission-mode acceptEdits > "$RUN_DIR/raw/05-probe.out" 2> "$RUN_DIR/raw/05-probe.err" ) ; echo $? > "$RUN_DIR/raw/05-probe.exit"
```

## V2 DUMP — `judge.json`

```json
{
  "issue": 258,
  "metrics": {
    "evidence_script_clean": "<bool: step 1 stdout empty (no superpowers/caveman/sales literals)>",
    "readme_clean": "<bool: step 2 stdout empty>",
    "root_claude_md_links_alive": "<bool: step 3-paths.exit==0 (both -v2 files exist + backup file exists); step 3-claude.out shows -v2 suffix on both lines>",
    "typecheck_passed": "<bool: step 4 exit==0>",
    "probe_no_residual_files": "<bool: step 5 stdout does NOT list bin.ts / init.ts / packages/teamagent/CLAUDE.md / m5 fixtures / scripts/evidence-phase-gaps-ab.ts as related-to-plugin-superpowers>"
  },
  "evidence_dir": ".judge/2026-05-10-issue-258/raw/"
}
```

## V3 READ — LLM judge

```bash
claudefast -p "$(cat <<'EOF'
Read .judge/2026-05-10-issue-258/judge.json + every file in raw/.
Return PASS / FAIL.

PASS criteria (ALL must hold):
  1. metrics.evidence_script_clean == true
  2. metrics.readme_clean == true
  3. metrics.root_claude_md_links_alive == true
  4. metrics.typecheck_passed == true
  5. metrics.probe_no_residual_files == true

For metric 5:
  FAIL if probe (raw/05-probe.out) surfaces:
    bin.ts, init.ts, packages/teamagent/CLAUDE.md,
    m5 test fixtures (bootstrap-diff.test.ts / manifest.test.ts /
    m5-cli.test.ts / fs-bootstrap.test.ts),
    scripts/evidence-phase-gaps-ab.ts.
  OK if probe surfaces: docs/superpowers/, docs/CONTEXT.md, docs/FASTPROBE.md,
  docs/README.md, docs/SELF-UPDATE.md, docs/PRODUCT-FEATURES.md, docs/系统展示/,
  docs/HOWTO-PLAN-PR.md, docs/PLAN-RESEARCH-REPORT.md, docs/specs/,
  docs/features/, docs/backup/, docs/plans/2026-05-10-issue-{253,256,258}/,
  packages/types/src/m5.ts, packages/core/src/validator/l0.ts,
  packages/core/dist/index.d.ts (compiled), packages/types/dist/index.d.ts,
  CLAUDE.md (now repointed to -v2 paths, which surface as legitimate).

If FAIL, give a one-line reason naming the failing metric and quoting the raw evidence file path.
EOF
)"
```

## Already-run results (this branch)

| metric | value | evidence |
|--------|-------|----------|
| `evidence_script_clean` | `true` | `grep` returned only the new `docs/backup/phase2-superseded/` lines, no superpowers literals |
| `readme_clean` | `true` | `grep "superpowers" README.md` → empty |
| `root_claude_md_links_alive` | `true` | `ls` of both `-v2` files + `2026-04-22-product-roadmap-v3.md` archive: all exist |
| `typecheck_passed` | `true` | `pnpm typecheck` exit 0 |
| `probe_no_residual_files` | run post-merge per V1.5 | — |
