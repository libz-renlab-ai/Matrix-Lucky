```
        __
   <(o )___    JUDGE: 判 trace 是否达到 GOAL
    ( ._> /    （feature-level 验证；不是 loop 进度判定）
     `---'
```

# JUDGE — feature-level verification call

主 agent 在 [RUN-VERIFY-LOOP](RUN-VERIFY-LOOP.md) Step 3 调用本判定。
JUDGE 看 feature 对不对；loop 进度由 [META-JUDGE](META-JUDGE.md) 判。

## 输入

| 字段 | 来源 |
|---|---|
| `GOAL` | `docs/features/<name>/GOAL.md` 全文 |
| `TRACE` | RUN harness dump 到 `/tmp/verify-<feature>-<ts>.txt` |

### Trace 结构建议（来自 dogfood 经验）

可选但强烈推荐：用 `=== EVIDENCE N: <题目> ===` 把 trace 切成
有编号的 evidence sections。JUDGE 的 reason 文本会自然引用
`(EVIDENCE 3)` 之类的锚点，方便人工 audit。

### 当 feature 自带 mechanical harness（如 `run-judge.sh`）

JUDGE 的角色不是 rubber-stamp harness 的 `exit_code`，而是验证
**harness 的窄信号是否 align GOAL 的产品语言**。例如：

- harness 报 `leaked_pii_count == 0` ✓
- 但 GOAL 锚点是「5 类公开 PII 全部被 scrub」
- JUDGE 要核对：harness fixture 是否覆盖这 5 类？harness 跑的
  test 是否对每类各有 assertion？

不对齐时 → INCONCLUSIVE，要求下一轮把 harness fixture / test
补齐到 GOAL 锚点维度。

## Prompt 模板

```text
You are JUDGE for TeamBrain product feature verification.

GOAL (product language description, plus specific anchors and counter-examples):
----- BEGIN GOAL -----
{goal}
----- END GOAL -----

TRACE (any format, may be noisy):
----- BEGIN TRACE -----
{trace}
----- END TRACE -----

Your task: decide whether the trace shows the GOAL achieved.

Decision rules:
- Verify each Specific anchor is supported by the trace.
- Verify Counter-examples are NOT shown firing in the trace.
- If trace lacks decisive evidence, say INCONCLUSIVE and enumerate what is missing.

Output ONLY one JSON object on a single line, no prose, no markdown fence:
{"verdict":"PASS|FAIL|INCONCLUSIVE","reason":"<2-3 sentences>","missing_evidence":["<thing>","..."]}
```

## 调用方式 — **不**用 `--bare`

```bash
timeout 180 claudefast -p "<prompt>" < /dev/null > judge-out.txt 2>&1
```

JUDGE 要懂项目语境（rule 名字、feature 描述、canned-answer 锚点等），所以
**不**关 hooks/CLAUDE.md auto-discovery。代价：项目 Stop hook 会在输出里
注入 `<self-report>` block——下面解析步骤会处理掉。

### 关键 flags 经验（dogfood 验证 2026-05-08, claudefast 2.1.133）

| flag | 用 / 不用 |
|---|---|
| `--bare` | ❌ 不用 — JUDGE 要项目语境 |
| `< /dev/null` | ✅ 必加 — 避免 3s stdin warning |
| `--max-turns N` | ❌ 不加 — `N=1` 会 hard fail with `Reached max turns (1)`，默认即可 |
| `--max-budget-usd $X` | ❌ 不加 — 默认 $0.10 不够 5KB 提示；要么调高（>$0.50）要么完全省略 |
| `--output-format json` | ⚠️ 可选 — prompt 里强制 JSON-only 已足够 |
| `--max-tokens` | ❌ 该 flag 在 claude code CLI 不暴露，不要用 |

## 输出契约 + 解析步骤

JUDGE 输出**会带 `<self-report>` 尾巴**（项目 Stop hook 注入的，不可关）：

```
{"verdict":"PASS","reason":"...","missing_evidence":[]}
<self-report>
premature_stopping: false
...
</self-report>
```

### 解析（按顺序）

1. **取第一行** — `head -n 1 judge-out.txt`（JSON 单行；self-report block 在后面）
2. **JSON parse** — `jq -r '.verdict' <<< "$first_line"`
3. **fallback** — 第一行 parse 失败时，用 `awk '/^\{/{p=1} p; /^\}/{p=0; exit}'` 抓 `{...}` 块
4. **self-report block 整段忽略** — 不解析、不存档（不在 GOAL 范围）

## verdict 取值

- **PASS** — trace 满足 GOAL，loop 结束 → 跳 RUN-VERIFY-LOOP Step 6
- **FAIL** — trace 未达标 → Step 4 写 iteration record → Step 5 META-JUDGE
- **INCONCLUSIVE** — trace 缺证据 → 主 agent 下一轮加 logging（不算 fix code）

## 联动

- 上游：[RUN-VERIFY-LOOP](RUN-VERIFY-LOOP.md) Step 3
- 输入 GOAL：[GOAL-COMPOSER](GOAL-COMPOSER.md) 产出
- FAIL/INCONCLUSIVE 触发：[META-JUDGE](META-JUDGE.md)
