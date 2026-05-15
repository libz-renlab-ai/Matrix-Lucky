# Opus 1M Independent Review (2026-05-06)

```
   ___                   ____         _
  / _ \ _ __  _   _ ___ |  _ \ _____ _(_) _____      __
 | | | | '_ \| | | / __|| |_) / _ \ \ / / |/ _ \ \ /\ / /
 | |_| | |_) | |_| \__ \|  _ <  __/\ V /| |  __/\ V  V /
  \___/| .__/ \__,_|___/|_| \_\___| \_/ |_|\___| \_/\_/
       |_|
        independent third-party review (no Codex bot)
```

## Summary

- **Review scope**: 42 commits in range `e20ef90..HEAD` (task description names this as "41
  commits"; the git range `e20ef90~1..HEAD` is exactly 42 commits and matches the topic
  groups listed in the task).
- **Files touched**: 71 docs/config files, +3277 / -118 lines.
- **No `packages/` source modified.** No binaries, no token leaks, no PII leak.
- **P1 count**: 1
- **P2 count**: 2
- **P3 count**: 4
- **Verdict**: **REQUEST_CHANGES**
- **One-line**: Stop-hook + duck-mode revert + SOT migration are clean and well-reasoned;
  but 4 commits claim "snippet + harness check" while leaving the harness scripts (and
  one referenced test) **untracked** in the worktree — so what merges to `main` will not
  be runnable end-to-end. Fix the staging gap, then approve.

---

## P1 issues (must fix to merge)

### P1-1: 4 verify-canned-answer.sh scripts are untracked despite "+ harness check" commit titles

**Affected commits / files** (each commit titled `docs(features/<slug>): canned-answer
snippet + harness check`):

| Commit | Slug | Tracked | Untracked (still `??`) |
|--------|------|---------|-------------------------|
| `e4695a8` | `trae-adapter`   | `canned-answer-snippet.md` | `verify-canned-answer.sh` |
| `a56f9f2` | `clean-install`  | `canned-answer-snippet.md` | `verify-canned-answer.sh` |
| `3ea31a1` | `onboarding`     | `canned-answer-snippet.md` | `verify-canned-answer.sh` |
| `436eb8b` | `override-loop`  | `canned-answer-snippet.md` | `verify-canned-answer.sh` |

Reproduction:

```text
$ git status --short docs/features/{override-loop,clean-install,onboarding,trae-adapter}/
?? docs/features/override-loop/verify-canned-answer.sh
?? docs/features/clean-install/verify-canned-answer.sh
?? docs/features/onboarding/verify-canned-answer.sh
?? docs/features/trae-adapter/verify-canned-answer.sh

$ for sha in e4695a8 a56f9f2 3ea31a1 436eb8b; do git show --name-only --format= $sha; done
docs/features/trae-adapter/canned-answer-snippet.md
docs/features/clean-install/canned-answer-snippet.md
docs/features/onboarding/canned-answer-snippet.md
docs/features/override-loop/canned-answer-snippet.md
```

**Why this is P1**:

1. Commit messages explicitly state "snippet + harness check" and the snippet body says
   things like *"Both checks must pass for `VERIFIED: ... PASS`"* and *"Run: pnpm install
   && bash docs/features/clean-install/verify-canned-answer.sh"* — but after a fresh
   clone of `main` post-merge, those `verify-canned-answer.sh` files **will not exist**.
2. The 4 corresponding rows in `docs/PRODUCT-FEATURES.md` (numbered list +
   table) point to harness scripts that do not exist in the repo.
3. `2026-05-06-final-report.md` lists each of these 4 as VERIFIED, which is misleading
   relative to what was actually committed.
4. The `worktree-dev-codex-pr` branch will look "VERIFIED" on the local machine because
   the files are sitting in working tree, but CI / colleagues / fresh checkouts get
   different reality. Classic "works on my machine" trap.

Additionally, two referenced test files used by tracked verify scripts are also
untracked:

```text
$ git ls-files packages/core/src/__tests__/override-loop.test.ts          # empty
$ git ls-files packages/core/src/taste/__tests__/tech-taste.test.ts      # empty
```

`docs/features/override-loop/canned-answer-snippet.md` and
`docs/features/tech-taste/canned-answer-snippet.md` (the latter's verify script *is*
tracked) both reference these missing tests as the verification target. So even if the
4 untracked verify scripts get added, override-loop's verify can't pass without also
committing `override-loop.test.ts`, and tech-taste verify is broken on a fresh clone for
the same reason.

**Fix suggestion**:

```bash
git add \
  docs/features/override-loop/verify-canned-answer.sh \
  docs/features/clean-install/verify-canned-answer.sh \
  docs/features/onboarding/verify-canned-answer.sh \
  docs/features/trae-adapter/verify-canned-answer.sh \
  packages/core/src/__tests__/override-loop.test.ts \
  packages/core/src/taste/__tests__/tech-taste.test.ts

git commit -m 'fix(feature-inventory): track missing verify scripts and tests'
```

Then re-run `bash docs/features/<slug>/verify-canned-answer.sh` for each of the four to
confirm they still PASS once everything is in tree, and update the postfix-summary if
counts change.

---

## P2 issues (strongly suggested)

### P2-1: `scripts/verify-all-rules.sh` does not discover the new per-feature verify scripts

`scripts/verify-all-rules.sh` uses:

```bash
find docs -mindepth 2 -maxdepth 2 -name 'verify-canned-answer.sh' -type f
```

That captures `docs/<topic>/verify-canned-answer.sh` (depth 2) but **not**
`docs/features/<slug>/verify-canned-answer.sh` (depth 3). Today there are 9 scripts
at depth 2 and 21+ at depth 3 (plus the 4 currently untracked). `RULE-VERIFY` is
documented in `CLAUDE.md` as the canonical entrypoint, so this means the new harness
work is invisible to the documented "all verifies green" checker.

Fix: change `-maxdepth 2` to `-maxdepth 3`, or add a parallel discovery pass
specifically for `docs/features/*/`. Re-run after the P1 fix to confirm everything is
green from the canonical entrypoint.

### P2-2: `embedding-conflict` and `inline-wiki` verify scripts have a dead-code branch around vitest exit capture

Both scripts run:

```bash
OUT="$(pnpm vitest run ... 2>&1 | tail -10)"
VITEST_EXIT=$?
echo "$OUT"
if [ "$VITEST_EXIT" -ne 0 ]; then
  echo "  [FAIL] ... tests exited $VITEST_EXIT"
  FAIL=1
fi
```

With `set -euo pipefail` set at the top of the script, if the pipeline returns non-zero
the script aborts at the assignment line — the `if [ "$VITEST_EXIT" -ne 0 ]` branch is
never reached, and the FAIL marker the author intended to print never fires. Net effect
is still "fail-fast on vitest failure", but the logged FAIL message is dead code, and a
FAIL=1 accumulator pattern that's used elsewhere in the same script doesn't actually
work for the vitest step.

Fix: drop the `set -e` for the vitest line (`set +e ; OUT=...; VITEST_EXIT=$? ; set -e`),
or convert to `if ! pnpm vitest run ... | tail -10 ; then ... fi`. Functional today,
but masks future regressions if someone adds more steps below it.

Files: `docs/features/embedding-conflict/verify-canned-answer.sh`,
`docs/features/inline-wiki/verify-canned-answer.sh`.

---

## P3 issues (nice to have)

### P3-1: Numbered output drifts to 51 in `2026-05-06-postfix-stdout.txt` while title still claims 49

Lines 79-80 of `docs/feature-inventory/2026-05-06-postfix-stdout.txt`:

```text
50. **`teamagent install-hook` / `uninstall-hook`** — hook 管理
51. **`teamagent mcp-server`** — stdio MCP 服务入口
```

Header line 1 of the same file says `49 个产品功能`. Author already acknowledged this
in `postfix-summary.md` ("PASS 接受范围 47–51"), so it's logged honestly — but the
artifact-as-merged contains an internally inconsistent count. Either tighten the
PRODUCT-FEATURES grouping so the model can't drift, or normalise the dump before
committing.

### P3-2: `docs/features/review-gate/verify-canned-answer.sh` is functionally a thin re-run of the PII redactor test, not a "review gate"

The slug is named `review-gate` but the harness simply runs
`packages/core/src/pii/__tests__/redactor.test.ts` and asserts pass. Conceptually this
is the same probe as `pii-redaction/run-judge.sh` (which is a richer judge). Either
rename the slug to something like `pii-redaction-vitest` or expand it to actually
exercise a reviewer workflow.

### P3-3: Snippet header style is split between two formats

About 3/4 of the 39 snippets follow the fenced-block pattern (`ab-benchmark`,
`canned-answers`, `cursor-compiler`, ...). The remaining ~10 (`onboarding`,
`embedding-conflict`, `inline-wiki`, `review-gate`, etc.) use an alternate prose
+ inline-bash style. Both render fine, but if any downstream tool greps the
snippets it has to handle two shapes. Pick one.

### P3-4: `.claude/hooks/laziness-self-report.sh` is still tracked but unwired

`.claude/settings.json` is now `{ "hooks": {} }`, but the 15 KB
`.claude/hooks/laziness-self-report.sh` script is still in `git ls-files` and is
referenced from `docs/specs/hook-add-laziness/verify/run-l2.sh`. That's defensible (the
spec dir documents how the hook used to work), but if the project's intent is to
permanently retire the project-level loop, consider either deleting the script and
updating the spec to point at the local `settings.local.json` setup, or adding a
top-of-file note ("disabled by `.claude/settings.json` since `e20ef90`; left for
historical / dev-machine reference"). Today, anyone reading just the hook script
believes it is still firing.

---

## What was done well

- **Stop-hook loop break (`e20ef90`) is exactly right** — diff is minimal, blast radius
  is contained to `.claude/settings.json`, and the commit body honestly explains the
  pairing with gitignored `.claude/settings.local.json`. The auto-managed `TEAMAGENT:
  START/END` block deletion (`cdebe6e`) follows naturally.
- **Reward-hacking revert (`705a2ed`) is forensic-grade** — I diffed
  `6812b4c~1..705a2ed` on `CLAUDE.md` and got an empty result, confirming the duck-mode
  block was fully and only reverted; the legitimate `cursor-compiler` snippet that
  shipped in the same staging-race commit was preserved.
- **PRODUCT-FEATURES.md numbering (`cb43f33`)** is a good upgrade for SOT readers: 1..49
  is contiguous and the table headers were updated atomically.
- **SOT directive (`2ff6eb0`)** correctly removes the canned-answer pattern and lets the
  model reason from the source doc; the 9-row CSV section is preserved for the
  CEO/VC-deck verifier (`docs/product-features/verify-canned-answer.sh`).
- **No PII / token leak** in `docs/feature-inventory/*.txt` (grep for `sk-`, `gho_`,
  `ghp_`, `eyJ...`, JWTs, `nb-ai.com` email, `[redacted]` mismatches: all clean except
  the canonical RFC-7519 sample JWT in `pii-redaction/run-judge.sh`, which is a known
  fixture).
- **No `packages/` source touched** — confirms the PR's "docs-only" framing.
- **All 39 `canned-answer-snippet.md` files have a consistent
  `## Required canned-answer for slug=<slug>` header line.**
- **Net `CLAUDE.md` diff (`origin/main..HEAD`)** is +5/-47 — actually shrinks the file
  while delivering a SOT migration. Healthy direction.

---

## Recommended next steps

1. Land the P1 fix as a single commit titled
   `fix(feature-inventory): track missing verify scripts and tests`.
2. Re-run `bash scripts/verify-all-rules.sh` after applying P2-1's depth-3 fix and
   confirm `passes / fails` count matches expectations; update the PR description if it
   changes.
3. Address P2-2 in the same fix-up sweep (one `sed` over the two files) so the dead
   branch is removed.
4. Optionally (P3) regenerate or trim `2026-05-06-postfix-stdout.txt` so the numbered
   list matches the 49-claim, and align snippet styles.
5. After P1+P2 land, run a final `bash scripts/verify-all-rules.sh` and attach the
   output to the PR before requesting Codex re-review (per `docs/POSTPR.md`).

Once P1 + P2 are resolved, this PR is in good shape to APPROVE.
