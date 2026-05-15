import type { KnowledgeEntry } from "@teamagent/types";

/** L0 机械检查的结果。 */
export interface ValidationL0Result {
  ok: boolean;
  /** 具体失败项，如 "wrong_pattern_not_in_source"。ok=true 时为空数组。 */
  failed_checks: string[];
  notes?: string;
}

/** L1 / L2 LLM 检查的结果。 */
export interface ValidationLLMResult {
  ok: boolean;
  /** LLM 自评 0-1。 */
  confidence: number;
  /** 一两句人话解释（ok=false 时必填）。 */
  reason: string;
  /** 与哪些规则 id 矛盾（可选）。 */
  conflicts_with?: string[];
}

/** L0 输入（无 LLM，纯机械）。 */
export interface ValidateL0Input {
  entry: Partial<KnowledgeEntry>;
  /** 规则来源的源文（diff / transcript / 原 PR 评论等），L0 用它验证 wrong_pattern 确实存在。 */
  sourceText: string;
  /** 项目已有规则（用于 trigger 字面冲突检查）。 */
  existingRules: Pick<KnowledgeEntry, "id" | "trigger" | "wrong_pattern">[];
  /** 项目探测到的 stack（file_types 一致性检查）。 */
  projectStack: string[];
  /** 工作区根目录（L0 只看字符串合法性，不真的 stat）。 */
  workspaceRoot?: string;
}

/** L1 输入（Haiku）。 */
export interface ValidateL1Input {
  entry: KnowledgeEntry;
  /** 近似规则 top-k（embedding 召回），用于矛盾检测。 */
  similarRules: KnowledgeEntry[];
}

/** L2 输入（Sonnet）。 */
export interface ValidateL2Input {
  entry: KnowledgeEntry;
  /** 最近 20 次命中的真实 tool_input 样本，用于过拟合检测。 */
  recentHits: { tool_input: unknown; timestamp: string }[];
  /** 项目已有 stable+ 规则。 */
  existingSeniorRules: KnowledgeEntry[];
}

/**
 * Validator 统一接口。三级均可独立调用；
 * 任一级可返回 { ok: true, ... } 实现降级使用。
 */
export interface Validator {
  validateLevel0(input: ValidateL0Input): ValidationL0Result;
  validateLevel1(
    input: ValidateL1Input,
    callLLM: (prompt: string) => Promise<string>,
  ): Promise<ValidationLLMResult>;
  validateLevel2(
    input: ValidateL2Input,
    callLLM: (prompt: string) => Promise<string>,
  ): Promise<ValidationLLMResult>;
}
