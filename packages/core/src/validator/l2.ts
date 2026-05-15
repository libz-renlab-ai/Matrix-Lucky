import type {
  ValidateL2Input,
  ValidationLLMResult,
} from "@teamagent/ports";
import { parseLLMValidation } from "./l1.js";

/**
 * L2 Sonnet validator——晋升 canonical/enforced 前跑深度检查。
 *
 * 关注点（与 L1 不同）：
 * - 过拟合：规则是否只对某一类项目/代码风格有效？（看 recentHits 样本）
 * - 冗余：是否与已有 stable+ 规则本质上重复？
 *
 * IO（LLM 调用）通过 callLLM 注入。此函数本身纯。
 */
export async function validateLevel2(
  input: ValidateL2Input,
  callLLM: (prompt: string) => Promise<string>,
): Promise<ValidationLLMResult> {
  const prompt = buildL2Prompt(input);
  let raw: string;
  try {
    raw = await callLLM(prompt);
  } catch (e) {
    return {
      ok: false,
      confidence: 0,
      reason: `llm_error: ${String(e).slice(0, 120)}`,
    };
  }
  return parseLLMValidation(raw);
}

function buildL2Prompt(input: ValidateL2Input): string {
  const entry = input.entry;
  const samples = input.recentHits.slice(0, 20);
  return [
    "你是规则质量审查官（L2，Sonnet 级深度检查）。",
    "目标：判断这条规则晋升到 canonical/enforced 级别是否合适。",
    "",
    "主要判别两件事：",
    "  1) 过拟合：样本 tool_input 是否都是同一类项目/同一类情形？若是，规则可能对其它场景误拦。",
    "  2) 冗余：是否与某条已有 senior 规则本质上重复（同 trigger 同 pattern）？",
    "",
    "【待审规则】",
    JSON.stringify(
      {
        id: entry.id,
        trigger: entry.trigger,
        wrong_pattern: entry.wrong_pattern,
        correct_pattern: entry.correct_pattern,
        reasoning: entry.reasoning,
        scope: entry.scope,
        current_tier: entry.current_tier,
      },
      null,
      2,
    ),
    "",
    "【最近 20 次命中的 tool_input 样本】",
    samples.length > 0
      ? samples
          .map(
            (s, i) =>
              `${i + 1}. [${s.timestamp}] ${truncate(JSON.stringify(s.tool_input ?? null), 160)}`,
          )
          .join("\n")
      : "(无样本)",
    "",
    "【已有 senior 规则（canonical/enforced）】",
    input.existingSeniorRules.length > 0
      ? input.existingSeniorRules
          .map((r) => `- ${r.id} [${r.current_tier}]: ${r.trigger}`)
          .join("\n")
      : "(无)",
    "",
    "【输出要求】",
    "严格输出一段 JSON（可包裹在 ```json fenced block 里）：",
    '{"ok": true|false, "confidence": 0-1, "reason": "一两句人话", "conflicts_with": ["id1"]}',
    "- 若判定过拟合或冗余，ok=false 且 reason 指明哪个",
    "- confidence 是你对本判断的把握度",
  ].join("\n");
}

function truncate(s: string, max: number): string {
  return s.length > max ? s.slice(0, max) + "…" : s;
}
