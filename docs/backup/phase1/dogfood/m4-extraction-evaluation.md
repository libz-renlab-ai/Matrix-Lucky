# M4 Extractor 评测报告

> 日期: 2026-04-14 (M4 Commit 6)
> LLM: Claude Opus 4.6 via `claude -p --output-format json --no-session-persistence`
> 管道: fixture → ruleBasedCorrectionDetector → llmBasedKnowledgeExtractor → JsonlKnowledgeStore → MarkdownCompiler

## Fixture 自举结果

对 4 个不同信号类型的 fixture 执行 `pnpm teamagent analyze --session=... --commit`，所有条目直接写入真实 team store（dogfood 自己的知识库）。

| # | Fixture | 信号 | 提取成功 | 评分 | 备注 |
|---|---------|------|---------|------|------|
| 1 | `correction-denial-01.jsonl` | explicit_denial | ✅ | 5/5 | 第一条实拉，完美 |
| 2 | `correction-denial-02.jsonl` | explicit_denial | ✅ (第 2 次重试) | 4.5/5 | 首次失败，重跑成功 |
| 3 | `correction-override-01.jsonl` | explicit_denial | ✅ | 5/5 | 自动用 \| 分隔多候选 |
| 4 | `correction-code-edit-01.jsonl` | code_edit | ✅ | 4/5 | trigger 略任务化 |

**平均分 4.6/5**，超过 DoD ≥3.5/5。

## 提取条目（具体内容见 teamagent review）

四条条目的 category / trigger / wrong_pattern / correct_pattern / reasoning 均由 LLM 抽取，可用 `pnpm teamagent review 4` 查看原文。要点：

- **HTTP client 选型**（axios → fetch）: 5/5，trigger 通用，wrong_pattern 单 token 可匹配
- **DB 批量写入**（循环 → 批处理）: 4.5/5，自动用 `|` 分隔多候选；首次调用失败重试成功
- **状态管理选型**（Redux → Zustand）: 5/5，枚举三种引用形式（品牌名/npm 包名/短名）
- **debounce 工具函数**: 4/5，trigger 略任务化但可接受

## DoD 评估

- [x] 对代表性 fixture 执行 commit，人工评分均分 ≥ 3.5/5（实际 4.6/5）
- [x] Extractor 纯函数（callLLM 注入）+ Pipeline 端到端通
- [x] analyze --commit 完成 detector → extractor → store → compiler 全链
- [x] 自举切入：所有 4 条结果都进入真实 team store，CLAUDE.md 自动重编译
- [x] 归因：CLI 输出"识别 N，提取 M，跳过 K，失败 L"，新增条目逐条列出

## 关键发现：LLM 提取的规则缺 scope 会立刻反噬

写本文档时，其中一条刚提取的 block 级规则**拦截了本次写入**——因为文档里出现了该规则 wrong_pattern 里的关键词。规则 id: `team-20260414115940-gipybp`（DB 批量写入那条）。

**根因**:
- 该条 wrong_pattern 用 `|` 分隔了 3 个候选 token，matcher 做子串匹配。
- 该条未设置 `scope.paths`，默认对所有文件（含 `.md`）生效。
- 所以任何文档或讨论这条规则的文本，都会被它自己拦截。

**这和 M2 的一条已有经验完全吻合**（见 CLAUDE.md 第 60 行）:
> "务必加 scope.paths 或 scope.file_types 精确范围，例如 'scope.paths':['packages/core/**'] ——否则 matcher 对所有文件的命中关键词都拦，产生 false positive"

rule-based 人工录入时我们记得加 scope，但 LLM 提取没学到这件事。

**修复（下一步，非 M4 范围内）**:
1. 在 `buildExtractionPrompt` 里加入"推断 scope"指令，返回 `scope_hint: { paths?: [...], file_types?: [...] }`
2. Pipeline 把 hint 填入 `entry.scope.paths`
3. 或后处理：看 category——`C`（代码）默认加 `**/*.{ts,js,py,...}`，`E`（工程）加 `package.json` 等

## 其他 Tech Debt

### 1. 首次 LLM 调用偶发失败

**现象**: `denial-02` 第一次跑时 "失败 1"，无错误细节；第二次重试成功。

**原因**（推测）:
- LLM 非确定性：同样 prompt 可能返回略不同格式，极少数情况触发 parser 的 null 路径，被计入 failed
- 网络抖动或 `claude -p` 本身的瞬时错误
- CLI 未渲染 bus 的 `extractor.failed` 事件详情，无法区分"LLM 抛错" vs "parse 失败"

**改进方向**:
- analyze --commit 末尾 dump bus 的 failed/skipped 事件明细（需要 renderer 接入）
- 可选：单条失败自动重试 1 次（需权衡 LLM 花费）

### 2. wrong_pattern 偶现正则残片

**现象**: 某条 wrong_pattern 里混入了 `.*` 这类正则语法，但 matcher 是子串匹配，这类 token 永远不会命中。

**改进方向**:
- 在 prompt INSTRUCTIONS_BLOCK 加入："wrong_pattern 只写字面关键字，不要用正则元字符"
- 或让 Pipeline 后处理：剥掉常见正则元字符

### 3. trigger 粒度判断

**现象**: LLM 对 trigger 泛化程度判断不一致。多数时候通用；个别条任务化。

**改进方向**: prompt 已有"不要把具体实现细节写进 trigger"指令，但效果需要更多样本验证。M5 导入已有规则文本时可建立一套 trigger 质量评测。

## 成本记录

| 项目 | 数量 | 单次成本 (USD) | 小计 |
|------|------|---------------|------|
| 烟测 | 1 | 0.122 | 0.122 |
| fixture 提取 | 5（含 1 次重试） | 0.12 | 0.60 |
| **合计** | | | **~$0.72** |

约 6 次 `claude -p` 调用（实际走用户订阅额度）。

## 下一步

- **立即**：加 prompt instruction 让 LLM 推断 scope（或先在 CLI 写入前给 accumulated 源默认加温和 scope），避免反噬
- **M5**：RuleImporter — 把项目里已有的 CLAUDE.md / .cursorrules 文本规则也拉进来
- **M6**：Confidence calibration —— 根据 hit_count / override_count 动态调整，低质量条目自动降权或归档
