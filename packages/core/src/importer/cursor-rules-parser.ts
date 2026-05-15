import { extractRuleBullets } from "./claude-md-parser.js";

/**
 * 纯函数：从 .cursorrules 文本抽取规则文本列表。
 *
 * .cursorrules 没有严格格式，实际遇到三种：
 * 1. bullet 列表（`-` / `*` / 编号） —— 和 CLAUDE.md 一样
 * 2. 空行分段的多段纯文本 —— 每段一条规则
 * 3. 一整坨散文 —— 当作单条规则
 *
 * 策略：
 * - 先尝试 CLAUDE.md 风格的 bullet 解析，若拿到 ≥1 条就用这个结果
 * - 否则按空行切段，过滤掉标题（`#` 开头）和空段
 * - 单段/散文 → 返回单元素数组（包含整段）
 */
export function extractCursorRules(content: string): string[] {
  const trimmed = content.trim();
  if (!trimmed) return [];

  // 先试 bullet 解析
  const bullets = extractRuleBullets(content);
  if (bullets.length > 0) return bullets;

  // 再试空行分段
  const paragraphs = trimmed
    .split(/\n\s*\n+/)
    .map((p) => p.trim())
    .filter((p) => p.length > 0)
    .filter((p) => !isMarkdownHeader(p));

  if (paragraphs.length >= 1) return paragraphs;

  // 兜底：整段做一条
  return [trimmed];
}

function isMarkdownHeader(text: string): boolean {
  // 单行且以 # 开头
  const firstLine = text.split("\n")[0]!;
  return text.split("\n").length === 1 && /^#{1,6}\s+/.test(firstLine);
}
