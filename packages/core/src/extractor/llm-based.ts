import type {
  ExtractionInput,
  KnowledgeExtractor,
} from "@teamagent/ports";
import type { KnowledgeEntry } from "@teamagent/types";
import { buildExtractionPrompt } from "./prompt.js";

/**
 * 基于 LLM 的知识提取器。
 *
 * 纯函数：IO（LLM 调用）通过 callLLM 依赖注入传入，不直接 import 任何 IO 模块。
 * 返回 Partial<KnowledgeEntry> 只含 LLM 能可靠提取的 8 个字段；
 * 其余字段（id/confidence/enforcement/timestamps/evidence）由 Pipeline 补全。
 *
 * 返回 null 情况：
 * - LLM 明确输出字面量 `null`（表示信号太弱，不值得提取）
 * - 响应无法解析成合法 JSON
 * - 解析出的对象缺少必填字段或字段值非法
 */
export const llmBasedKnowledgeExtractor: KnowledgeExtractor = {
  async extract(
    input: ExtractionInput,
    callLLM: (prompt: string) => Promise<string>,
  ): Promise<Partial<KnowledgeEntry> | null> {
    const prompt = buildExtractionPrompt(input);
    const raw = await callLLM(prompt);
    return parseExtractionResponse(raw);
  },
};

/**
 * 解析 LLM 的响应文本。
 *
 * 鲁棒性：
 * 1. 先尝试从 ```json fenced block 里抽
 * 2. 检测字面量 `null`
 * 3. 退回尝试找第一段 { ... } JSON 块
 * 4. 字段白名单 + 枚举校验；任一必填字段缺失或非法 → null
 */
export function parseExtractionResponse(
  raw: string,
): Partial<KnowledgeEntry> | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;

  // 优先：``` 或 ```json 包裹的块
  const fenced = extractFencedJson(trimmed);
  const candidate = fenced ?? trimmed;

  // null 字面量（可能在 fenced block 里，也可能裸文）
  if (/^null$/i.test(candidate.trim())) return null;

  // 尝试直接 parse
  let obj = tryParseJson(candidate);
  if (!obj) {
    // 退回：找第一段 { ... } 块
    const braced = extractFirstBracedObject(trimmed);
    if (braced) obj = tryParseJson(braced);
  }
  if (!obj) return null;

  return validateExtractedFields(obj);
}

function extractFencedJson(text: string): string | null {
  const m = text.match(/```(?:json)?\s*\n?([\s\S]*?)\n?```/);
  return m ? m[1]!.trim() : null;
}

function extractFirstBracedObject(text: string): string | null {
  const start = text.indexOf("{");
  if (start < 0) return null;
  let depth = 0;
  for (let i = start; i < text.length; i++) {
    const c = text[i];
    if (c === "{") depth++;
    else if (c === "}") {
      depth--;
      if (depth === 0) return text.slice(start, i + 1);
    }
  }
  return null;
}

function tryParseJson(text: string): Record<string, unknown> | null {
  try {
    const v = JSON.parse(text);
    if (v && typeof v === "object" && !Array.isArray(v)) {
      return v as Record<string, unknown>;
    }
    return null;
  } catch {
    return null;
  }
}

const VALID_CATEGORY = new Set(["C", "E", "S", "K"]);
const VALID_TYPE = new Set(["avoidance", "practice"]);
const VALID_NATURE = new Set(["objective", "subjective"]);

function validateExtractedFields(
  raw: Record<string, unknown>,
): Partial<KnowledgeEntry> | null {
  const {
    category,
    tags,
    type,
    nature,
    trigger,
    wrong_pattern,
    correct_pattern,
    reasoning,
  } = raw;

  if (typeof category !== "string" || !VALID_CATEGORY.has(category)) return null;
  if (typeof type !== "string" || !VALID_TYPE.has(type)) return null;
  if (typeof nature !== "string" || !VALID_NATURE.has(nature)) return null;
  if (typeof trigger !== "string" || !trigger.trim()) return null;
  if (typeof correct_pattern !== "string" || !correct_pattern.trim()) return null;
  if (typeof reasoning !== "string" || !reasoning.trim()) return null;

  // tags 可选但类型必须是 string[]；缺失或类型错退回空数组
  let tagArr: string[] = [];
  if (Array.isArray(tags)) {
    tagArr = tags.filter((t): t is string => typeof t === "string" && t.trim() !== "");
  }

  // wrong_pattern 可空串；只检查类型
  const wp = typeof wrong_pattern === "string" ? wrong_pattern : "";

  return {
    category: category as "C" | "E" | "S" | "K",
    tags: tagArr,
    type: type as "avoidance" | "practice",
    nature: nature as "objective" | "subjective",
    trigger: trigger.trim(),
    wrong_pattern: wp,
    correct_pattern: correct_pattern.trim(),
    reasoning: reasoning.trim(),
  };
}
