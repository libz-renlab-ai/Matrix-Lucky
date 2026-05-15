```
   ┌──────────── judge harness — fix-install · 8/8 MANDATORY ──────────┐
   │                                                                    │
   │   creation→fswatch    read→fs_usage(sudo)   hook→stream-json       │
   │           ↘               ↓              ↙                         │
   │           ┌───────── MAIN agent dispatch ─────────┐                │
   │           │   verify-all-channels.sh + judge.md   │                │
   │           └───────────────────┬────────────────────┘               │
   │                               ↓                                    │
   │   tmux→statusline    time/ps→lifecycle    sqlite/jq→content        │
   │           ↘               ↓              ↙                         │
   │     cache-diff→net      negative→absence asserts                   │
   │                                                                    │
   │   8/8 channels REQUIRED · missing tool = FATAL · no degrade-null   │
   │   each probe: independent claudefast -p; AND of all 8 = PASS       │
   └────────────────────────────────────────────────────────────────────┘
```

# judge harness — fix-install · 8-channel mandatory verification

> Per project rule "Judge harness = MD playbook, not fixed bash" the canonical
> entry is **this `judge.md`**; bash files under `scripts/` are reproducible
> **evidence collectors** the playbook calls — they never decide PASS/FAIL.
> Each PASS/FAIL verdict is rendered by an independent `claudefast -p` (or
> Agent subagent) reading raw JSON + evidence; no probe sees this playbook,
> the source code, or another probe's verdict.

## Mandate (revised)

Per "boil the lake" directive: **ALL 8 channels are required**. There is no
`pass=null` degrade path. If a required tool is missing on the host
(`fswatch`, `du`, `fs_usage`, `sqlite3`, `jq`, `claudefast`, `tmux`, `npm`,
`node`), the harness aborts with a clear message — **install the tool, do
not skip the channel**. Channel #2 (fs_usage) requires sudo; the master
orchestrator pauses at the start to prompt the user for their password
(`sudo -v` cached credentials), then keeps them alive across the run.

## Scope

The install-too-long fix lives in two commits on branch `worktree-fix-install`:

- `c859bd5` — postinstall.mjs Stage 2 detached (kills the 5–10 min synchronous warmup window).
- `be65c31` — `@xenova/transformers` + `onnxruntime-node` removed from `package.json` entirely (works around npm 10 ignoring `--omit=optional` for tarball installs); `release/install.sh` opt-in via `TEAMAGENT_INCLUDE_OPTIONAL=1`.

Acceptance:

1. Default `npm install -g <teamagent.tgz>` wall-clock **≤ 30s** on fresh cache.
2. Vector deps **absent** by default; **present** under opt-in.
3. `~/.teamagent/.warmup-state.json` **absent** by default; **`status="downloading"`** under opt-in.
4. Banner shows `vector-deps-absent` opt-in hint by default.
5. Post-install runtime still functions: SessionStart hook fires, statusline renders, knowledge.db initializes after `teamagent init`.

## 8-channel mapping (all required)

| # | Channel | Tool | Verifies | Sudo / TTY | Collector |
|---|---|---|---|---|---|
| 1 | **file create** | `fswatch` | postinstall.log written; default no `.warmup-state.json`; opt-in writes it | none | inside `verify-real-install-30s.sh` (Phase 1) |
| 2 | **file read** | `fs_usage` | postinstall reads `dist/seed/rules.jsonl` + `dist/bin.js` + `release-meta.json`; default does NOT open `@xenova` | **sudo** | `verify-fs-usage.sh` (Phase 2 wrap) |
| 3 | **hook called** | `claudefast -p --output-format stream-json --debug hooks` | SessionStart hook fires after install in any project; PreToolUse fires for Read | none (claudefast on PATH) | `verify-runtime-hooks.sh` (Phase 2) |
| 4 | **statusline rendered** | `tmux capture-pane` | teamagent-statusline.cjs output appears in pane scrollback | none (tmux session) | `verify-statusline.sh` (Phase 2) |
| 5 | **lifecycle** | `/usr/bin/time -p`, `ps`, exit | wall-clock ≤30s; exit 0; opt-in detached pid alive | none | inside `verify-real-install-30s.sh` (Phase 1) |
| 6 | **content** | `sqlite3` / `jq` | `knowledge.db` post-`teamagent init` has `knowledge` table; `.warmup-state.json` schema valid (or absent) | none | `verify-db-content.sh` (Phase 2) |
| 7 | **network** | npm cache size diff | default install delta < 20 MB; opt-in delta > 50 MB | none | inside `verify-real-install-30s.sh` (Phase 1) |
| 8 | **negative existence** | `[ ! -d ... ]` | `<prefix>/lib/node_modules/@xenova` absent default; warmup-state.json absent default | none | `verify-negative-existence.sh` (Phase 2) |

---

## Step 1 — collect raw evidence (single command)

The master orchestrator does it all. From the worktree root:

```bash
bash scripts/verify-all-channels.sh
```

Behavior:

1. **Pre-flight**: checks every required tool. Missing one → exit 1.
2. **Sudo pause**: runs `sudo -v` (interactive prompt for password if not cached). Spawns a background keeper that runs `sudo -n true` every 50s to keep credentials alive across the run.
3. **Phase 1**: invokes `verify-real-install-30s.sh` for the 3-run install timing + fswatch + cache diff (covers channels #1, #5, #7, plus channel #8 partial).
4. **Phase 2**: persistent install for runtime checks:
   - allocates a stable `prefix / cache / home / project` so we can do post-install verifications against a real installed teamagent;
   - starts `verify-fs-usage.sh` in the background (channel #2);
   - runs `npm install -g <tarball>` (default path, no opt-in);
   - kills `fs_usage`;
   - runs `verify-negative-existence.sh` (channel #8);
   - puts the installed `teamagent` on `PATH`;
   - runs `teamagent init` inside a fresh project dir;
   - runs `verify-db-content.sh` (channel #6);
   - runs `verify-runtime-hooks.sh` (channel #3);
   - runs `verify-statusline.sh` (channel #4).
5. **Manifest**: writes `.judge/<RUN_ID>/master-manifest.json` listing where every channel's evidence ended up.
6. **Cleanup**: removes Phase-2 tmp dirs unless `KEEP_DIRS=1`.

Run with custom RUN_ID: `RUN_ID=mine bash scripts/verify-all-channels.sh`. Keep tmp dirs for debugging: `KEEP_DIRS=1 bash scripts/verify-all-channels.sh`.

For the **opt-in path** (vector matcher), use `release/install.sh` directly with `TEAMAGENT_INCLUDE_OPTIONAL=1`; orchestrator-driven opt-in run is a follow-up (not in scope of the default v1 PASS gate).

---

## Step 2 — dispatch 8 parallel LLM judges (max 8, per FASTPROBE)

The MAIN agent issues these as 8 parallel `claudefast -p` calls in a single message (or as 8 parallel `Agent` subagent calls). **No probe sees this playbook, the source, or another probe's verdict.** Each gets only its own raw evidence subset + a strict task description + JSON output schema.

> All probe prompts below take `RUN_ID` from the orchestrator. Replace `${RUN_ID}` literally before dispatch.

### Probe A — wall-clock (channel #5)

Input: `.judge/${RUN_ID}/01-skip.json`, `02-detached.json`, plus `master-manifest.json` for the Phase-2 install.

```text
You are an install-fix judge.
Read .judge/${RUN_ID}/01-skip.json, 02-detached.json, master-manifest.json.
PASS iff:
  1. wallclock_s of 01-skip and 02-detached are both numeric AND ≤ 30.
  2. install_default.wallclock_s in master-manifest.json is numeric AND ≤ 30.
  3. exit_code in all three is 0.
Output JSON: {"pass":bool,"wallclock_skip":num,"wallclock_detached":num,"wallclock_master":num,"reasons":[str]}.
```

### Probe B — banner + opt-in hint (channel #1 partial via stdout, channel docs)

Input: `.judge/${RUN_ID}/evidence/02-detached.out` (postinstall stdout from Phase 1) and `p2-install.out` (Phase 2 install stdout).

```text
You are an install-fix judge.
Read .judge/${RUN_ID}/evidence/02-detached.out and p2-install.out.
PASS iff at least one of these files contains BOTH of:
  1. "语义匹配: 未安装" (stdout banner) OR "vector deps 未安装" (stderr from postinstall.mjs).
  2. anchor "TEAMAGENT_INCLUDE_OPTIONAL=1".
Output JSON: {"pass":bool,"banner_anchor":bool,"optin_hint":bool,"source_file":str,"reasons":[str]}.
```

### Probe C — fswatch creation events (channel #1)

Input: `.judge/${RUN_ID}/evidence/{01-skip,02-detached}.fswatch.log`.

```text
You are an install-fix judge.
Read .judge/${RUN_ID}/evidence/01-skip.fswatch.log and 02-detached.fswatch.log
(NUL-separated; each record: timestamp event-flags path).
PASS iff:
  1. ZERO records show a Created event for paths matching "@xenova/transformers" or "onnxruntime-node" in either file.
  2. At least one record shows a Created or Updated event for ".teamagent/" or "/lib/node_modules/teamagent" — proving the install actually happened.
Output JSON: {"pass":bool,"xenova_created_count":int,"onnx_created_count":int,"teamagent_touched":bool,"reasons":[str]}.
```

### Probe D — fs_usage read events (channel #2)

Input: `.judge/${RUN_ID}/evidence/fs_usage.log`.

```text
You are an install-fix judge.
Read .judge/${RUN_ID}/evidence/fs_usage.log (macOS fs_usage line format).

NOTE: postinstall.mjs and init.ts intentionally call `fs.existsSync` on
`@xenova/transformers/package.json` to detect whether vector deps were
installed (the vectorOptionalsInstalled probe). That generates `lstat64`
or `stat64` syscalls hitting `@xenova` paths — that is EXPECTED and must
not count as a fail. Only `open` syscalls (actual file reads) indicate
the optional dep was installed and loaded.

PASS iff:
  1. ≥ 1 line whose syscall column is `open`, `READ`, or `RdData[A]`
     and whose path contains "teamagent" (proves install ran).
  2. ZERO lines whose syscall column is `open`, `READ`, or `RdData[A]`
     (NOT counting lstat64/stat64) AND whose path contains
     "@xenova/transformers" or "onnxruntime-node".
     A small number of `lstat64`/`stat64` hits on `@xenova` is EXPECTED
     and PASSES (existence-check probe; up to ~10 acceptable).

Output JSON: {"pass":bool,"teamagent_read_count":int,"xenova_open_count":int,"onnx_open_count":int,"xenova_lstat_count":int,"reasons":[str]}.
If the log is empty, return {"pass":false,"reasons":["fs_usage log empty — sudo or SIP issue; investigate"]}.
```

### Probe E — runtime hook invocation (channel #3)

Input: `.judge/${RUN_ID}/evidence/{streamjson.log,hooks.debug.log,hooks-exit-code.txt}`.

```text
You are an install-fix judge.
Read .judge/${RUN_ID}/evidence/streamjson.log, hooks.debug.log, hooks-exit-code.txt.
PASS iff:
  1. hooks-exit-code.txt is the integer 0.
  2. hooks.debug.log contains at least one entry that mentions "SessionStart" OR "PreToolUse" OR "hook_call".
  3. streamjson.log contains valid stream-json events (lines starting with `{` and including a "type" field).
Output JSON: {"pass":bool,"exit_code":int,"sessionstart_or_pretooluse_seen":bool,"streamjson_lines":int,"reasons":[str]}.
```

### Probe F — statusline rendered (channel #4)

Input: `.judge/${RUN_ID}/evidence/tmux-statusline.snapshot`.

```text
You are an install-fix judge.
Read .judge/${RUN_ID}/evidence/tmux-statusline.snapshot.
PASS iff:
  1. Snapshot file is non-empty (size > 0).
  2. Contains a recognizable Claude Code or teamagent UI anchor — any of:
     "claude", "Claude Code", "rules", "ta:", "teamagent", a digit-only count.
Output JSON: {"pass":bool,"non_empty":bool,"anchor_found":bool,"snippet":str,"reasons":[str]}.
```

### Probe G — DB & state-file content (channel #6)

Input: `.judge/${RUN_ID}/evidence/{db-tables.txt,db-rule-count.txt,warmup-state.kv}`.

```text
You are an install-fix judge.
Read .judge/${RUN_ID}/evidence/db-tables.txt, db-rule-count.txt, warmup-state.kv.
PASS iff:
  1. db-tables.txt contains the substring "knowledge" (the knowledge table created by teamagent init; SqliteKnowledgeStore is the schema owner).
  2. db-rule-count.txt is a non-negative integer string (a "0" is acceptable on first init before seed; non-zero is preferred).
  3. warmup-state.kv either is the literal "(absent)" (default install — vector deps absent so init wrote no state file) OR contains both "status=" and "model=" keys.
Output JSON: {"pass":bool,"db_tables":[str],"rule_count":int,"warmup_state_keys":[str],"reasons":[str]}.
```

### Probe H — negative existence + cache delta (channels #7, #8)

Input: `.judge/${RUN_ID}/evidence/{neg-no-xenova,neg-no-onnx,neg-no-state,*.cache-pre.size,*.cache-post.size}`.

```text
You are an install-fix judge.
Read .judge/${RUN_ID}/evidence/neg-no-xenova, neg-no-onnx, neg-no-state, and the
*.cache-pre.size / *.cache-post.size files (kB integers).
PASS iff:
  1. Each neg-* file starts with "PASS " (not "FAIL ").
  2. For each (label).cache-pre.size / (label).cache-post.size pair, the delta
     (post − pre) in kB is < 30000 — i.e. less than ~30 MB downloaded — proving
     no @xenova / onnxruntime fetch happened. (Default install of teamagent +
     9 transitive deps is ~19 MB; threshold 30 MB leaves headroom for fswatch
     overhead and minor cache variance. Opt-in path delta is > 50 MB so the
     two paths remain distinguishable.)
Output JSON: {"pass":bool,"negatives":{"xenova":str,"onnx":str,"state":str},"cache_deltas_kb":[num],"reasons":[str]}.
```

---

## Step 3 — synthesize

The MAIN agent reads all 8 probe JSONs and computes:

```
final_pass = ProbeA.pass
         AND ProbeB.pass
         AND ProbeC.pass
         AND ProbeD.pass
         AND ProbeE.pass
         AND ProbeF.pass
         AND ProbeG.pass
         AND ProbeH.pass
```

Synthesis is appended to `report.md` under `## Judge result <run_id>` with the raw probe JSONs inlined. **Any false ⇒ block PR merge until investigated.**

---

## Step 4 — opt-in path (separate run, separate gate)

The opt-in path (`TEAMAGENT_INCLUDE_OPTIONAL=1`) has different acceptance:

- Wall-clock NOT bounded (≥ 30s acceptable; documented opt-in cost).
- `~/.teamagent/.warmup-state.json` MUST exist with `status="downloading"`.
- `<prefix>/lib/node_modules/@xenova/transformers/package.json` MUST exist.
- Cache delta MUST be > 50 MB (kB > 50000).

To run: invoke `release/install.sh` directly with `TEAMAGENT_INCLUDE_OPTIONAL=1` against a tmp prefix, then dispatch a custom Probe I (analogous to Probes C/D/H but with positive existence). Out of scope for the v1 PASS gate; tracked as follow-up.

---

## Step 5 — re-arm on regression (CI hook)

Add to CI (or a local `pnpm verify-install` script):

```bash
RUN_ID=ci-$(git rev-parse --short HEAD) bash scripts/verify-all-channels.sh
# ... then dispatch Step 2 probes A–H ...
# ... synthesize per Step 3 ...
# Exit non-zero on final_pass=false.
```

Each commit on `worktree-fix-install` (or any future install-related branch) must run this before merge.

---

## Stop conditions (when to halt and re-investigate)

| symptom | likely cause | next step |
|---|---|---|
| Probe A wall-clock > 30s | a heavy dep was re-added to `package.json` | grep `package.json` for `onnx`/`xenova` |
| Probe B fails (banner missing) | postinstall.mjs banner regressed | inspect `postinstall.mjs` Stage 2 banner branches |
| Probe C: @xenova Created event | optionalDependencies regressed OR npm version changed behavior | check `npm --version`, re-run `--include` test |
| Probe D fs_usage log empty | sudo issue OR SIP blocking dtrace | re-run `sudo -v`; check `csrutil status` |
| Probe D: @xenova read events | source code path regressed | grep for `require.*xenova` |
| Probe E: hooks-exit-code != 0 | `teamagent init` failed to wire hooks | inspect `~/.claude/settings.json` post-init |
| Probe E: no SessionStart/PreToolUse | hook scripts not registered or claudefast bypass | re-check `init.ts` hook registration logic |
| Probe F snapshot empty | tmux session died before capture; claudefast crashed at startup | inspect tmux server, increase WAIT_SECS |
| Probe G rule_count == 0 AND db-tables doesn't contain "knowledge" | seed loader regressed | check `init.ts` `doLoadSeed` step |
| Probe H neg-* file says FAIL | npm pulled a forbidden dep | inspect `<prefix>/lib/node_modules/` directly |

When any stop condition fires, the MAIN agent halts, dumps the full evidence path to the user, and does NOT proceed to PR merge.

---

## Limitations (acknowledged, not skipped)

| limitation | mitigation |
|---|---|
| `fs_usage` is macOS-only; Linux needs `strace` or `inotifywait` | document Linux path in a follow-up; current harness fails loud rather than degrade |
| Real `npm install -g` requires network for first-run; CI must permit npm registry access | offline CI is out of scope |
| Channel #4 (tmux statusline) requires interactive PTY-capable env; headless CI without `tmux` server fails the harness | install `tmux` even on CI runners; alternative is to emulate a PTY (not done) |
| `tmux capture-pane` snapshot may include ANSI escapes that confuse Probe F's anchor grep | Probe prompt explicitly accepts a wide set of anchors (`claude`, `rules`, etc.) |
| Concurrent runs of the harness may collide on `~/.teamagent` if `HOME` not isolated | each run uses tmp `HOME` dir; verified safe |
| If `npm` cache has a pre-existing copy of teamagent's deps, cache delta probe (H) may understate downloads | use `--cache=$tmp` per run to force fresh cache (orchestrator already does) |
