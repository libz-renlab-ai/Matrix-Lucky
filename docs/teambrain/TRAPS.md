```
踩坑 → 复盘 → 写入 TRAPS.md → 下一 agent 读到 → 不再踩
  │        │         │                │              │
  ▼        ▼         ▼                ▼              ▼
 fail   retro    TRAP entry       pre-read        skip it
  │                  │
  └──────────────────┘
     every P0 needs
     a verify hint
```

> **Note**: Schema may be tightened by TRAP_FORMAT.md (parallel teammate). If TRAP_FORMAT.md lands first, this file should be re-curated to match.

---

## How to read this file

Start at P0 — these are the traps that have caused actual production incidents or major team setbacks. Read the wrong_pattern first: if you recognise your current action in it, stop. Check the verify_command before proceeding. P1/P2 are condensed as a quick-scan table; consult them when entering a new phase (release, review, oncall). The 10 standards and 5 failure cases at the bottom are the structural backbone — they explain *why* the traps exist, not just what to avoid.

---

## P0 Traps (deep dives)

### TRAP-GIT-001

- **category**: git
- **trigger**: `git push --force` on a shared branch
- **wrong_pattern**: `git push --force origin main` (or any shared branch without `--force-with-lease`)
- **right_pattern**: `git push --force-with-lease origin <branch>` — aborts if remote has commits you haven't seen
- **evidence_link**: Day 0 dump §A trap #1 — "别人 commit 直接被覆盖消失"
- **severity**: P0
- **verify_command**: `git config --get receive.denyNonFastForwards` should return `true` on protected branches; also check `git remote show origin | grep -i "force"` for branch protection status

---

### TRAP-REVIEW-001

- **category**: review
- **trigger**: Merging code with `// TODO: add tests later` or any "以后再补测试" comment
- **wrong_pattern**: PR merged with `// TODO: test` or commit message containing "will add tests" / "no test needed" ⚠️ MOCK LOOPHOLE — skip-if-no-test patterns must be blocked
- **right_pattern**: DoD gate: CI enforces coverage delta ≥ 0 on every PR; no merge allowed with open `TODO.*test` markers
- **evidence_link**: Day 0 dump §B trap #20 — "'以后再补测试'成习惯 → DoD 必须含测试，无测试不算完成"; Failure case #2 — 800万+ order loss from skipped testing
- **severity**: P0
- **verify_command**: TeamBrain scope (Markdown-only repo): `grep -rn "TODO.*test\|later.*test\|add.*test" docs/ && echo "FAIL: deferred test markers found" || echo "PASS"`. For source-code repos substitute `docs/` with `src/` or `packages/`. Scope is conditional on repo type — mark as N/A for pure Markdown repos with no CI.

---

### TRAP-REVIEW-002

- **category**: review
- **trigger**: Mocking every collaborator so the test suite passes even when the real integration is broken
- **wrong_pattern**: `jest.mock('../database')`, `jest.mock('../api-client')` wrapping the entire module under test — mock 套娃 (mock turtles all the way down) ⚠️ MOCK LOOPHOLE
- **right_pattern**: Mock only at system boundaries (network, filesystem). Core logic uses real collaborators in integration tests.
- **evidence_link**: Day 0 dump §B trap #15 — "真实调用链一改全挂 → Mock 最小化，核心逻辑用真协作对象做集成测试"
- **severity**: P0
- **verify_command**: `mock_count=$(grep -rcE 'jest\.mock|vi\.mock' packages/ --include='*.test.ts' | awk -F: '{s+=$2} END{print s}'); test_count=$(find packages -name '*.test.ts' | wc -l); awk -v m="$mock_count" -v t="$test_count" 'BEGIN{ ratio=(t>0?m/t:0); if(ratio>0.5){print "FAIL: mock ratio "ratio" > 0.5 (threshold)"; exit 1} print "PASS: mock ratio "ratio }'` — exit 0 = PASS, exit 1 = FAIL; threshold is 0.5, not a smell

---

### TRAP-OPS-001

- **category**: ops
- **trigger**: Releasing directly to 100% traffic without a staged rollout
- **wrong_pattern**: Deploy script with no canary step, or `kubectl set image` directly applied to all replicas at once; `ROLLOUT_PERCENT=100` as first and only step
- **right_pattern**: Staged rollout: 5% → 15% → 50% → 100%, each step with human confirmation gate and error-rate check. Rollback script must be in CI before deploy runs.
- **evidence_link**: Day 0 dump §C trap #21 — "灰度无梯度 — 流量突增 bug 集中爆"; trap #22 — "回滚脚本没进 CI — 灾难时刻敲错命令"
- **severity**: P0
- **verify_command**: `grep -rh "ROLLOUT_PERCENT\|canary\|rollback" .github/workflows/ --include="*.yml" \| grep -v "^#" \| tee /tmp/deploy-check.txt; grep -qE "\b(5\|10)\b" /tmp/deploy-check.txt && grep -q "rollback" /tmp/deploy-check.txt && echo "PASS: staged rollout + rollback found"; [ $? -ne 0 ] && echo "FAIL: missing canary step or rollback job"` — must print PASS

---

### TRAP-COOP-001

- **category**: coop
- **trigger**: On-call handoff delivered verbally with no written runbook update
- **wrong_pattern**: Slack message "hey you're on call now, just watch the dashboard" with no doc update ⚠️ verbal-only rule — no ground-truth trail
- **right_pattern**: Structured handoff doc updated before shift change containing: alert thresholds, most recent root causes (≤7 days), emergency contacts. Template: `docs/oncall/handoff-YYYY-MM-DD.md`
- **evidence_link**: Day 0 dump §D trap #40 — "On-call 交接只口头说一句 → 交接文档结构化：阈值 / 最近根因 / 应急联系人"
- **severity**: P0
- **verify_command**: `latest=$(find docs/oncall -name "handoff-*.md" -mtime -1 | head -1); [ -n "$latest" ] && lines=$(wc -l < "$latest") && [ "$lines" -ge 10 ] && echo "PASS: handoff doc present, $lines lines" || echo "FAIL: no handoff doc updated within 24h or doc < 10 lines"` — note: `-mtime -1` is POSIX; on macOS use `find -Bd 1d` as equivalent; the above is portable across GNU/BSD find

---

### TRAP-OPS-012

- **category**: ops
- **trigger**: Closing a real task without running the executable archive-gate harness; relying on convention or visual review of `docs/teambrain/evidence/<run_id>/` instead of a fixed binary
- **wrong_pattern**: Reviewer eyeballs the evidence dir, agent claims "all 6 files present", or VERIFY recipe leaves `verify_command` as prose like "ensure archive gate is satisfied" — no executable. ⚠️ archive-gate-by-convention loophole.
- **right_pattern**: Run the harness via md playbook `docs/plans/scripts--verify--tbrain-verify/judge.md` (archived script: `docs/legacy/judge-scripts/scripts/verify/tbrain-verify.sh`; binary closed GAP-1 + GAP-2 from Real Task #1 evidence). It writes raw `.judge/<run_id>/judge.json` with `metrics.archive_present`, `metrics.archive_missing`, and `missing_evidence`; a separate LLM judge then reads only the JSON file path (per AP-8 / GAP-3). Exit non-zero blocks the merge.
- **evidence_link**: `docs/teambrain/evidence/20260502T000000Z-real-task-1/failures.md` GAP-2 ("archive gate is enforced by convention, not by a CI check") and GAP-1 ("no automated harness binary lives in repo yet")
- **severity**: P0
- **verify_command**: `claudefast -p "Follow docs/plans/scripts--verify--tbrain-verify/judge.md with RECIPE_ID=${RECIPE_ID:?set RECIPE_ID} RUN_ID=${RUN_ID:?set RUN_ID}"` then `jq -e '.missing_evidence == false and .metrics.archive_missing == 0 and .metrics.canonical_paths_missing == 0' ".judge/${RUN_ID}/judge.json"` — exit 0 = PASS; non-zero exit or `missing_evidence=true` = FAIL. Negative case for a fresh agent: invoking with `RUN_ID=20260101T000000Z-nonexistent` returns exit 2 and `missing_evidence=true`. (archived: `docs/legacy/judge-scripts/scripts/verify/tbrain-verify.sh`)

---

## Real Task #1 GAP closure

Each GAP surfaced by Real Task #1 (recorded under `evidence/20260502T000000Z-real-task-1/failures.md` §"TeamBrain framework gaps surfaced") has a committed closure in this brain. Day 3 exit criterion #2 — *"Task #1's failure points all have a corresponding TRAPS.md entry"* — is satisfied by this table. Each row carries an executable `verify_command` so the closure itself is checkable, not verbal.

| GAP | Closure entry | Closure commit | verify_command (exit 0 = closure intact) |
|-----|---------------|----------------|------------------------------------------|
| GAP-1: no automated harness binary in `scripts/verify/` | `TRAP-OPS-012` (this file, P0) | `9230b3c` | `test -f docs/plans/scripts--verify--tbrain-verify/judge.md && claudefast -p "Follow docs/plans/scripts--verify--tbrain-verify/judge.md with RECIPE_ID=VERIFY-TBRAIN-001 RUN_ID=20260502T000000Z-real-task-1" >/dev/null` (archived: `docs/legacy/judge-scripts/scripts/verify/tbrain-verify.sh`) |
| GAP-2: archive gate enforced by convention only | `TRAP-OPS-012` `verify_command` (this file, P0) | `83c54b6` | `jq -e '.missing_evidence == false and .metrics.archive_missing == 0' .judge/20260502T000000Z-real-task-1/judge.json` *(historical run; for new runs replace the path with `.judge/${RUN_ID}/judge.json`)* |
| GAP-3: judge prompt splices file contents instead of paths | `AP-8` + `VERIFY-CLAUDE-007` in `agent_rules/claude.md` | `181ac5f` | `! grep -RnE 'claudefast.*\$\((cat\|head\|tail) ' docs/plans/ 2>/dev/null` (archived scripts at `docs/legacy/judge-scripts/scripts/verify/`) |
| GAP-4: `archive_dir` not enumerated in `judge-summary.json` schema | `evidence/README.md` "judge-summary.json required fields" table | `5819ab6` | `grep -qF '| `archive_dir` |' docs/teambrain/evidence/README.md` |

Also recorded as anti-mock evidence under `evidence/20260502T000000Z-real-task-2/failures.md` §"TeamBrain framework gaps tracked from Real Task #1", which marks all four GAPs **CLOSED** with the same commit SHAs.

---

## P1 / P2 Condensed

| id | category | severity | wrong_pattern | right_pattern | verify_command | evidence_link |
|----|----------|----------|---------------|---------------|----------------|---------------|
| TRAP-GIT-002 | git | P1 | commit message: "fix bug" / "update" | imperative: `feat(scope): description` | `git log --oneline -20 \| grep -E "^[a-f0-9]+ (fix bug\|update\|wip)$"` returns empty | Day 0 dump §A trap #2 |
| TRAP-GIT-003 | git | P1 | PR with no description, raw link dump | PR body: what / why / how-to-verify | `gh pr view <N> --json body -q '.body'` must be non-empty and ≥ 50 chars | Day 0 dump §A trap #3 |
| TRAP-GIT-004 | git | P1 | giant commit mixing unrelated changes | atomic commits, one logical concern per commit | `git show --stat HEAD \| grep -c "^\s"` — file count > 15 triggers review | Day 0 dump §A trap #4 |
| TRAP-GIT-005 | git | P1 | long-lived feature branch, never rebased | `git rebase main` daily or every 2 days | `git log --oneline HEAD..origin/main \| wc -l` — > 20 diverged commits = rebase required | Day 0 dump §A trap #5 |
| TRAP-GIT-006 | git | P1 | hotfix directly on main without PR | hotfix branch → PR + review → cherry-pick to prod | `git log --oneline origin/main -5 \| grep -v "Merge\|feat\|fix\|chore"` returns empty | Day 0 dump §A trap #6 |
| TRAP-GIT-007 | git | P2 | `git merge` without `--no-ff` on history branches | use `--no-ff` to preserve merge nodes; rebase for linear history | `git log --merges --oneline -5` shows merge commits with two parents | Day 0 dump §A trap #7 |
| TRAP-GIT-008 | git | P2 | `.gitignore` edit has no effect (file already staged) | `git rm -r --cached . && git add .` | `git status --short \| grep "^??"` shows no previously-ignored files | Day 0 dump §A trap #8 |
| TRAP-GIT-009 | git | P1 | no protected branch rules | set branch protection: require PR + review + status checks | `gh api repos/:owner/:repo/branches/main/protection --jq '.required_pull_request_reviews'` non-null | Day 0 dump §A trap #9 |
| TRAP-GIT-010 | git | P2 | `git stash` without `-m` name | `git stash push -m "context-description"` | `git stash list \| grep -v ": On "` — all entries must have a descriptive name after the colon | Day 0 dump §A trap #10 |
| TRAP-REVIEW-003 | review | P1 | coverage % looks fine, new code 0% delta | per-PR incremental coverage gate in CI | `diff-cover coverage.xml --compare-branch=main` — new-lines coverage must be ≥ 80% | Day 0 dump §B trap #14 |
| TRAP-REVIEW-004 | review | P1 | TDD red/green reversed — tests written after code | strict red → green → refactor; PR blocked if no failing test first | PR description must include "Red test commit: \<sha\>" before implementation commit sha | Day 0 dump §B trap #12 |
| TRAP-REVIEW-005 | review | P1 | code review only catches style issues | linter owns style; review gates on correctness / security / maintainability | PR checklist must include "Correctness reviewed" and "Security reviewed" checkboxes | Day 0 dump §B trap #13 |
| TRAP-REVIEW-006 | review | P1 | hardcoded test data breaks on field rename | use factory / fixture pattern for test data | `grep -rn "[0-9]\{4\}-[0-9]\{2\}-[0-9]\{2\}\|id: 1234" --include="*.test.ts"` returns empty | Day 0 dump §B trap #16 |
| TRAP-REVIEW-007 | review | P1 | nobody checks test logic quality | reviewer has duty to challenge test assertions | PR review thread must have ≥ 1 comment on test assertions; template enforced | Day 0 dump §B trap #17 |
| TRAP-REVIEW-008 | review | P1 | `/* istanbul ignore */` to hit coverage % ⚠️ | CI limit on ignore directives; each must link a ticket | `grep -rn "istanbul ignore\|c8 ignore" src/ \| wc -l` must be ≤ 3; each instance must have a GH issue URL on same line | Day 0 dump §B trap #18 |
| TRAP-REVIEW-009 | review | P2 | E2E tests run on every unit test loop | pyramid: unit → integration → E2E only for critical paths | CI job matrix has separate `test:unit`, `test:integration`, `test:e2e` stages; E2E not in default push pipeline | Day 0 dump §B trap #19 |
| TRAP-OPS-002 | ops | P1 | no rollback script in CI | rollback script checked into CI, tested same as deploy script | `find .github/workflows -name "*.yml" -exec grep -l "rollback" {} \;` returns ≥ 1 file | Day 0 dump §C trap #22 |
| TRAP-OPS-003 | ops | P1 | monitoring only P99 latency | P50 / P90 / P99 all configured; SLO based on P50 | Monitoring config must contain quantile entries `0.5`, `0.9`, `0.99`; `grep -r "0\.5\b\|0\.9\b\|0\.99\b" config/` | Day 0 dump §C trap #23 |
| TRAP-OPS-004 | ops | P1 | health check depends on downstream services | health check tests only process liveness, not downstream | `curl -w "%{time_total}" /health` response time < 50ms and returns 200 with no downstream calls | Day 0 dump §C trap #24 |
| TRAP-OPS-005 | ops | P1 | experiment flags and feature flags share state | isolate experiment vars from feature flags, separate namespaces | `grep -rn "EXPERIMENT_\|FEATURE_" config/ \| awk -F: '{print $2}'` — no line must match both prefixes | Day 0 dump §C trap #25 |
| TRAP-OPS-006 | ops | P1 | rollback skips schema compatibility check | schema changes must be backward compatible; validate before rollback | `grep -rn "DROP COLUMN" db/migrations/` triggers review; each drop must be preceded by nullable/default migration | Day 0 dump §C trap #26 |
| TRAP-OPS-007 | ops | P2 | oncall dashboard has 20+ charts | oncall board: only QPS / Error / Latency — 3 charts max | `jq '.panels \| length' oncall-dashboard.json` must be ≤ 3 | Day 0 dump §C trap #27 |
| TRAP-OPS-008 | ops | P1 | tracing disabled during canary to reduce cost | sampling rate ≥10%; never disable tracing entirely during rollout | `grep -r "TRACE_SAMPLE_RATE\|sampling_rate" config/ \| grep -v "#"` must show value ≥ 0.1 | Day 0 dump §C trap #28 |
| TRAP-OPS-009 | ops | P1 | deploy scheduled during peak traffic | deploys always in low-traffic window | CI deploy job `cron:` must reference off-peak hours (e.g., 02:00–06:00 UTC); `grep -r "cron:" .github/workflows/*.yml` | Day 0 dump §C trap #29 |
| TRAP-OPS-010 | ops | P1 | no data backfill plan for new schema fields | schema changes must ship with backfill script | `git show --name-only \| grep "backfill"` non-empty for any migration PR | Day 0 dump §C trap #30 |
| TRAP-OPS-011 | ops | P1 | task closed without saving complete judge evidence artifacts | every task must commit `docs/teambrain/evidence/<run_id>/` with `INDEX.md`, `transcript.md`, `stdout.txt`, `stderr.txt`, `failures.md`, `judge-summary.json`; raw `.judge/<run_id>/judge.json` must also exist; never replace `run_id` with a commit hash | `run_id="${RUN_ID:?set RUN_ID}"; for f in INDEX.md transcript.md stdout.txt stderr.txt failures.md judge-summary.json; do git cat-file -e "HEAD:docs/teambrain/evidence/$run_id/$f" \|\| exit 1; done; test -s ".judge/$run_id/judge.json"` | docs/notes/2026-05-01-day0-team-experience-dump.md §C trap #30 |
| TRAP-COOP-002 | coop | P1 | estimate = best case only | three-point estimate × 1.3: `(best + 4×likely + worst) / 6 × 1.3` | PR description for feature work must contain fields `best:`, `likely:`, `worst:`; ratio `likely/best` ≥ 1.3 | Day 0 dump §D trap #31 |
| TRAP-COOP-003 | coop | P1 | design doc with no "why X over Y" rationale | every design doc must have an alternatives-considered section | `grep -l "Alternatives\|Why.*over\|We chose" docs/design/*.md \| wc -l` equals total design doc count | Day 0 dump §D trap #32 |
| TRAP-COOP-004 | coop | P1 | runbook only covers the happy path | runbook footer: "historical incidents" section mandatory | `grep -l "Historical\|Past incidents\|事故" docs/oncall/*.md \| wc -l` equals total runbook count | Day 0 dump §D trap #33 |
| TRAP-COOP-005 | coop | P1 | new team member gets link dump, no pair session | day 1: in-person task walkthrough; week 2+: 15-min daily pairing | Onboarding checklist PR has "Day 1 walkthrough: done" and "Week 2 pairing: scheduled" items checked | Day 0 dump §D trap #34 |
| TRAP-COOP-006 | coop | P1 | estimate has no buffer padding | external deadline = internal estimate + 2-week buffer | Project plan doc must contain `buffer: 2w` or `+14d`; `grep "buffer\|2 week" docs/plan*.md` non-empty | Day 0 dump §D trap #35 |
| TRAP-COOP-007 | coop | P2 | doc review comment: "this is wrong" with no direction | review comment must include: priority (P0/P1) + suggested fix direction | PR review comments must match pattern `P[01]: .*→`; reviewer template enforced | Day 0 dump §D trap #36 |
| TRAP-COOP-008 | coop | P2 | task assigned by "whoever is free" | assign via skill matrix; critical path tasks assigned by competency | Sprint board critical-path tasks must have an assignee with matching skill tag in team roster | Day 0 dump §D trap #37 |
| TRAP-COOP-009 | coop | P2 | meeting agenda without owner/due per item | every agenda item must close with: conclusion + owner + due date | Meeting notes must have `owner:` and `due:` for each item; `grep -c "owner:" notes.md` ≥ agenda item count | Day 0 dump §D trap #38 |
| TRAP-COOP-010 | coop | P2 | new contributor PR merged without walkthrough | before merge: 15-min "why did I write it this way" session | PR timeline shows a review comment from maintainer containing "walkthrough" within 48h of first commit | Day 0 dump §D trap #39 |

---

## 10 Team Standards (governance scope)

> **Scope marker:** these are team-process norms, not trap-rules over code or evidence. The Day 3 hard rule "every rule has an executable verify command" applies here too — each standard below ships with an executable `verify_command` whose default scope is **PR descriptions / process docs**. For repos without those artifacts the harness must declare `scope: not_applicable` instead of silently passing; never claim PASS without either matching the command or asserting N/A scope.

1. **STANDARD-1 上下文所有权 (Context Ownership)** — Every PR and design review must name a decision owner; if that person is absent, a named deputy is required. No owner = blocked.
   - `verify_command`: `gh pr view "${PR_NUM:?set PR_NUM}" --json body -q '.body' | grep -Eq '^Decision Owner: @[A-Za-z0-9_-]+' || { echo FAIL; exit 1; }; echo PASS`

2. **STANDARD-2 承诺颗粒度 (Commitment Granularity)** — Minimum estimate unit is half a day. "I'm not sure" is valid; "maybe a few hours" is not.
   - `verify_command`: `gh pr view "${PR_NUM:?set PR_NUM}" --json body -q '.body' | grep -Eq '\b([0-9]+(\.5)?)d\b' && grep -Evq '\b[0-9]+\.[0-9]+(?<!\.5)d\b' <(gh pr view "${PR_NUM}" --json body -q '.body') || { echo FAIL; exit 1; }; echo PASS`

3. **STANDARD-3 阻塞可视化 (Blocker Visibility)** — Any blocker lasting > 1 day must be escalated. Silent waiting = spreading the risk.
   - `verify_command`: `count=$(gh issue list --label "blocked" --search "updated:<$(date -u -v-1d +%Y-%m-%d 2>/dev/null || date -u -d '1 day ago' +%Y-%m-%d)" --json number -q 'length'); test "$count" -eq 0 || { echo "FAIL stale blockers=$count"; exit 1; }; echo PASS`

4. **STANDARD-4 契约优于默契 (Written Contract > Tacit Agreement)** — Cross-team interface agreements must be in writing before any code is written.
   - `verify_command`: `gh pr view "${PR_NUM:?set PR_NUM}" --json body -q '.body' | grep -Eq 'ADR-[0-9]+|docs/(adr|interface)/' || { echo FAIL; exit 1; }; echo PASS`

5. **STANDARD-5 增量即交付 (Increment = Delivery)** — A task is complete only when a working demo exists.
   - `verify_command`: `gh pr view "${PR_NUM:?set PR_NUM}" --json body -q '.body' | grep -Eq '\[(x\|X)\]\s+demo\s+(link\|screencast)' || { echo FAIL; exit 1; }; echo PASS`

6. **STANDARD-6 悲观估时法 (Pessimistic Estimation)** — All estimates multiplied by 1.5 before entering planning. Optimistic estimates are rejected.
   - `verify_command`: `body=$(gh pr view "${PR_NUM:?set PR_NUM}" --json body -q '.body'); best=$(printf '%s' "$body" | grep -Eo 'best:\s*[0-9.]+' | grep -Eo '[0-9.]+' | head -1); likely=$(printf '%s' "$body" | grep -Eo 'likely:\s*[0-9.]+' | grep -Eo '[0-9.]+' | head -1); awk -v b="$best" -v l="$likely" 'BEGIN{ if (b+0>0 && l/b>=1.3) print "PASS"; else { print "FAIL"; exit 1 } }'`

7. **STANDARD-7 缺席即默认同意 (Absence = Consent)** — Reviewer absent ≥ 15 minutes in a scheduled review = waived.
   - `verify_command`: `test -s "docs/reviews/${REVIEW_ID:?set REVIEW_ID}.md" && grep -Eq '^Attendance: ' "docs/reviews/${REVIEW_ID}.md" || { echo FAIL; exit 1; }; echo PASS`

8. **STANDARD-8 失败即学习 (Failure = Learning)** — Every production incident and missed estimate triggers a mandatory post-mortem within 48h.
   - `verify_command`: `find docs/postmortems -name "*.md" -newer "docs/incidents/${INCIDENT_ID:?set INCIDENT_ID}.md" -mmin -2880 | grep -q . || { echo FAIL; exit 1; }; echo PASS`

9. **STANDARD-9 依赖先验性 (Dependency Pre-validation)** — Cross-team dependencies must be confirmed before development starts.
   - `verify_command`: `gh issue view "${ISSUE_NUM:?set ISSUE_NUM}" --json body -q '.body' | grep -Eq 'Dependency confirmed by: @[A-Za-z0-9_-]+ on [0-9]{4}-[0-9]{2}-[0-9]{2}' || { echo FAIL; exit 1; }; echo PASS`

10. **STANDARD-10 退出条件先行 (DoD First)** — Work does not start until DoD is written and agreed by all stakeholders.
    - `verify_command`: `body=$(gh issue view "${ISSUE_NUM:?set ISSUE_NUM}" --json body -q '.body'); printf '%s' "$body" | awk '/^## (Definition of Done|DoD)/{f=1; next} /^## /{f=0} f && NF{ok=1} END{ exit (ok?0:1) }' && echo PASS || { echo FAIL; exit 1; }`

For Markdown-only repos like this one, every STANDARD-* `verify_command` is **scope: not_applicable** — declare it explicitly in the run's `judge-summary.json` under a `scope_skips` field rather than passing silently.

---

## 5 Typical Failure Cases

| # | Background | Wrong Decision | Blast & Loss | Root Lesson | Would-Have-Prevented | Source |
|---|-----------|----------------|-------------|-------------|----------------------|--------|
| 1 | Core module author departed, no docs | "Code is documentation" | 6× maintenance cost 6 months later, 2 P0 incidents | Knowledge not encoded = zero; turnover accelerates entropy | TRAP-COOP-003 (no "why" rationale in docs) | Day 0 dump §Ⅲ case #1 |
| 2 | OKR sprint crunch, testing time cut | "Sacrifice tests for velocity" | Core flow failure post-launch; 800万+ order loss | Quality is not a phase; debt accrues with compound interest | TRAP-REVIEW-001 (skip tests) | Day 0 dump §Ⅲ case #2 |
| 3 | 2 years of tech debt, refactor blocked | "If it works, don't touch it" | Small change triggers circular dependency; 3-day cascade failure | Tech debt is compound interest; later = more expensive | TRAP-REVIEW-002 (mock 套娃 hiding coupling) | Day 0 dump §Ⅲ case #3 |
| 4 | Hiring season, strong individual hired | "We'll train culture fit later" | 6 months in: collaboration friction leads to 2 senior departures | Hiring is reverse selection; mis-hire cost multiplies | TRAP-COOP-008 (assign by availability not skill) | Day 0 dump §Ⅲ case #4 |
| 5 | Team familiar with microservices, new system chosen | "Use the tech we know" | Distributed transactions/network/ops far exceeded estimates; 4-month delay | Characterise the problem domain first, then match technology | TRAP-COOP-002 (optimistic estimation only) | Day 0 dump §Ⅲ case #5 |
