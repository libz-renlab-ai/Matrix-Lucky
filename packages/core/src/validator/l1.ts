import type {
  ValidateL1Input,
  ValidationLLMResult,
} from "@teamagent/ports";

/**
 * L1 Haiku validator——晋升 stable 前跑一次语义检查。
 *
 * IO（LLM 调用）通过 callLLM 注入。此函数本身纯。
 */
export async function validateLevel1(
  input: ValidateL1Input,
  callLLM: (prompt: string) => Promise<string>,
): Promise<ValidationLLMResult> {
  const prompt = buildL1Prompt(input);
  let raw: string;
  try {
    raw = await callLLM(prompt);
  } catch (e) {
    return {
      ok: false,
      confidence: 0,
      reason: `llm_error: ${truncate(String(e), 120)}`,
    };
  }
  return parseLLMValidation(raw);
}

function buildL1Prompt(input: ValidateL1Input): string {
  const entry = input.entry;
  return [
    "你是规则质量审查官（L1，Haiku 级轻量语义检查）。",
    "请判断这条规则是否足够 specific，以及是否与近邻规则明显冲突。",
    "",
    "【待审规则】",
    JSON.stringify(
      {
        trigger: entry.trigger,
        wrong_pattern: entry.wrong_pattern,
        correct_pattern: entry.correct_pattern,
        reasoning: entry.reasoning,
        scope: entry.scope,
      },
      null,
      2,
    ),
    "",
    "【近邻规则（召回 top-k）】",
    input.similarRules.length > 0
      ? input.similarRules.map((r) => `- ${r.id}: ${r.trigger}`).join("\n")
      : "(无)",
    "",
    "【输出要求】",
    "严格输出一段 JSON（可包裹在 ```json fenced block 里）：",
    '{"ok": true|false, "confidence": 0-1, "reason": "一两句人话", "conflicts_with": ["id1"]}',
    "- ok=false 时 reason 必须说明为什么",
    "- confidence 是你对本判断的把握度（不是规则自身的 confidence）",
  ].join("\n");
}

/** 解析 LLM 响应为 ValidationLLMResult。garbage → ok=false，不抛。 */
export function parseLLMValidation(raw: string): ValidationLLMResult {
  const stripped = raw.trim().replace(/^```(?:json)?\s*\n?|\n?```$/g, "");
  let obj: unknown;
  try {
    obj = JSON.parse(stripped);
  } catch {
    return {
      ok: false,
      confidence: 0,
      reason: "llm_response_unparseable",
    };
  }
  if (!obj || typeof obj !== "object") {
    return { ok: false, confidence: 0, reason: "llm_response_not_object" };
  }
  const o = obj as Record<string, unknown>;
  const ok = typeof o.ok === "boolean" ? o.ok : false;
  const confidence =
    typeof o.confidence === "number"
      ? Math.max(0, Math.min(1, o.confidence))
      : 0;
  const reason = typeof o.reason === "string" && o.reason.trim() ? o.reason : "no_reason";
  const conflicts = Array.isArray(o.conflicts_with)
    ? o.conflicts_with.filter((x): x is string => typeof x === "string")
    : undefined;
  return {
    ok,
    confidence,
    reason,
    ...(conflicts && conflicts.length > 0 ? { conflicts_with: conflicts } : {}),
  };
}

function truncate(s: string, max: number): string {
  return s.length > max ? s.slice(0, max) + "…" : s;
}
