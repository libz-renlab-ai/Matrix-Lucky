import type { KnowledgeEntry } from "@teamagent/types";

/**
 * 元原则（meta-principles）：每次 `teamagent init` 会注入的一组普适规则。
 *
 * 设计约束：
 * - source = "preset"
 * - scope.level = "global"（跨项目生效，但只在用户本机）
 * - 全部是 practice 型（advisory），不走 hook 拦截——元原则太普适，做不到精准
 *   wrong_pattern；只在 CLAUDE.md 里展示供 AI 参考
 * - confidence=0.6（suggest 档）：新用户可以按自己习惯 override/archive
 *
 * 如何修改：直接编辑本文件。用户可以在 init 后 `teamagent review` 看到、
 * 用 `teamagent pitfall` 记录自己的替代版本覆盖。
 */
export function getMetaPrinciples(
  now: () => Date = () => new Date(),
): KnowledgeEntry[] {
  const created = now().toISOString();
  return [
    // ── 保留 ──
    makePreset({
      id: "preset-tdd-cycle",
      category: "S",
      tags: ["tdd", "workflow"],
      trigger: "开始实现一个新功能或修 bug 时",
      correct: "先写失败测试（红）→ 写最小实现（绿）→ 重构（如需）→ commit；验证产出（跑测试、手动验证）后再声明完成",
      reason: "TDD 让接口设计先行；未经验证直接声明完成是常见错误，实际输出与预期可能偏差",
      created,
    }),
    makePreset({
      id: "preset-small-commits",
      category: "S",
      tags: ["git", "workflow"],
      trigger: "准备 git commit 时",
      correct: "一个 commit 只做一件概念上完整的事，tests 要过；commit message 说清'做了什么+为什么'",
      reason: "小 commit 让 review 容易、回滚粒度细、git bisect 有意义；批量提交会让 bug 定位变噩梦",
      created,
    }),
    makePreset({
      id: "preset-prefer-edit-over-create",
      category: "S",
      tags: ["scope", "workflow"],
      trigger: "准备新建一个文件完成某任务时",
      correct: "先确认项目里有没有已有文件能承载该改动；优先编辑现有文件，只在真的需要时才新建",
      reason: "不必要的新文件会让 reviewer 分心、让 import 关系复杂；大多数小改动应该在现有模块里完成",
      created,
    }),
    makeCanonicalPreset({
      id: "preset-search-web-before-trusting-memory",
      category: "K",
      tags: ["epistemics", "web-search", "groundedness"],
      trigger: "用户提到一个你没见过或不完全确定的概念、库名、API、术语时",
      correct: "不要凭记忆作答；优先用 WebSearch/WebFetch 或 mcp 搜索工具验证，再结合当前代码上下文作答",
      reason: "模型记忆会过时或臆造（幻觉）；用户用到的新概念常在训练数据截止之后出现。先搜索再作答可避免给出错误事实、误导用户",
      created,
    }),
    // ── 新增 ──
    makePreset({
      id: "preset-audience-adaptive",
      category: "K",
      tags: ["communication", "explanation"],
      trigger: "向用户讲解技术系统、方案、分析结果或操作流程时",
      correct: "先判断受众层级：非技术受众给功能骨架（做什么/为什么）不给实现细节；技术受众给机制层；所有受众都先结论后细节，从简到繁",
      reason: "技术细节会淹没非技术受众；过度简化会浪费技术受众时间；先匹配受众心智模型再调整深度，是最高效的讲解路径",
      created,
    }),
    makePreset({
      id: "preset-execute-not-analyze",
      category: "S",
      tags: ["execution", "workflow"],
      trigger: "收到明确的执行类任务（修 bug、实现功能、多步工作流、批量处理）时",
      correct: "执行完整序列到底，不要在分析/汇报阶段停下等待确认；只在遇到不可逆操作（删库、force push）或真正无法解决的歧义时才暂停",
      reason: "用户期望 AI 主动推进工作；频繁停下'先报告''先对齐'会割裂上下文、降低效率；完整执行再报结果是更好的节奏",
      created,
    }),
    makePreset({
      id: "preset-read-before-asserting",
      category: "K",
      tags: ["groundedness", "file-access"],
      trigger: "即将断言某文件/功能/模块不存在，或声称「计划文档还没实现」「这个路径没有内容」时",
      correct: "先用 Read 工具读取用户指向的路径，以实际文件内容为准，再基于真实内容推进；不要凭印象或对话历史断言存在性",
      reason: "AI 断言文件不存在但用户已指向具体路径是常见错误；实际文件可能已经存在或已实现，凭印象断言会误导用户并浪费调试时间",
      created,
    }),
    makePreset({
      id: "preset-full-pipeline-for-complex",
      category: "S",
      tags: ["workflow", "architecture", "planning"],
      trigger: "面对多组件、多阶段的复杂新功能或系统改造时",
      correct: "调研 → brainstorm+需求确认 → 设计文档 → 实现计划 → 执行；不得跳过前期设计直接写代码",
      reason: "跳过前期设计直接实现会导致架构返工；完整流水线确保需求对齐后再拆任务，执行时边界清晰、减少反复",
      created,
    }),
  ];
}

function makePreset(args: {
  id: string;
  category: "C" | "E" | "S" | "K";
  tags: string[];
  trigger: string;
  correct: string;
  reason: string;
  created: string;
}): KnowledgeEntry {
  return {
    id: args.id,
    scope: { level: "global" },
    category: args.category,
    tags: args.tags,
    type: "practice",
    nature: "subjective",
    trigger: args.trigger,
    wrong_pattern: "",
    correct_pattern: args.correct,
    reasoning: args.reason,
    confidence: 0.6,
    enforcement: "suggest",
    status: "active",
    hit_count: 0,
    success_count: 0,
    override_count: 0,
    evidence: { success_sessions: 0, success_users: 0, correction_sessions: 0 },
    created_at: args.created,
    last_hit_at: "",
    last_validated_at: args.created,
    source: "preset",
    conflict_with: [],
    current_tier: "experimental" as const,
    max_tier_ever: "experimental" as const,
    tier_entered_at: "",
    demerit: 0,
    demerit_last_updated: "",
    resurrect_count: 0,
    // M4-A: meta principles are abstract guidance (no literal wrong_pattern),
    // so they live in passive-knowledge channel — CLAUDE.md only, no runtime hook.
    channel: "passive-knowledge",
  };
}

/**
 * 高优先级团队规则——confidence 0.95、canonical 级。
 * 用于用户明确指定"必须每个版本都分发"的规则；它们在 CLAUDE.md 编译时
 * 会被 MMR 选择器优先挑中，不会被日常规则挤掉。
 */
function makeCanonicalPreset(args: {
  id: string;
  category: "C" | "E" | "S" | "K";
  tags: string[];
  trigger: string;
  correct: string;
  reason: string;
  created: string;
}): KnowledgeEntry {
  return {
    ...makePreset(args),
    confidence: 0.95,
    enforcement: "warn",
    current_tier: "canonical" as const,
    max_tier_ever: "canonical" as const,
    tier_entered_at: args.created,
  };
}
