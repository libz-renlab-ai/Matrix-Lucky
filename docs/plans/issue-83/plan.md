```text
   ┌──────────────────────────────────────────────────────────────┐
   │   plan.md — issue #83                                        │
   │   "team-scope session recording + gbrain index"              │
   │   (refresh of issue title "group video recording")           │
   │                                                              │
   │   ① plan         ② expected outputs                          │
   │   ③ judge harness ④ claudefast probes                        │
   └────────────────────┬─────────────────────────────────────────┘
                        │
   ┌────────────────────┼────────────────────┐
   │                    │                    │
   v1 scope:          gbrain native        privacy:
   terminal           tools used:          transcript-level
   asciinema-style    file_upload          M5 secret scanner
   recording          add_timeline_entry   reused
   (NOT screen/OBS,   put_page (chunks)    (frame-level OUT
    NOT browser)      query (search)        OF SCOPE for v1)
   │                    │                    │
   └────────────────────┴────────────────────┘
                        ▼
   teamagent record-session → asciinema → transcript
       → redact → file_upload + page chunks + timeline
       → query "上次 fly.io 部署失败" → timestamped link back
                        ▼
   judge.md MD playbook: PoC single-user → multi-subject team
                        ▼
                  open normal PR
                        ▼
                 POSTPR loop until 👍
```

---

## CHANGELOG

- **v1 (2026-05-08)** — 初版 plan，配合 ADR-0006 close issue #83。Reframe "group video" → "team-scope session recording" 对齐 CONTEXT.md。

---

# Plan — issue #83：team-scope session recording + gbrain index

- **Issue:** [#83](https://github.com/libz-renlab-ai/TeamBrain/issues/83) (`enhancement`)
- **Branch:** `worktree-clean-issues` (this docs-only PR); follow-up impl PR 自起分支
- **Owner:** unassigned
- **Date:** 2026-05-08
- **Reference:**
  - `docs/CONTEXT.md`（canonical 术语仲裁）
  - `docs/HOWTO-PLAN-PR.md`
  - `docs/superpowers/specs/2026-04-15-phase2-design-v2.md`（Phase 2 design v2；非 `-v2` 版本只在 `docs/backup/phase2-superseded/` 归档）
  - `~/.gbrain/config.json`（gbrain 已 setup 状态，参考 CLAUDE.md GBrain Configuration 节）
  - 现有 gbrain MCP tools（`file_upload`、`file_list`、`file_url`、`put_page`、`add_timeline_entry`、`get_timeline`、`query`、`search`、`put_raw_data`、`get_raw_data`）
  - `packages/core/src/m5/secret-scanner.ts`（transcript 脱敏复用）
  - ADR-0006

## Glossary mapping — issue 用语 → CONTEXT.md canonical

`docs/CONTEXT.md` 的 _Avoid_ 列表覆盖 "group / shared / cross-user"。本 plan 正文一律用 canonical：

| Issue 用语 | Canonical | 物理对应 |
|---|---|---|
| group video recording | **team-scope session recording** | session video + transcript 文件，通过 gbrain `file_upload` 存储 |
| group brain | **team scope** in gbrain | gbrain federated source 中绑到当前项目 git remote 的子集（`<cwd>/.teamagent/` 同 team_id） |
| group 模式 | **team-scope mode** | gbrain page tag `team_id=<sha256-of-remote>` |
| 同事看到对方录像 | **team-scope playback** | 同 `team_id` 下 page query 命中 |
| 录像里有 secret 怎么办（asciinema 文本流） | **transcript-level redaction**（v1）；scanner 命中 → ingest gate 直接 seal_in_L1，**不上传 gbrain**；因此**已上传到 gbrain 的 cast 文件不应含 secret 字面**（与 M5 双闸门同等强度） | M5 secret scanner 复用，覆盖 cast 文本流全部内容 |
| 录像里有 secret 怎么办（v2 屏幕像素） | **frame-level visual redaction**（OUT OF SCOPE for v1） | v1 不录屏幕，画面像素脱敏问题不存在；v2 录屏幕时再设计 |

## ① Plan — task description

### 做什么

为 TeamBrain 团队提供 **基于终端 session 的录制 + gbrain 索引** 能力，用作归因证据：

- **录制**：默认录终端 CC session（asciinema 流式 cast）。**v1 不录屏幕、不录浏览器、不录 OBS-style 桌面录像。**
- **索引**：录制完成后自动 (a) 转 transcript（asciinema 自带 `cast.events` 时间戳）→ (b) 跑 transcript-level 脱敏（M5 secret scanner 复用）→ (c) `mcp__gbrain__file_upload` 落 cast 原文件 → (d) `mcp__gbrain__put_page` 写一篇 page，frontmatter 含 `team_id` / `session_id` / `user` / `started_at` / `ended_at` / `attribution_link_to_rule_id?` → (e) `mcp__gbrain__add_timeline_entry` 给 page 加章节级 timeline（按"用户开口"切段，每段含 ≤ 60 秒摘要）→ (f) page 自动 chunk + embed（gbrain 内建）。
- **查询**：用户跑 `gbrain query "上次 fly.io 部署失败的视频"` → 返回 ≥1 条命中，含 timestamped clip URL（指 cast 文件 + offset），点开能 replay 该段。
- **Team 维度**：同 `team_id` 下 ≥2 同事的录像在同一个 gbrain 命名空间里都可被对方查到。**不**做跨 `team_id`（跨项目）共享。
- **隐私**：M5 hard secret scanner 复用，覆盖 asciinema cast 的**全部文本流内容**（transcript + ingest gate）。Scanner 命中 → 整 session seal_in_L1、**不上传 gbrain**（与 M5 双闸门同等强度）。因此 v1 路径下**已上传到 gbrain 的 cast 文件不应含 secret 字面**——任何 leak 视为 scanner 漏检 bug，judge 步骤 4 直接 fail。Frame-level（屏幕录像的画面像素）脱敏 OUT OF SCOPE for v1，**因为 v1 不录屏幕**；v2 引入屏幕录像时再设计。

### 怎么做

1. **录制器** `packages/cli/src/commands/record-session.ts`（**不**用 `record.ts`：`packages/cli/src/commands/recording.ts` 已存在用于 recording-memory CLI，命名空间冲突，故本子命令的源文件叫 `record-session.ts`，CLI 入口为 `teamagent record-session`，以与 `teamagent recording …` 子树明确区分）：
   - 实现 `teamagent record-session` 子命令，wrap `asciinema rec` 落 `.teamagent/recordings/<session-id>.cast`。
   - 录制结束后自动调用下面的 ingest pipeline（步骤 2）。
2. **Ingest pipeline** `packages/core/src/m5/recording-ingest.ts`（**不**用 `<m5-shell>` 占位——M5 shell 不是已有 package；与 M5 secret-scanner 等核心纯函数 colocated 在 `packages/core/src/m5/` 即可，符合 Functional Core / Imperative Shell 元约束。Side-effectful 部分（asciinema spawn、网络上传 gbrain）拆到 `packages/cli/src/commands/record-session.ts` 与 `packages/adapters/src/m5/recording-uploader.ts`）：
   - 解析 cast 文件（asciinema v2 **或** v3 schema，detect by `version` 字段）→ 提取 transcript（按时间戳）。
   - 跑 M5 hard secret scanner 在 transcript 上；命中即整 session 标 `sealed_in_L1`，**不上传 gbrain**（与 M5 双闸门同等强度）。
   - 通过则跑 scope classifier；非 team scope 也不上传。
   - team scope → 上传：`file_upload`（cast）+ `put_page`（transcript markdown）+ `add_timeline_entry`（章节级摘要）。
   - 失败降级：任一步失败不影响录制本身，但 emit AttributionBus event `recording_ingest_failed`，banner 告警。
3. **Attribution link** （可选 v1）：
   - 若录制期间 PreToolUse 拦截到 team-scope rule，AttributionBus event 含 `recording_session_id`，让 follow-up reader 能 jump 到对应 cast offset。
   - 这条 link 的反向：page frontmatter 含 `attribution_link_to_rule_id`，`gbrain query` 返回时显示。
4. **Search UX**：用户已有 `mcp__gbrain__query` / `search` 工具，本 plan **不**新增 search CLI；只确保 page chunks + transcript embed 后能被 hybrid search 命中。
5. **Team-scope 边界**：`team_id` 与 #82 plan 一致 = `SHA256(normalize(git remote))[:16]`，写到 page tag。同 team_id 的所有 gbrain pages 形成 team-scope playback 集合。
6. **依赖把关**：本 plan 落地 = close issue #83。Follow-up impl PR **必须** 在 #82 follow-up impl PR（team-scope viral sync teaching e2e）走通后启动——否则 attribution chain 链路上 source_commit_sha 等字段未稳定，page frontmatter 会缺。

### 不做什么

- **不** 录屏幕 / OBS-style 桌面录制 / browser screen recording（gstack `/browse`）—— v1 只录终端。screen recording 留 v2。
- **不** 跨 `team_id`（跨项目）共享。team scope 严格按 git remote 边界，与 #82 一致。
- **不** 实现自定义 video player UI——`mcp__gbrain__file_url` 返回的 URL 由用户 OS 默认 player 打开（`asciinema play <url>` 或浏览器 asciinema-player）。
- **不** 实现 frame-level 视频画面脱敏——**v1 不录屏幕**，画面脱敏问题不存在；屏幕录像 + frame-level 脱敏一并由 v2 处理。Asciinema cast 的文本流不属于 frame-level 范畴，由 M5 secret scanner 全覆盖。
- **不** 自建中央 video 服务器。gbrain 自带 file storage 已够。
- **不** 实现 cross-machine real-time co-watch / live streaming。录制是 batch 上传 + 异步检索。
- **不** 写 `docs/specs/2026-05-XX-group-video-recording.md`（issue body 提到）—— canonical spec 路径是 `docs/specs/2026-05-XX-team-scope-session-recording.md`，由 follow-up impl PR 写。本 plan 不在 docs-only PR 里写 spec。

### 已知 spec 缺口（必须在 follow-up impl PR 开工前明确）

- gbrain 当前**没有**专属 "video API"——本 plan 计划复用 `file_upload` + `put_page` + `add_timeline_entry` + `query` 四个现有 MCP tool。这套组合**未在 gbrain 项目层面被官方定为 "video ingest pattern"**；如 gbrain 后续推出专用 video pattern，follow-up impl PR 切换。
- asciinema 版本 / cast schema：本 plan **同时支持 v2 与 v3**（dev 机当前装的是 asciinema 3.2.0 默认输出 `asciicast-v3`，v2 仍是 CI runner 上常见版本）。Ingest pipeline 通过 cast 文件顶部 JSON 的 `version` 字段切分支处理；任何后续不兼容 schema 改动单独建 issue。
- `team_id` 与 #82 共享算法；如 #82 follow-up impl 阶段调整 team_id schema，本 plan 同步调。

## ② Expected outputs — reviewer-checkable artifacts

| Artifact | Path | Reviewer 验收点 |
|---|---|---|
| 录制器 CLI | `packages/cli/src/commands/record-session.ts`（与现有 `recording.ts` 区分命名） | `teamagent record-session --help` 列出子命令；wrap asciinema 落 cast 文件 |
| Ingest pipeline | `packages/core/src/m5/recording-ingest.ts`（pure，纯函数）+ `packages/adapters/src/m5/recording-uploader.ts`（IO） | 解析 cast → 脱敏 → 上传 gbrain；失败降级；契约测试覆盖 |
| **team_id 共享 helper** | `packages/core/src/m5/team-id.ts`（**新建**——从 `packages/cli/src/commands/m5-sync.ts:95` 现有 `computeTeamId` 提炼） | 两个 call site（`m5-sync.ts` 与 `recording-ingest.ts`）都从此 helper import；不再各自重写算法；judge step 6 (judge.md:193-201) 强制核对 |
| Page schema | `packages/core/src/recording/page-schema.ts` | frontmatter 含 `team_id` / `session_id` / `user` / `started_at` / `ended_at` / `attribution_link_to_rule_id?`；序列化 round-trip 测试 |
| Spec 文档 | `docs/specs/<DATE>-team-scope-session-recording.md` | 6 个原 issue 设计问题逐题回答；canonical 命名；frame-level 脱敏 OUT OF SCOPE 标注 |
| PoC evidence | `docs/plans/issue-83/poc-evidence/<run-id>/{cast,transcript.md,page.md,timeline.json,query-result.json,banner.txt}` | 5–10 min 真实 CC session 录制 + gbrain ingest + query 命中 |
| Multi-subject evidence | `docs/plans/issue-83/multi-subject-evidence/<run-id>/{subject-A,subject-B}/{cast,...}` | ≥2 用户在同一 team_id 下录制，对方能 query 命中 |
| Redaction proof | `docs/plans/issue-83/redaction-proof/{token-test.cast, redacted-transcript.md, page-content.md}` | 含合成 token 的 cast 跑过 ingest 后，transcript / page 中 token 全部 `[redacted]` |
| Product features 增量 | `docs/PRODUCT-FEATURES.md` 增 1 行 VERIFIED `team-scope-session-recording-v1` | 状态 VERIFIED；指针回 record CLI |

## ③ How-to-verify — third-party judge harness

Judge harness 是 **MD playbook**：`docs/plans/issue-83/judge.md`（与本 plan 同提交）。Main agent 调度 sub-agents + `claudefast -p`。

Playbook 7 步：

1. **Glossary lint**：与 #82 同款逻辑（仅 prose 命中即 fail；ASCII art / backtick / quoted issue title / `## Glossary mapping` / 风险表 meta row 白名单）。
2. **PoC ingest**：sub-agent 跑 `teamagent record-session` 录制一段 5–10 min 合成 CC session（含 ≥3 个能命中 team-scope rule 的 prompt）→ 自动 ingest → gbrain query 命中。emit `{cast_file, transcript_file, page_id, timeline_entries_count, query_top_result_id, query_top_score}`。pass 条件：query 返回的 top result page_id 与刚 ingest 的一致，score > 0.5。
3. **Multi-subject e2e**：sub-agent 模拟 2 个临时 user（不同 git author）在同一 team_id 下各录一段 → 各自 ingest → cross-query。emit `{subject_a_query_top_subject_b_id, subject_b_query_top_subject_a_id}`。pass 条件：双向 query 各自命中对方录像。
4. **Redaction integrity**：sub-agent 用合成 cast（含 fake `sk-...` 长 token / fake `aws_access_key_id=...` 行 / fake `/Users/foobar/...` 路径）跑 ingest，读 page content + transcript markdown + cast 上传副本，grep redact regex 全表。emit `{token_leak_count, path_leak_count, key_leak_count}`。pass 条件：所有 leak count == 0。
5. **Attribution link**：sub-agent 让 PoC session 在录制中触发 1 条 team-scope rule 命中 → 检查 AttributionBus event 含 `recording_session_id` + 该 page frontmatter 含 `attribution_link_to_rule_id`。emit `{event_has_session_id, page_has_rule_id, link_resolves}`。pass 条件：三项均 true。
6. **Dependency on #82**：sub-agent 检查仓库 `team_id` 算法是否与 #82 follow-up impl 一致（grep `m5-sync.ts` vs `recording-ingest.ts` 的 team_id 计算）。emit `{teamid_algorithms_match}`。pass 条件：true。
7. **Aggregate verdict**：main agent 汇总 1–6 步 raw JSON，写 `verdict.json`。LLM judge 只读 verdict + raw 决定 release。

Judge harness **不**评：

- 录像内容是否"有教学价值"——这是产品判断。
- 用户对 asciinema 选型的偏好（vs OBS / screencapture）—— v1 锁 asciinema，是 plan 决定，不是 judge 范围。
- gbrain 自身的 search relevance 算法——gbrain 项目层面已 ship；本 plan 信任其 query 行为。
- 视频画面 frame-level 脱敏——v1 显式 OUT OF SCOPE。

## ④ Claudefast probes — BEFORE follow-up impl PR

1. **Probe-1：gbrain MCP tools 现状**（`claudefast -p`）
   - 输入：当前 gbrain MCP tool list。
   - 验证：`file_upload`、`put_page`、`add_timeline_entry`、`query`、`search` 五个 tool 在当前 gbrain 安装里都可调用。
   - 通过条件：probe 输出 `tools_available_count == 5`。
2. **Probe-2：asciinema 装机存在性 + 版本分支检测**（`claudefast -p`）
   - 验证：`which asciinema` 在目标机器上 exit 0；major 版本 ∈ {2, 3}；ingest pipeline 在合成 cast fixture（一份 v2 + 一份 v3）上都能解析。
   - 通过条件：probe 输出 `asciinema_major in [2,3]` 且 `parse_v2_ok=true` 且 `parse_v3_ok=true`。
3. **Probe-3：M5 secret scanner 可复用**（`claudefast -p`）
   - 输入：合成 transcript 文本含 fake token + path + email + AWS key。
   - 验证：`packages/core/src/m5/secret-scanner.ts` 可独立调用并返回脱敏后字符串。
   - 通过条件：probe 输出 `secrets_redacted_count >= 4`。
4. **Probe-4：team_id 一致性**（`claudefast -p`）
   - 输入：`packages/core/src/m5/m5-sync.ts` 的 team_id 计算逻辑 + 本 plan 描述的 page tag schema。
   - 验证：两边都用 `SHA256(normalize(git remote))[:16]`。
   - 通过条件：probe 输出 `algorithms_match == true`。

最多 8 个 `-p` 并行，stream-json 留 audit。详 `docs/FASTPROBE.md`。

## After-PR — POSTPR loop

1. POSTPR loop 直到 Codex silent / 👍。
2. Issue #83 close with cite-back comment（ADR-0006）：plan 路径 + PR 链接 + 一句 "ready for impl PR pending #82 follow-up impl PR shipping team-scope viral sync teaching e2e; canonical naming per CONTEXT.md is team-scope session recording, mapped to issue title 'group video recording' inside Glossary section; v1 covers asciinema text stream end-to-end via M5 secret scanner (any leak = fail); frame-level visual redaction OUT OF SCOPE for v1 because v1 does not record the screen"。
3. Follow-up impl PR 反向引用本 plan；不重开 #83。

## 风险与回滚

| 风险 | 缓解 | 回滚动作 |
|---|---|---|
| gbrain 后续推出专用 video API、本 plan 的 file_upload+page 组合被 deprecate | 本 plan 显式锁定 v1 接口；spec 缺口节点列出；follow-up impl PR 启动前 Probe-1 复核 | 切换到 gbrain 官方 video API；plan 不重写，由 follow-up PR 描述 deprecation |
| Asciinema cast 文本流泄露（scanner 漏检） | judge 步骤 4 强制 fail；scanner regex 表必须随 M5 同步更新；v1 路径下不允许"warning + 人手复检" | 发现泄露 → 立即从 gbrain `file_list` 删除 cast + revoke token + scanner regex 表补 + BUGREPORT；视为 scanner bug |
| Frame-level 屏幕像素泄露（v2 议题） | v1 不录屏幕，问题不存在；v2 引入屏幕录像时单独设计 | 不适用（v1） |
| 录制 / ingest 体积大、CI 上跑不动 | PoC evidence 限制 5–10 min；judge step 2 用合成短录像 | CI 不跑 long-form ingest；本地 dev 跑长录像；CI 只跑契约测试 |
| asciinema cast schema 不兼容变更（如 v3.x → v4） | 本 plan 同时支持 v2 与 v3；任何后续不兼容 schema 由独立 issue 处理 | follow-up impl PR 启动时 Probe-2 双 fixture 复核 |
| #82 follow-up impl 长期未启动 | 本 plan 显式依赖 #82；judge step 6 拦底 | #83 follow-up impl PR hold；本 plan 不重开 |
| Issue #82 调整 team_id 算法 | 同步更新本 plan team_id 说明 | follow-up impl PR 启动时 grep 两侧实现，差异 → 修一侧 |

## Quick checklist (PR 描述粘贴)

- [ ] 全文（除 Glossary 节）零 `group video` / `group brain` / `cross-user` / `federated` 字样
- [ ] `teamagent record-session` CLI 跑通，落 cast 文件
- [ ] Ingest pipeline 把 cast → transcript → page + timeline + file_upload 全部完成
- [ ] PoC evidence ≥1 份 5–10 min session 录制；query 命中
- [ ] Multi-subject evidence 含 ≥2 user 同 team_id 双向 query 命中
- [ ] Redaction proof 含合成 token 测试，脱敏完整
- [ ] AttributionBus event 含 `recording_session_id`，page frontmatter 含 `attribution_link_to_rule_id`
- [ ] team_id 算法与 #82 一致（grep 两侧实现）
- [ ] follow-up impl PR 启动前 #82 follow-up impl PR 已 ship
- [ ] `docs/PRODUCT-FEATURES.md` 增 1 行 VERIFIED `team-scope-session-recording-v1`
