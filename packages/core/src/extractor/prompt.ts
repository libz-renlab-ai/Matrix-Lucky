import type { ExtractionInput } from "@teamagent/ports";

/**
 * 构造给 LLM 的提取 prompt。纯函数。
 *
 * 设计要点：
 * - 只问 LLM 能可靠提取的 8 个字段：category / tags / type / nature /
 *   trigger / wrong_pattern / correct_pattern / reasoning
 * - confidence / enforcement / id / 时间戳 / evidence 由 Pipeline 补全
 * - 要求 LLM 严格输出一段 JSON（可包裹在 ```json fenced block 里）
 *   或输出 `null` 表示这条纠正不适合提取成知识（太琐碎、太个性化等）
 *
 * 输出契约示例：
 * ```json
 * {
 *   "category": "E",
 *   "tags": ["http-client", "tech-choice"],
 *   "type": "avoidance",
 *   "nature": "subjective",
 *   "trigger": "需要发起 HTTP 请求",
 *   "wrong_pattern": "axios",
 *   "correct_pattern": "fetch",
 *   "reasoning": "项目零依赖偏好；fetch 在现代 Node 原生可用"
 * }
 * ```
 */
export function buildExtractionPrompt(input: ExtractionInput): string {
  const header = buildHeader(input.kind);
  const contextBlock = buildContextBlock(input);
  const schema = SCHEMA_BLOCK;
  const examples = EXAMPLES_BLOCK;
  const instructions = INSTRUCTIONS_BLOCK;

  return [header, contextBlock, schema, examples, instructions].join("\n\n");
}

function buildHeader(kind: ExtractionInput["kind"]): string {
  const sourceMap: Record<ExtractionInput["kind"], string> = {
    correction: "用户在 Claude Code 会话中纠正了 AI 的行为",
    success: "用户的一次成功模式（AI 未被纠正且模式被重复使用）",
    "rule-text": "一段已有的规则文本",
    insights: "Claude Code /insights 报告",
    "npm-audit": "npm audit 输出（依赖安全漏洞）",
    "pr-review": "PR review 评论",
    "git-hotspot": "git log 热点文件（频繁被修改的路径）",
    "ci-failure": "CI failure 日志片段",
  };
  const source = sourceMap[kind];
  return `你是知识提取器。任务是把下面这段上下文（${source}）提炼成一条结构化的"知识条目"，供团队 AI 未来参考。`;
}

function buildContextBlock(input: ExtractionInput): string {
  return [
    "【上下文】",
    `信号权重: ${input.weight.toFixed(2)}`,
    "```",
    input.context.trim(),
    "```",
  ].join("\n");
}

const SCHEMA_BLOCK = `【输出字段】
- category: "C" | "E" | "S" | "K"
  - C 代码层（语法、类型、API 用法）
  - E 工程层（架构、依赖、工具链）
  - S 策略层（任务分解、实现顺序、取舍）
  - K 认知层（用户偏好、心智模型、协作方式）
- tags: string[]  自由标签，2-5 个短词；英文或中文均可（如 "http-client" "architecture"）
- type: "avoidance" | "practice"
  - avoidance 避坑（"不要 X"）——**必须**有可字面匹配的 wrong_pattern 关键词
  - practice 最佳实践（"就该 X"）——wrong_pattern **必须留空**
  ⚠️ 若有可字面匹配的反模式，一律选 avoidance。严禁 practice + wrong_pattern 组合，
      否则 validator L0 会拒收 (practice_must_not_have_wrong_pattern /
      avoidance_must_have_wrong_pattern)。
- nature: "objective" | "subjective"
  - objective 客观可验证（语法错误、API 行为）
  - subjective 主观偏好（架构选型、风格）
- trigger: string  何时这条知识生效。一句话，描述场景，不包含具体做法
- wrong_pattern: string  **关键规则**——**可字面 substring 匹配**的通用关键词。
  **元原则** (3 条必须全中)：
    (a) 字面稳定 —— 跨项目跨团队，这串字符含义相同
    (b) 可 substring 命中 —— 在代码/命令/配置文本里会原样出现
    (c) 脱离上下文仍指向问题 —— 看到这串字符就知道踩坑，不必懂周围含义
  **允许的 18 类**（A 代码/语言、B 基础设施/命令、C 配置/环境、D 数据/查询、E 安全/质量）：
    A1 依赖/包/模块名：\`moment\` \`jQuery\` \`@reduxjs/toolkit\` \`lodash\` \`request\`
    A2 API/方法/属性： \`localStorage.getItem\` \`document.write\` \`eval(\` \`innerHTML =\` \`XMLHttpRequest\`
    A3 语法/关键字：   \`var \` \`== \` \`!= \` \`new Function(\` \`with (\`
    A4 类型系统标记：  \`as any\` \`: any\` \`@ts-ignore\` \`@ts-nocheck\` \`Record<string, any>\`
    A5 框架反模式：    \`dangerouslySetInnerHTML\` \`key={index}\` \`v-html\` \`ng-bind-html\`
    B1 Git：           \`git push --force\` \`git commit --no-verify\` \`git reset --hard\`
    B2 包管理：        \`npm install -g\` \`pip install --user\` \`:latest\`
    B3 Shell 危险：    \`rm -rf /\` \`chmod 777\` \`chmod -R 777\` \`sudo rm\` \`umask 000\` \`eval $\`
    B4 Docker：        \`FROM .*:latest\` (字面 \`:latest\`) \`USER root\` \`privileged: true\` \`--cap-add=ALL\`
    B5 Kubernetes：    \`hostNetwork: true\` \`runAsUser: 0\` \`hostPath:\` \`privileged: true\`
    C1 配置键：        \`allowJs\` \`strict: false\` \`noImplicitAny: false\` \`skipLibCheck: true\`
    C2 环境变量：      \`NODE_ENV=development\` \`DEBUG=*\` \`DISABLE_AUTH=\`
    C3 URL/网络：      \`http://\` (明文) \`localhost:\` \`0.0.0.0/0\` 硬编码 IP
    D1 SQL 反模式：    \`SELECT *\` \`DROP TABLE\` \`DELETE FROM \` (无 WHERE) \`OR 1=1\` \`TRUNCATE \`
    D2 正则风险：      \`.*.*.*\` (连续通配) \`(.+)+\` (回溯炸弹)
    E1 凭证/密钥前缀： \`AKIA\` (AWS) \`ghp_\` (GitHub PAT) \`sk_live_\` (Stripe) \`SG.\` (SendGrid)
    E2 XSS/反序列化：  \`innerHTML =\` \`document.write(\` \`eval(\` \`new Function(\` \`javascript:\` \`pickle.loads(\`
    E3 测试/日志残留： \`.only(\` \`.skip(\` \`xdescribe(\` \`fdescribe(\` \`console.log(\` (prod) \`print(\` (prod)
  多个候选用 \`|\` 分隔，每段 ≥3 字符，≤40 字符。
  **四条铁律**：
    1. 最长公共片段 —— 宁要 \`npm install\` 一个短词，不要 \`npm install --save moment^2.29\` 完整行
    2. pipe 分多 variant —— 同概念多写法 \`innerHTML =|innerHTML+=\`
    3. 避免过度通用 token —— 禁 \`if\`/\`for\`/\`function\`/\`return\`/\`log(\`（单独）
    4. 不写正则 —— matcher 只做 substring，\`\\d+\` 不生效，用最长字面前缀
  **禁止**：
    ❌ 整句自然语言（"demote=0 时..." "AI 没先查..."）
    ❌ 项目专属路径/函数（\`packages/...\`、\`@teamagent/...\`、\`tierFromDemerit\`）
    ❌ 抽象动作描述（"直接 emit 新 source 值"）
    ❌ 超长字面量（>40 字符一般太具体）
    ❌ 测试代码片段（\`tierFromDemerit(4, 'stable')\`）
  找不到通用关键词时，type 改 "practice" 并留空 wrong_pattern——而非硬编入具体字面量。
- correct_pattern: string  正确做法的关键字/句式或一句话建议
- reasoning: string  一句话解释为什么。包含"为什么错"和"为什么对"`;

const EXAMPLES_BLOCK = `【示例】
示例输入：用户说 "不用 axios，用 fetch，项目要零依赖"，AI 之前建议 axios。
示例输出：
\`\`\`json
{
  "category": "E",
  "tags": ["http-client", "dependency", "tech-choice"],
  "type": "avoidance",
  "nature": "subjective",
  "trigger": "需要发起 HTTP 请求",
  "wrong_pattern": "axios",
  "correct_pattern": "fetch",
  "reasoning": "项目偏好零依赖，fetch 在 Node 18+ 原生可用，无需额外包"
}
\`\`\`

示例输入：用户说 "这思路不对，先写测试再写实现"，AI 直接开始写实现代码。
示例输出：
\`\`\`json
{
  "category": "S",
  "tags": ["tdd", "workflow"],
  "type": "practice",
  "nature": "subjective",
  "trigger": "开始实现新功能前",
  "wrong_pattern": "",
  "correct_pattern": "先写失败测试再写实现（TDD）",
  "reasoning": "团队采用 TDD 节奏：红→绿→重构，能减少回归并强制接口先行"
}
\`\`\`

示例输入：用户说 "不对" 但没给替代方案，上下文也看不出原因。
示例输出：
\`\`\`json
null
\`\`\`

【反例——不要这样做】
❌ 错误：wrong_pattern = "AI 直接跑 npm install moment, 没先查项目有没有用别的时间库"
✅ 正确：wrong_pattern = "moment"   （只要库名本身，整句描述进 reasoning）

❌ 错误：wrong_pattern = "直接在 pipeline 里 emit 新 source 值"
✅ 正确：type 改 "practice"，wrong_pattern 留空    （找不到通用关键词时别硬写）

❌ 错误：wrong_pattern = "packages/core/src/scorer.ts 未判空"
✅ 正确：wrong_pattern = ""（项目内部路径无普适价值，type="practice"）`;

const INSTRUCTIONS_BLOCK = `【严格要求】
1. 只输出**一段** JSON（在 \`\`\`json fenced block 里）或字面量 \`null\`
2. 不要在 JSON 前后添加任何解释文字
3. 如果上下文信息不足以提取出有用的知识（例如用户只说"不对"但没给替代、或纠正内容太私人化），输出 \`null\`
4. trigger 要写得通用一些，让未来不同任务里都能匹配；不要把具体实现细节写进 trigger
5. wrong_pattern 必须是**可跨项目复用**的库名/API 符号/命令/配置键名。整句描述、项目内部路径、抽象动作描述一律不接受——找不到时就改 type="practice" 留空`;

// ========================================================================
// Retrofit prompt: 改写已有规则的 wrong_pattern 为通用关键词
// ========================================================================

export interface RetrofitInput {
  trigger: string;
  wrong_pattern: string;
  correct_pattern: string;
  reasoning: string;
  tags?: readonly string[];
}

/**
 * 给一条已存在的规则重抽 wrong_pattern 为通用关键词。
 * 输出契约：
 *   - 成功: 一行纯文本, 只有关键词 (多个用 | 分隔), 例如 "moment" 或 "axios|xhr"
 *   - 无法通用化: 字面量字符串 "null"
 *
 * 调用方不走 JSON 反序列化——严格一行文本，降容错成本。
 */
export function buildRetrofitPrompt(input: RetrofitInput): string {
  return [
    "你在改造一条旧知识条目的 wrong_pattern 字段。",
    "原字段是上一版 LLM 提取时抄进去的原始会话片段，现在要压成**可跨项目复用**的通用关键词。",
    "",
    "【原规则】",
    `trigger:         ${input.trigger}`,
    `wrong_pattern:   ${input.wrong_pattern}`,
    `correct_pattern: ${input.correct_pattern}`,
    `reasoning:       ${input.reasoning}`,
    input.tags?.length ? `tags:            ${input.tags.join(", ")}` : "",
    "",
    "【你要做的】",
    "从上面 4 个字段里抽出**可 substring 匹配**的通用关键词。",
    "",
    "【元原则】 (3 条必须全中)",
    "(a) 字面稳定 —— 跨项目跨团队，这串字符含义相同",
    "(b) 可 substring 命中 —— 在代码/命令/配置文本里会原样出现",
    "(c) 脱离上下文仍指向问题 —— 看到就知道踩坑，不必懂周围含义",
    "",
    "【允许的 18 类】",
    "A. 代码/语言:",
    "  A1 依赖/包/模块名 (moment, jQuery, @reduxjs/toolkit, lodash)",
    "  A2 API/方法/属性 (localStorage.getItem, document.write, eval(, innerHTML =)",
    "  A3 语法/关键字   (var [带空格], == , != , new Function(, with ()",
    "  A4 类型系统      (as any, : any, @ts-ignore, @ts-nocheck, Record<string, any>)",
    "  A5 框架反模式    (dangerouslySetInnerHTML, key={index}, v-html)",
    "B. 基础设施/命令:",
    "  B1 Git           (git push --force, git commit --no-verify, git reset --hard)",
    "  B2 包管理        (npm install -g, pip install --user, :latest)",
    "  B3 Shell 危险    (rm -rf /, chmod 777, sudo rm, umask 000, eval $)",
    "  B4 Docker        (`:latest` [字面], USER root, privileged: true, --cap-add=ALL)",
    "  B5 Kubernetes    (hostNetwork: true, runAsUser: 0, hostPath:)",
    "C. 配置/环境:",
    "  C1 配置键        (allowJs, strict: false, noImplicitAny: false)",
    "  C2 环境变量      (NODE_ENV=development, DEBUG=*, DISABLE_AUTH=)",
    "  C3 URL/网络      (http://, localhost:, 0.0.0.0/0)",
    "D. 数据/查询:",
    "  D1 SQL 反模式    (SELECT *, DROP TABLE, DELETE FROM [无 WHERE], OR 1=1)",
    "  D2 正则风险      (.*.*.*, (.+)+ 回溯炸弹)",
    "E. 安全/质量:",
    "  E1 凭证前缀      (AKIA, ghp_, sk_live_, SG.)",
    "  E2 XSS/反序列化  (innerHTML =, document.write(, eval(, new Function(, javascript:)",
    "  E3 测试/日志残留 (.only(, .skip(, xdescribe(, console.log(, print()",
    "",
    "多个候选用 `|` 分隔。每段 ≥3 字符，≤40 字符。",
    "",
    "【四条铁律】",
    "1. 最长公共片段 —— 宁要 `npm install` 一个短词，不要 `npm install --save moment^2.29`",
    "2. pipe 分多 variant —— 同概念多写法 `innerHTML =|innerHTML+=`",
    "3. 避免过度通用 —— 禁 `if`/`for`/`return`/`log(` 单独出现",
    "4. 不写正则 —— matcher 只做 substring, `\\d+` 不生效, 用字面前缀",
    "",
    "【禁止】",
    "❌ 整句自然语言 ('demote=0 时返回 currentTier', 'AI 没先查...')",
    "❌ 项目内部路径 (packages/..., @teamagent/..., src/...)",
    "❌ 项目内部函数/变量 (tierFromDemerit, calibrator.adjust)",
    "❌ 过度抽象 ('直接 emit 新 source 值')",
    "❌ 测试代码字面量 (\"tierFromDemerit(4, 'stable')\")",
    "❌ 超长字面量 (>40 字符)",
    "",
    "【输出格式】",
    "只输出一行纯文本：",
    "- 找到关键词 → 输出关键词本身 (如 `moment` 或 `innerHTML =|document.write(`)",
    "- 找不到通用关键词 → 输出字面量 `null`",
    "",
    "不要 JSON, 不要引号, 不要解释, 不要 ```fenced block。",
  ].filter(Boolean).join("\n");
}
