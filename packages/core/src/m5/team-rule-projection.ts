import type {
  TeamRuleAlive,
  KnowledgeEntry,
} from "@teamagent/types";
import { computeEnforcement } from "@teamagent/types";

/**
 * 把 L2 团队规则投影成 KnowledgeEntry，用于写入 DualLayerStore。
 * 纯函数。
 */
export function teamRuleToKnowledgeEntry(
  ruleId: string,
  alive: TeamRuleAlive,
  originalAuthor: string,
  teamId: string | undefined
): KnowledgeEntry {
  const confidence = alive.confidence;
  const nature = "objective";  // team-shared 默认 objective
  const enforcement = computeEnforcement(confidence, nature);
  return {
    id: ruleId,
    scope: {
      level: "team",
      ...(teamId ? { project: teamId } : {}),
    },
    category: "K",  // K = knowledge / practice，最通用
    tags: ["m5-team-sync", `original-author:${originalAuthor}`],
    type: "practice",  // team rules 默认 practice
    nature,
    trigger: "",  // 没结构化字段——团队规则只有自由文本
    wrong_pattern: "",
    correct_pattern: "",
    reasoning: alive.content,
    confidence,
    enforcement,
    status: "active",
    hit_count: 0,
    success_count: 0,
    override_count: 0,
    evidence: { success_sessions: 0, success_users: 0, correction_sessions: 0 },
    created_at: alive.modified_ts,
    last_hit_at: "",
    last_validated_at: "",
    source: "team-shared",
    // 把 originalAuthor 编进 tags 便于追溯
    // 注意：source 字段是受约束 enum，不能塞自由字符串
    conflict_with: [],
    current_tier: "experimental",
    max_tier_ever: "experimental",
    tier_entered_at: alive.modified_ts,
    demerit: 0,
    demerit_last_updated: "",
    resurrect_count: 0,
  };
}
