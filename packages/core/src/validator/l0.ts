import type { ValidateL0Input, ValidationL0Result } from "@teamagent/ports";

const IMPORT_PATH_RE = /^[@a-zA-Z0-9_\-./]+$/;

// ── Jaccard token-overlap helper (embedding-conflict fallback) ──────────────

/**
 * Tokenise text into a Set of lowercase word tokens (≥2 chars).
 * Pure function; no IO.
 */
export function tokenSet(text: string): Set<string> {
  const tokens = text
    .toLowerCase()
    .split(/\W+/)
    .filter((t) => t.length >= 2);
  return new Set(tokens);
}

/**
 * Jaccard similarity between two token sets.
 * Returns 0 when both sets are empty (no conflict in that edge-case).
 */
export function jaccardSimilarity(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 && b.size === 0) return 0;
  let intersection = 0;
  for (const t of a) {
    if (b.has(t)) intersection++;
  }
  const union = a.size + b.size - intersection;
  return union === 0 ? 0 : intersection / union;
}

/**
 * Core identity + semantic fields that must be non-empty for a rule to be
 * meaningful. We intentionally keep this set small — Partial<KnowledgeEntry>
 * entries during extraction legitimately omit numeric/enum fields whose zod
 * defaults will be applied later. These three are the semantic minimum.
 */
const REQUIRED_FIELDS = ["id", "trigger", "correct_pattern"] as const;

/**
 * L0 机械检查——规则入库前的零成本门闸。纯函数，无 IO。
 *
 * 见 docs/superpowers/specs/2026-04-15-phase2-design-v2.md §5.3。
 *
 * 5 项检查：
 *  1. wrong_pattern 的字面量在 sourceText 里真存在（仅 type=avoidance）
 *  2. correct_pattern.import_path 字符串格式合法（如存在）
 *  3. scope.file_types 与项目 stack 有交集（如都非空）
 *  4. 与现有规则无 trigger 字面冲突
 *  5. 对 type=avoidance 的规则，scope.paths 非空且条目字符串合法
 */
export function validateLevel0(input: ValidateL0Input): ValidationL0Result {
  const failed: string[] = [];
  const { entry, sourceText, existingRules, projectStack } = input;

  // 1. wrong_pattern 在源文里真存在
  // B-049: align minimum token length with keyword-matcher's MIN_TOKEN_LENGTH=3
  // to prevent single-char patterns (e.g. "a") from trivially passing this check.
  const L0_MIN_TOKEN = 3;
  if (entry.type === "avoidance" && entry.wrong_pattern) {
    const patterns = entry.wrong_pattern
      .split("|")
      .map((s) => s.trim())
      .filter((s) => s.length >= L0_MIN_TOKEN);
    // If all tokens are shorter than minimum, treat as not-found (pattern is too vague)
    const hit = patterns.length > 0 && patterns.some((p) => sourceText.includes(p));
    if (!hit) failed.push("wrong_pattern_not_in_source");
  }

  // 2. import_path 字符串合法（字段若来自未来 schema 扩展，尚未在 KnowledgeEntry 里固化）
  const importPath = (entry as { correct_pattern_import_path?: unknown })
    .correct_pattern_import_path;
  if (typeof importPath === "string" && !IMPORT_PATH_RE.test(importPath)) {
    failed.push("invalid_import_path_format");
  }

  // 3. scope.file_types 与 stack 一致
  const fileTypes = entry.scope?.file_types;
  if (fileTypes && fileTypes.length > 0 && projectStack.length > 0) {
    const normalized = fileTypes.map((s) => s.replace(/^\*?\.?/, ""));
    const overlap = normalized.some((t) => projectStack.includes(t));
    if (!overlap) failed.push("file_types_stack_mismatch");
  }

  // 4. trigger 字面冲突（忽略与自己 id 相同的条目）
  if (entry.trigger) {
    const exists = existingRules.some(
      (r) => r.id !== entry.id && r.trigger === entry.trigger,
    );
    if (exists) failed.push("trigger_collision");
  }

  // 5. avoidance 规则 scope.paths 非空且格式合法
  if (entry.type === "avoidance") {
    const paths = entry.scope?.paths;
    if (!paths || paths.length === 0) {
      failed.push("scope_paths_empty");
    } else {
      const malformed = paths.some((p) => typeof p !== "string" || p.length === 0);
      if (malformed) failed.push("scope_paths_malformed");
    }
  }

  // 6. M3 type/wrong_pattern 对齐约束：
  //    matcher 解耦 type 后 (keyword-matcher.ts M3 洞1)，wrong_pattern 是真正的匹配
  //    开关。为防止 extractor 再产 "type=practice + wrong_pattern=X" 这种歧义组合，
  //    两边必须对齐：
  //      practice → 不描述可字面匹配的反模式，wrong_pattern 必须为空
  //      avoidance → 必须给出可匹配的 wrong_pattern，否则是空规则
  if (entry.type === "practice" && entry.wrong_pattern) {
    failed.push("practice_must_not_have_wrong_pattern");
  }
  if (entry.type === "avoidance" && !entry.wrong_pattern) {
    failed.push("avoidance_must_have_wrong_pattern");
  }

  // 7. wrong_pattern identical to correct_pattern (patterns conflict with each other)
  if (
    entry.wrong_pattern &&
    entry.correct_pattern &&
    entry.wrong_pattern.trim() !== "" &&
    entry.wrong_pattern.trim() === entry.correct_pattern.trim()
  ) {
    failed.push("wrong_correct_patterns_identical");
  }

  // 8. confidence out of [0, 1] range
  if (typeof entry.confidence === "number") {
    if (entry.confidence < 0 || entry.confidence > 1) {
      failed.push("confidence_out_of_range");
    }
  }

  // 9. missing required schema fields
  for (const field of REQUIRED_FIELDS) {
    const val = (entry as Record<string, unknown>)[field];
    if (val === undefined || val === null || val === "") {
      failed.push(`missing_required_field:${field}`);
    }
  }

  // 10. embedding conflict: rule body too similar to existing rules (Jaccard ≥ 0.85)
  //     Uses Jaccard token overlap on trigger + wrong_pattern (same fields available on
  //     both entry and existingRules, ensuring symmetric comparison).
  //     Only runs when entry has a non-empty wrong_pattern: trigger-only overlap
  //     causes false positives for related-but-distinct practice rules.
  const JACCARD_CONFLICT_THRESHOLD = 0.85;
  const entryWrongPattern = (entry.wrong_pattern ?? "").trim();
  if (entryWrongPattern.length > 0) {
    const entryBody = [entry.trigger ?? "", entryWrongPattern].join(" ");
    const entryTokens = tokenSet(entryBody);
    for (const existing of existingRules) {
      if (existing.id === entry.id) continue;
      const existingWrongPattern = (existing.wrong_pattern ?? "").trim();
      if (existingWrongPattern.length === 0) continue; // skip practice rules on other side too
      const existingBody = [existing.trigger ?? "", existingWrongPattern].join(" ");
      const existingTokens = tokenSet(existingBody);
      const sim = jaccardSimilarity(entryTokens, existingTokens);
      if (sim >= JACCARD_CONFLICT_THRESHOLD) {
        failed.push(`embedding_conflict:${existing.id}`);
        break; // report first conflict only to keep failed_checks clean
      }
    }
  }

  return {
    ok: failed.length === 0,
    failed_checks: failed,
    notes: failed.length ? `L0 failed: ${failed.join(", ")}` : undefined,
  };
}
