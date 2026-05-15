import type { KnowledgeEntry } from "@teamagent/types";
import { normalizeChannel } from "@teamagent/types";

/**
 * M4-A 叙事扫描器。
 *
 * 在 Stop hook pipeline 尾部运行：
 * - 读取最近一轮 AI assistant 输出文本
 * - 对所有 channel=ai-narrative 且 status=active 的规则做子串匹配
 * - 命中则产出 NarrativeHit 供后续写入 pending_warnings
 *
 * 纯函数，无 IO 副作用。复用与 PreToolUse matcher 相同的切词策略。
 */

export interface NarrativeHit {
  knowledge_id: string;
  matched_snippet: string;
  rule_summary: string;
  confidence: number;
  correct_pattern: string;
  reasoning: string;
}

const MIN_ASCII_TOKEN_LENGTH = 3;
const MIN_CJK_TOKEN_LENGTH = 2;

/**
 * 切分 `|`-分隔的规则关键词。
 * 保留策略：
 *  - 含非 ASCII（CJK、emoji 等）的 token：≥ 2 字符即保留（"不对"、"错了"）
 *  - 纯 ASCII token：≥ 3 字符保留（避免 "a" / "of" 之类满屏乱中）
 *  - 全部被过滤时返回空数组（不 fallback 到原始 pipe 串——那样永远匹配不到）
 */
function splitPatterns(raw: string): string[] {
  // B-054: apply minimum length filter for BOTH single-pattern and pipe-separated cases.
  // Previously the no-pipe branch returned the full string without a length check,
  // meaning "a" (1 char) would match every AI response.
  const tokens: string[] = [];
  for (const piece of raw.split("|")) {
    const t = piece.trim();
    if (t.length === 0) continue;
    const hasNonAscii = /[^\x00-\x7f]/.test(t);
    const min = hasNonAscii ? MIN_CJK_TOKEN_LENGTH : MIN_ASCII_TOKEN_LENGTH;
    if (t.length >= min) tokens.push(t);
  }
  return tokens;
}

/**
 * Returns true if `text` contains `pattern` such that the match is not extended
 * by a letter or digit immediately after it. This prevents "product feature"
 * from firing inside "product features" (extra `s`).
 *
 * The extension check is only applied when the last char of `pattern` is a letter
 * or digit. Patterns ending in punctuation (`.`, `(`, `-`, `'`, etc.) use plain
 * includes() semantics so patterns like ".removeAt(" or "sk-" still work correctly.
 */
function containsNonExtending(textLower: string, patternLower: string): boolean {
  const lastChar = patternLower[patternLower.length - 1] ?? "";
  if (!isLetterOrDigit(lastChar)) {
    return textLower.includes(patternLower);
  }
  let offset = textLower.indexOf(patternLower);
  while (offset !== -1) {
    const afterIdx = offset + patternLower.length;
    const afterChar = afterIdx < textLower.length ? textLower[afterIdx]! : "";
    if (!isLetterOrDigit(afterChar)) return true;
    offset = textLower.indexOf(patternLower, offset + 1);
  }
  return false;
}

function isLetterOrDigit(ch: string): boolean {
  if (!ch) return false;
  const code = ch.charCodeAt(0);
  return (
    (code >= 97 && code <= 122) || // a-z
    (code >= 65 && code <= 90)  || // A-Z
    (code >= 48 && code <= 57)     // 0-9
  );
}

function isWordChar(ch: string): boolean {
  if (!ch) return false;
  const code = ch.charCodeAt(0);
  return (
    (code >= 97 && code <= 122) ||
    (code >= 65 && code <= 90)  ||
    (code >= 48 && code <= 57)  ||
    ch === "_" ||
    ch === "-"
  );
}

function snippet(haystack: string, needle: string, pad = 20): string {
  const idx = haystack.toLowerCase().indexOf(needle.toLowerCase());
  if (idx < 0) return needle;
  const start = Math.max(0, idx - pad);
  const end = Math.min(haystack.length, idx + needle.length + pad);
  return haystack.slice(start, end);
}

function summarize(rule: KnowledgeEntry): string {
  return rule.correct_pattern || rule.reasoning || rule.wrong_pattern || rule.id;
}

export function scanNarrative(
  text: string,
  rules: KnowledgeEntry[],
): NarrativeHit[] {
  if (!text) return [];
  if (rules.length === 0) return [];
  const hits: NarrativeHit[] = [];
  const lower = text.toLowerCase();
  for (const rule of rules) {
    if (rule.status !== "active") continue;
    if (!rule.wrong_pattern) continue;
    if (normalizeChannel((rule as any).channel) !== "ai-narrative") continue;
    const patterns = splitPatterns(rule.wrong_pattern);
    for (const p of patterns) {
      if (p.length === 0) continue;
      if (containsNonExtending(lower, p.toLowerCase())) {
        hits.push({
          knowledge_id: rule.id,
          matched_snippet: snippet(text, p),
          rule_summary: summarize(rule),
          confidence: rule.confidence,
          correct_pattern: rule.correct_pattern,
          reasoning: rule.reasoning,
        });
        break;
      }
    }
  }
  return hits;
}
