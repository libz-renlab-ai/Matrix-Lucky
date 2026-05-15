# TeamAgent Docs/Trust Page

## Page Intent

TeamAgent 的 trust 页面不是安全营销页，而是可审计的规则档案页。它要回答三个问题：

- 规则从哪里来？
- TeamAgent 在运行时到底保存什么、不保存什么？
- 新成员接手时，怎样继承团队 agent 的经验，而不是继承一堆黑箱政策？

Primary copy:

> 老员工的 Claude Code 犯过的错，新来的员工的 Claude Code 不再犯。TeamAgent 把一次踩坑转成可追溯、可验证、可交接的团队规则。

## Page Sections

| Section | Purpose | Primary UI / Copy |
|---|---|---|
| 1. Trust Header | 建立页面定位：规则可追溯，证据可检查 | `Trust Center` / `规则不是凭空生成的。每条规则都有来源、版本、证据和运行时边界。` |
| 2. Rule Lineage | 展示 mistake -> rule -> runtime enforcement | 垂直时间线：`Captured` -> `Compiled` -> `Published` -> `Loaded` -> `Verified` |
| 3. Privacy Boundary | 明确数据边界，降低员工监控感 | 左侧 `Inside TeamAgent`，右侧 `Outside TeamAgent`，中间边界线 |
| 4. What We Store | 用清单解释保存的最小必要证据 | `Rule metadata`, `source reference`, `confidence/tier`, `compiled output`, `judge evidence pointer` |
| 5. What We Do Not Store | 直接说不保存什么 | `No raw secrets`, `No full private terminal stream by default`, `No employee productivity scoring`, `No hidden policy generation` |
| 6. Handoff Story | 用接力棒说明新成员如何继承经验 | Before/after case：新人 agent 命中旧规则，避免重复踩坑 |
| 7. Example Rule Detail | 给一条具体规则的可审计展开页 | rule id、来源片段、变更历史、runtime behavior、verification |
| 8. Acceptance Criteria | 说明页面自身如何验收 | 可读性、可追溯、隐私边界、UI 元件、文案完整性 |

## Rule Lineage

Use a source-first timeline. The page should make the transformation visible:

```text
mistake -> capture -> compile rule -> enforce at runtime -> verify -> no repeat
```

Suggested timeline copy:

1. **Captured / 记录**  
   一次真实失败被记录为 evidence：触发场景、错误行为、用户反馈或 judge 输出。

2. **Compiled / 编译**  
   TeamAgent 把 evidence 编译成结构化规则：触发条件、正确行为、禁止行为、置信度和适用范围。

3. **Published / 发布**  
   规则进入团队可读档案，例如 `AGENTS.md`、`CLAUDE.md` 或 docs 中的规则索引。

4. **Loaded / 加载**  
   新的 Claude Code、Codex 或 agent session 在启动时读取规则，不需要重新经历同一个错误。

5. **Verified / 验证**  
   第三方 judge harness 运行固定工具，保存 JSON 与原始证据；LLM 只读取 raw judge output 做归纳结论。

## Privacy Boundary

Privacy copy:

> TeamAgent 记录的是团队想保留下来的 agent 行为规则，不是员工监控系统。默认目标是保存可复用的工程经验，而不是保存完整的人类工作轨迹。

Boundary diagram:

```text
Inside TeamAgent                         Outside TeamAgent
────────────────                         ─────────────────
rule id                                  raw credentials
source reference                         personal productivity scoring
sanitized evidence pointer               full private terminal stream by default
confidence and tier history              hidden policy generation
compiled rule output                     unmanaged screenshots or recordings
judge result JSON path                   unrelated personal files
```

UI labels:

- `Data Boundary`
- `Stored with purpose`
- `Not collected by default`
- `Inspectable by team`
- `No hidden policy`

## What We Store

TeamAgent should present storage as purpose-bound and inspectable:

- **Rule metadata**: rule id, title, type, owner/source, status, confidence, tier.
- **Source reference**: transcript id, PR link, issue link, judge run id, or manual note.
- **Sanitized evidence pointer**: path or link to evidence bundle after secrets are removed.
- **Compiled output**: the exact text or structured rule that agents load at runtime.
- **Version history**: when the rule was added, changed, archived, or promoted.
- **Verification result**: fixed-tool judge output, `exit_code`, key metrics, and evidence directory.

Copy:

> We store the smallest durable record needed to explain why a rule exists and how an agent should apply it.

## What We Do Not Store

This section should be direct and non-defensive:

- TeamAgent does not need raw API keys, tokens, private credentials, or secret values.
- TeamAgent does not score engineers by keystrokes, speed, or terminal activity.
- TeamAgent does not create hidden policy that only the agent can see.
- TeamAgent does not require full private session transcripts by default.
- TeamAgent does not use unrelated personal files as rule evidence.
- TeamAgent does not let the code under test evaluate itself as the final judge.

Copy:

> If a rule cannot be explained from visible evidence, it should not be trusted as team policy.

## Handoff Story

Use "接力棒" as a concrete handoff story, paired with real evidence.

Story copy:

> 周一，老员工的 agent 在一次 release 中把验证结果写成了主观总结，没有保存 raw judge output。团队把这个失败转成规则：交付前必须由固定第三方 harness 产出 JSON 和原始证据。周三，新员工启动新的 Codex session。TeamAgent 加载这条规则，在 agent 准备只写“测试通过”时拦住它，要求附上 judge run id、stdout path 和 evidence directory。接力完成：经验从一个 session 交给下一个 session，错误没有重演。

Before/after UI:

| Before | After |
|---|---|
| `Tests look good.` | `judge.json: exit_code=0, evidence_dir=.judge/2026-05-01-1430/` |
| 主观判断 | 固定工具 + raw evidence |
| 经验留在人脑里 | 规则进入团队 archive |

## Example Rule Detail

Use one expanded rule card on the page.

```text
Rule ID: trust.testing.judge-harness
Status: Active
Tier: P0
Source: failed verification handoff, release review
Runtime behavior: Before claiming code is correct, require third-party judge JSON.
Compiled output: Do not let code evaluate itself. Run fixed tools, dump judge.json and raw evidence, then summarize from raw output only.
Privacy note: Store run metadata and evidence paths; redact secrets from stdout/stderr before archival.
Verification: judge.json includes exit_code, metrics, evidence_dir, stdout_path, stderr_path.
```

Rule detail copy:

> A rule detail page must show both the human reason and the runtime behavior. The reader should be able to answer: "What happened, what changed, who can inspect it, and how do we know it worked?"

## Interaction Notes

- Tabs: `Rules`, `Evidence`, `Sessions`, `Handoff`, `Privacy`.
- Timeline rows expand to show source snippets and compiled output.
- Rule cards use mono labels for ids, event names, JSON keys, and file paths.
- Danger color marks historical mistake; teal marks TeamAgent action; green marks verified outcome; amber marks pending evidence.
- Avoid abstract trust icons. Use rule cards, evidence bundles, timeline entries, and compiled output previews.

## Acceptance Criteria

- The first viewport states that TeamAgent rules are source-backed and inspectable.
- The page includes the full lineage: captured, compiled, published, loaded, verified.
- Privacy boundary is visible without opening a modal or FAQ.
- "What we store" and "What we do not store" are separate sections.
- Handoff story uses the 接力棒 metaphor and includes a concrete before/after.
- Example rule detail includes source, runtime behavior, privacy note, and verification fields.
- UI copy remains primarily Chinese, with technical labels allowed in English.
- Markdown stays under 200 lines.
