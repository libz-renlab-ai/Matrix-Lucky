# TeamAgent 产品路线图 v3

> 创建日期：2026-04-22
> 版本：v3（取代 v2 `2026-04-15-product-roadmap-v2.md`）
> 状态：Draft（待用户审）
> 作用：所有后续 Phase / Sub-project spec 的**父文档**

---

## 零、v3 对 v2 的核心修正

v2（2026-04-15）写完后的 7 天实际执行暴露了三个偏移，v3 正式承认：

### 偏移 1：Wiki 子系统（Phase 2 SP-3）实测失败 → 降级 experimental

**证据**（2026-04-21 direction memo + 自测数据）：
- UserPromptSubmit 语义注入**实际几乎不触发**（minSimilarity=0.75 严苛 + Xenova 冷启动 5s 超时 + 跨模型 embedding 维度可能不匹配）
- 5 套 source adapter + filter + judge + embed + sweep + retriever + marker，**运维成本过高**
- 本轮踩坑：URL 404、RSS 解析失败、root package.json 检测不到 monorepo 子依赖、stack-relevance 过严全挡
- Haiku 拒绝 297/386 = 77%；stack-relevance filter 挡掉 39/46 = 85%——**LLM judge 大量做无用功**
- 核心需求（查最新 AI 新闻/论文/release）**可被 MCP 替代**（用户明确提出）

**处置**：
- ❌ **不再算入 Phase 2 出口标准**（原"Wiki 条目 ≥ 30 条 + inline 注入月均 ≥ 5 次/session + 不打扰主观评估"三条全部放弃）
- ✅ 代码保留，不删（避免破坏现有功能）
- ✅ 后续（Phase 4 后）把 RSS / arxiv / github release fetcher 抽成独立 MCP server `teamagent-news-mcp`
- ✅ 保留 `SqliteWikiRetriever` + `knowledge_vec` 基建（团队记忆也要语义检索）
- ✅ 保留 `AttributionBus` + `harvest-writer`（团队记忆也要日志）

### 偏移 2：Phase 3 已完成（v2 里是"待做"）

**证据**（git log）：
- `bed3982 feat(phase3): Phase 3 complete — doctor, UX polish, npm bundle, README`（2026-04-19 前后）
- 后续 `sp3+` 系列 commit 是 Phase 3 的 polish + 同事试用反馈修复（`a6d0fc3 fix(sp3+): two tarball-install bugs reported by teammate test`）
- v0.6.0 tarball 已生成（`packages/teamagent/teamagent-0.6.0.tgz`）

**退出标准复核**：
- SP3-1 / SP3-2 / SP3-3 / SP3-4 全部完成 ✅
- 友测（≥ 3 位非作者朋友 ≥ 2 周）— **不确定是否全量达成**，但已有同事试用并反馈 bug
- **判定**：Phase 3 **实质完成**，友测作为**持续验证阶段**与后续 Phase 并行推进，不作为 Phase 4 启动前提

### 偏移 3：Phase 4 提前启动，且变成"真正的差异化战役"

**v2 的 Phase 4**（抽象）：Git-backed 知识同步 + 冲突处理 + 隐私过滤 + 团队仪表盘 + 自动上传。

**v3 的 Phase 4**（具体）：基于 2026-04-22 prior-art 调研，每项抽象需求都填上了**业界已验证的具体方案**。详见本文第六节。

**提前原因**：
1. Wiki（原 Phase 2 SP-3）失败，释放出 Phase 2 的时间预算
2. 调研证明**"自动捕获 + 自动同步"是市场空白**——Cursor 试过失败（Memories 2.1.x 撤）、Windsurf 故意只做一半（Cascade Memories 不同步）、Copilot/Claude Code 只做静态规则
3. 越早做越容易占位，等竞品补齐就错过窗口

---

## 一、产品愿景（沿用 v2，不变）

> 开发出一款类似**团队智脑**的自进化 AI。最终目的是让团队有人踩过的坑只踩一次、别人不再踩；走过的弯路只走一次、别人不再走；有最新的知识和经验都**实时同步**到团队中每一个人的 Claude Code 里。

**核心机制**：系统在运行中自己完善自己，实现**自我进化**。对用户**无需任何主动操作**。整个系统**越用越聪明、越快、错误越少、token 消耗越少**。

---

## 二、系统的 5 个维度（坐标系，沿用 v2）

| 轴 | 含义 | 2026-04-22 状态 | 终态 |
|---|---|---|---|
| **知识类型** | wiki / taste / 前沿 + 成功经验 + 失败经验 | 主要失败经验（146 条），少量成功经验 | wiki + 成功 + 失败 |
| **知识来源** | 个人 / 团队 / 互联网 | ❌ 只有个人 | 三源融合 |
| **激活方式** | 主动补充（inline 对话注入）+ 被动运用（运行时拦截） | 主要被动，少量主动（wiki inline 实测失败） | 主动 + 被动 |
| **工具范围** | Claude Code / Cursor / Windsurf / 其它 | ✓ Claude Code | 多工具 |
| **用户范围** | 本地单人 / 团队共享 | 作者 + 少量同事试用 | 团队 |

**当前位置** = 失败经验 × 个人知识 × 被动 × Claude Code × 本地（有少量外部试用）

---

## 三、自我进化的 4 个子能力（沿用 v2）

1. **自动记忆错误** — 捕获纠正时刻并抽成规则 ✅
2. **自动记忆经验** — 成功模式捕获（框架有，Phase 4+ 真落地）
3. **自动置信度管理** — Wilson LB（升）+ Demerit 积分（降）+ 5-tier ✅
4. **自动知识传播** — 个人高置信规则 → 自动提议同步团队 ← **Phase 4 v3 核心**

---

## 四、v3 竞品地图（基于 2026-04-22 调研更新）

```
                   ┌──── HAND-WRITTEN RULES ────┬──── AUTO-CAPTURED RULES ────┐
                   │                            │                             │
SYNC TO TEAM       │ Cursor Team Rules          │ ⚠️ 空白                      │
(cross-user)       │ Copilot Org Instructions   │                             │
                   │ Continue Hub               │ ← TeamAgent 唯一占位         │
                   │ OPA bundle / OCP           │                             │
                   ├────────────────────────────┼─────────────────────────────┤
LOCAL ONLY         │ .cursorrules (classic)     │ Windsurf Cascade Memories   │
(per-user)         │ CLAUDE.md (static)         │ Cursor Memories (2.1.x 撤)  │
                   │ AGENTS.md (static)         │ Claude `#` (deprecated)     │
                   └────────────────────────────┴─────────────────────────────┘
```

**v3 的独立位置更精确**：
- v2 说"自动捕获 + 实时拦截"是空白 → **拦截**这个维度其实 Cursor 也有
- v3 修正：**自动捕获 + 跨用户同步**才是真正的市场空白
  - Cursor 有同步但**撤掉了自动捕获**
  - Windsurf 有自动捕获但**明确拒绝同步**（官方文档原话："Memories 不跨 workspace、不进 git"）
  - Copilot / Claude Code / 其余 = 只有静态规则

### v3 新增借鉴（2026-04-22 调研输入）

| 借鉴点 | 来源 | 用在哪 |
|--------|------|--------|
| `extends: ["github>org/repo#v1.0.0"]` 配置继承模式 | Renovate | Phase 4 团队规则分发 |
| **强制版本钉死**（避免 Renovate 用户的惨痛集体翻车） | Renovate 踩坑 | Phase 4 规则引用 |
| `tier` 灰度部署（experimental → enforced → canonical）| OPA Gatekeeper `enforcementAction` | Phase 4 规则生效阶梯 |
| MDC 格式（markdown body + YAML frontmatter）| Cursor / Windsurf / Continue 三方共识 | Phase 4 规则文件格式 |
| **status: contested** 显式冲突标记 | 行业空白（调研证明无人做） | Phase 4 冲突解决 |
| Claude Code settings 数组 concat+dedupe 合并 | Claude Code settings.json 规范 | Phase 4 可能省掉自写 merge 逻辑 |
| 半自动 promote（而非全自动）| Cursor Memories 死亡教训 | Phase 4 个人→团队晋升流程 |
| 自建 PII redactor（非仅 gitleaks）| 调研：标准工具抓不到内部主机名/邮箱/路径 | Phase 4 隐私守门 |
| AGENTS.md co-write | 20+ 工具 / 60000+ 项目已支持 | Phase 4.5（从 Phase 6 提前） |

### 不借鉴的部分（沿用 v2 + 新增）

- OPA Rego / Cedar 策略语言（overkill）
- Microsoft AGT 的 mesh / compliance / marketplace（重企业）
- Codacy SAST 规则
- RL 自我纠正（GPU 依赖）
- **新增：Continue Hub 的云端注册中心**（v1 不需要，git transport 够用；未来可选升级）
- **新增：OPA bundle server 签名机制**（v1 不需要，git 天然有历史审计）

---

## 五、技术栈（沿用 v2，2026-04-22 微调）

Phase 2 v2 技术栈标准不变。Phase 4 新增依赖：

```
YAML parser    js-yaml（MDC frontmatter 解析）
PII redactor   自写（无合适开源库覆盖"内部标识符"场景）
Git transport  simple-git 或 child_process git（优先后者，减依赖）
```

---

## 六、6 个 Phase 分段（v3 版）

### Phase 1 — Walking Skeleton ✅ 完成

**版本**：v0.1.0
**状态**：沿用 v2 记录

### Phase 2 — 本地单人体验好用化 ⚠️ 部分完成（已冻结推进）

**v3 修正的退出标准**（wiki 相关全部放弃）：
1. ~~Benchmark 4 组对比 ≥ 30% 错误率下降~~ → **降级为 Phase 4 过程中并行验证**（SP-2 bench 基建保留）
2. ~~False positive 率 ≥ 50% 下降~~ → 同上
3. ~~成功经验 ≥ 10 条~~ → **延后到 Phase 5**（需要成功经验捕获机制，Phase 4 不做）
4. ❌ Wiki 条目 ≥ 30 条 + inline 注入月均 ≥ 5 次 → **永久放弃**
5. ✅ 连续 dogfood ≥ 30 天无规则反噬事件 → **实际达成**

**v3 判定**：
- SP-1（好用化：基础设施 + Calibrator v2）= 完成
- SP-2（A/B benchmark）= 基建完成（bench-007 fixture 在），**4 组全量对比延后到 Phase 4 过程中跑**
- SP-3（Wiki + Inline）= 实验性保留，**不再投入**
- **整体状态**：Phase 2 就此**冻结**，不继续推进。差异化战役移到 Phase 4。

**版本**：v0.3.0（即当前 main，不再独立 bump）

### Phase 3 — Ready for User #2 ✅ 完成

**版本**：v0.5.0（commit `bed3982`）

**v3 补充退出标准检查**：
- doctor / UX polish / npm bundle / README 全做完
- 友测 ≥ 3 位 ≥ 2 周 = **持续验证中，不阻塞 Phase 4 启动**

### Phase 4 — 团队记忆 v1（v3 全面重写）

**目标**：让一个团队（5–10 人）的 TeamAgent 实例**双向同步规则**。A 学到的规则通过 git PR 流程进入团队仓库，B 下次 session start 时自动拉取到本地 knowledge.db。

**覆盖轴**：
- 用户范围：单人 → 团队共享
- 知识来源：只个人 → 个人 + 团队
- （暂不扩"激活方式"、"知识类型"、"工具范围"）

#### 6.1 Phase 4 的 5 个 Milestone

```
M-team-1  MDC 文件格式 + export/import 命令 (无 sync)
M-team-2  git sync transport (pull 后自动 merge 进 knowledge.db)
M-team-3  冲突检测 + status:contested 标记 + teamagent resolve-conflicts 交互
M-team-4  PII redactor + pre-commit hook (export 时强制脱敏)
M-team-5  CLI 用户体验 (promote/reject/resolve 一键操作)
```

#### 6.2 Phase 4 关键设计决策（基于调研）

| 决策点 | v3 选择 | 理由（引自调研） |
|--------|---------|-----------------|
| 规则文件格式 | MDC = `.teamagent/rules/*.mdc`（markdown body + YAML frontmatter）| Cursor / Windsurf / Continue 三方共识；diff 友好；LLM 原生能读 |
| Frontmatter 字段 | `id / scope / category / tier / score / hits / created_at / added_by / reasoning` | 机器可 parse，与现有 calibrator v2 模型对应 |
| 同步 transport | git PR（v1） | Renovate 证明 git 足够；Continue Hub 是 v2 升级路径 |
| 规则引用语法 | `extends: ["github>org/teamagent-rules#v1.2.3"]` | 抄 Renovate；**强制版本钉死**避免其 bad-commit-全员翻车 |
| 冲突解决 | last-write-wins + tier tie-breaker + `status: contested` flag | last-wins 兼容直觉；contested flag 是**行业空白填补** |
| Scope 分层 | personal（不进 git）+ project（仓库内）+ team（共享仓库）+ managed（企业）| 镜像 Claude Code settings 四层；**可复用 Claude Code 数组合并** |
| 自动晋升 | **半自动**：高 score 规则 → 提示用户 → 一键 `teamagent promote <id>` | **Cursor Memories 死亡教训**：全自动触发隐私 + 质量反弹 |
| 隐私脱敏 | 自建 PII redactor（内部主机名/邮箱/UUID/路径）+ gitleaks 外挂（密钥）| 调研证明 gitleaks 抓不到内部标识符 |
| 一键拒绝 | day-1 必须有 `teamagent dislike <id>` + "永不再学此类"标记 | Cursor Memories 死亡原因之一是没这路径 |
| AGENTS.md 兼容 | Phase 4.5（见下）同时写 CLAUDE.md + AGENTS.md | 60000+ 项目 + 20+ 工具支持，搭便车 |

#### 6.3 Phase 4 退出标准

1. **跨人同步可验证**：Alice 在仓库 A 学到规则 R，PR merge 后 Bob 在仓库 B（subscribe 到同一 team-rules）下次 session start 能看到 R 被 inject
2. **冲突机制跑通**：制造一次 `wrong_pattern` 互斥，`status: contested` 正确触发，`teamagent resolve-conflicts` 能进入交互
3. **隐私守门**：export 一条含邮箱/内部主机名的规则，PII redactor 100% 拦下（单测 + 集成测）
4. **反噬控制**：dogfood ≥ 2 周，团队规则**被拒绝**的次数 ≤ 5（Cursor Memories 教训的量化验证）
5. **benchmark 通过**：跑齐 Phase 2 SP-2 的 4 组对比（裸 / Auto-Memory / Codacy / TeamAgent），TeamAgent + 团队规则**相对下降 ≥ 30%** 重复犯错率
6. **真实团队试用**：≥ 3 人在同一 team-rules 仓库下用 ≥ 1 周

**版本**：v0.7.0

### Phase 4.5 — AGENTS.md 兼容（**从 v2 Phase 6 提前**）

**原因**：调研发现 AGENTS.md 已成跨工具标准（2025-12 Linux 基金会接管），60000+ 项目 + 20+ AI 工具支持（Cursor / Aider / goose / Copilot / Windsurf / Codex / Gemini CLI 等）。**同时写 AGENTS.md 的增量成本低（~1 天）**，但团队里用 Cursor / Aider 的同事的 AI 也能受益——意外的爆款 feature。

**核心产出**：
- TeamAgent compile 时同步写 `AGENTS.md`（与 CLAUDE.md 内容一致，或按 AGENTS.md 规范裁剪）
- 尊重 AGENTS.md 嵌套规则（monorepo 场景下 packages/X/AGENTS.md 高于根目录）
- **不做**：推动 AGENTS.md 规范加 `hit_count` / `tier` / `score` 字段（这是 Phase 6 事）

**退出标准**：一位用 Cursor 的同事跟 TeamAgent 用户（用 Claude Code）跑同一仓库，Cursor 能看到并遵守 TeamAgent 生成的规则。

**版本**：v0.8.0

### Phase 5 — 前沿知识 + 主动补充深化（沿用 v2）

**v3 微调**：
- 原 Phase 5 有"wiki 主动补充 v2"，但 Phase 2 SP-3 的 wiki 实测证明 inline 注入质量问题大 → v3 改为"**只在规则为空 / Calibrator 失信时**才主动补充"，避免打扰
- **成功经验捕获**从 Phase 2 延到 Phase 5（在团队规则建立后更有数据）

**版本**：v0.9.0

### Phase 6 — 多 AI 工具（v3 削减）

**v3 削减原因**：AGENTS.md 兼容已在 Phase 4.5 做掉，Phase 6 不再做"接 Cursor/Windsurf"（因为他们已读 AGENTS.md）。Phase 6 v3 只剩：

- MCP server 对外暴露 TeamAgent 的规则查询接口
- 统一事件模型

**退出标准**：一个不读 AGENTS.md 的 AI 工具（如 Sourcegraph Cody Enterprise）通过 MCP server 接入。

**版本**：v1.0.0（公开发布）

---

## 七、Phase 之间的关键依赖（v3）

```
Phase 1 ✅
    ↓
Phase 2 ⚠️ (冻结，基建保留)
    ↓
Phase 3 ✅
    ↓
Phase 4 ← 当前战役（2026-04-22 启动）
    ↓
Phase 4.5 (AGENTS.md 搭便车)
    ↓
Phase 5 (知识类型 + 来源扩展)
    ↓
Phase 6 (MCP 对外)
```

**关键承诺**（沿用 v2）：每个 Phase 的 benchmark 都对比前一个 Phase，用同一把尺子验证实质进步。

---

## 八、不在 v3 Roadmap 范围内的事（沿用 v2，新增标注）

- 商业化 / 定价 / 企业版本
- 云端托管服务（本地优先，同步只走 Git）
- IDE 原生插件（只做 MCP server）
- UI / 仪表盘（Phase 4 极简团队看板外，CLI + Markdown 即全部界面）
- WSL / BSD 等非主流平台
- **新增：Continue Hub 式的云端注册中心**（git 足够，云端是 v2+ 话题）
- **新增：OPA bundle server 签名机制**（git 历史 + PR 审计足够，除非企业版需要）

---

## 九、文档生命周期（沿用 v2）

- 本 roadmap 是活文档
- Phase 4 独立 spec：`docs/superpowers/specs/2026-04-XX-phase4-team-memory-design-v2.md`（v1 = v2 roadmap 里的抽象版，v2 = 基于 2026-04-22 调研的具体版）
- Phase 4 sub-milestone 实现计划：`docs/superpowers/plans/2026-04-XX-m-team-{N}-*.md`

---

## 十、本文档待用户确认的点

v2 里确认过的（5 坐标系 / 4 子能力 / D+C 战略）v3 沿用，**不重新确认**。

v3 新增待确认：

1. **是否同意 Phase 2 就此冻结？** 特别是放弃"wiki inline 注入月均 ≥ 5 次"这条退出标准
2. **是否同意 Phase 3 判定为实质完成？** 友测继续但不阻塞 Phase 4
3. **是否同意 Phase 4 的 5 个 milestone 拆分？** M-team-1 到 M-team-5 的顺序和粒度
4. **是否同意 AGENTS.md 兼容提前到 Phase 4.5？** 而非放在 Phase 6
5. **Phase 4 退出标准里"≥ 3 人 ≥ 1 周"的试用规模**合理吗？太松还是太紧
6. **半自动 promote 流程**——高 score 规则提示用户一键晋升，是你想要的节奏吗？还是希望更自动（Cursor 式）或更人工（纯手动 PR）

---

## 十一、参考文档

- v2 roadmap：`docs/superpowers/specs/2026-04-15-product-roadmap-v2.md`
- Phase 2 design v2：`docs/superpowers/specs/2026-04-15-phase2-design-v2.md`
- Phase 3 design：`docs/superpowers/specs/2026-04-20-phase3-design.md`
- **2026-04-21 direction memo**：`docs/specs/2026-04-21-team-memory-direction.md`（Phase 4 提前的原始动因）
- **2026-04-22 prior-art 调研报告**：`docs/research/2026-04-22-team-memory-prior-art.md`（Phase 4 的具体方案都从这来）
