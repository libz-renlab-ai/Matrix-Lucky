import type { KnowledgeEntry } from "@teamagent/types";
import { matchRules as keywordMatch, type ToolCallContext } from "./legacy/keyword-matcher.js";
import { initAstMatcher, isInsideCommentOrString } from "./legacy/ast-context.js";

export interface MatchContext {
  file_path?: string;
  content?: string;
  [key: string]: unknown;
}

export interface MatchResult {
  matched: KnowledgeEntry[];
}

/** 文档类扩展名：不做代码规则匹配 */
const DOC_EXTENSIONS = new Set(["md", "rst", "txt", "mdx"]);

/** 文件扩展名 → tree-sitter 语言名 */
const EXT_TO_LANG: Record<string, string> = {
  ts: "typescript",
  tsx: "typescript",
  js: "javascript",
  jsx: "javascript",
  py: "python",
};

function fileExt(filePath: string | undefined): string | undefined {
  if (!filePath) return undefined;
  return filePath.split(".").pop()?.toLowerCase();
}

/**
 * async matchRules：在 keyword-matcher 基础上加两层过滤：
 * 1. .md/.rst/.txt 文件直接跳过（文档不参与代码规则匹配）
 * 2. 代码文件做 AST 过滤：comment/string 内的命中忽略
 */
export async function matchRules(
  ctx: MatchContext,
  rules: KnowledgeEntry[],
  _deps: object,
): Promise<MatchResult> {
  const ext = fileExt(ctx.file_path);

  // 文档类文件不走代码规则
  if (ext && DOC_EXTENSIONS.has(ext)) {
    return { matched: [] };
  }

  // 先做关键词匹配（scope/status/pattern 全部在里面）
  const toolCtx: ToolCallContext = {
    toolName: "Write",
    input: { ...ctx },
  };
  const candidates = keywordMatch(toolCtx, rules);

  if (candidates.length === 0) return { matched: [] };

  // 如果有 content + 可识别语言 → AST 过滤
  const content = typeof ctx.content === "string" ? ctx.content : undefined;
  const lang = ext ? EXT_TO_LANG[ext] : undefined;

  if (!content || !lang) {
    return { matched: candidates };
  }

  await initAstMatcher();

  const filtered: KnowledgeEntry[] = [];
  for (const rule of candidates) {
    if (!rule.wrong_pattern) {
      filtered.push(rule);
      continue;
    }

    // 检查该规则是否在 content 中有至少一个不在 comment/string 内的命中
    const patterns = rule.wrong_pattern.split("|").map(p => p.trim()).filter(p => p.length >= 3);
    let hasRealHit = false;

    for (const pattern of patterns) {
      let offset = content.toLowerCase().indexOf(pattern.toLowerCase());
      while (offset !== -1) {
        if (!isInsideCommentOrString(content, offset, lang)) {
          hasRealHit = true;
          break;
        }
        offset = content.toLowerCase().indexOf(pattern.toLowerCase(), offset + 1);
      }
      if (hasRealHit) break;
    }

    if (hasRealHit) filtered.push(rule);
  }

  return { matched: filtered };
}
