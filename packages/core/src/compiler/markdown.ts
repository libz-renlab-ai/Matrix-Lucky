import type { KnowledgeEntry } from "@teamagent/types";
import { scoreEntry } from "../scorer.js";

/**
 * CLAUDE.md 的 TEAMAGENT 标记。
 * 用户在标记之外的内容永远不会被动到。
 */
export const BLOCK_START = "<!-- TEAMAGENT:START - 自动管理，请勿手动编辑 -->";
export const BLOCK_END = "<!-- TEAMAGENT:END -->";

/** 默认总行数上限（含 START + header + END 标记行）。对齐 spec v5.2。 */
const DEFAULT_MAX_LINES = 50;
/** 扣除 header / footer / 空行留的 content 预算。 */
const DEFAULT_CONTENT_BUDGET = DEFAULT_MAX_LINES - 5;

/** 配置 compileMarkdownBlock 的选项。 */
export interface CompileMarkdownOptions {
  /**
   * 最大条目数。默认 45（= 50 行总预算 - 头尾空行）。
   * 超出时按 `scoreEntry` 降序取 top N；header 会显示 "Top N"。
   *
   * 用例：
   * - 更严格的 context 预算：传 20
   * - 大仓库多经验场景：传 100（需要 Claude 能 handle 更大上下文）
   */
  limit?: number;

  /**
   * 只编译这些 tier 的规则。默认 undefined = 不过滤（保持旧行为）。
   * M2.4 推荐传 ["canonical", "enforced"]。
   */
  tierFilter?: ReadonlyArray<"canonical" | "enforced" | "stable" | "probation" | "experimental">;

  /**
   * Token 预算硬上限。超过时按 score 截断并在 footer 加注。
   * 缺省 undefined = 不做 token 限制（回退到 limit 行数行为）。
   */
  tokenBudget?: number;

  /**
   * 计算字符串 token 数。默认用 Math.ceil(s.length / 3.5) 粗估。
   * Adapter 注入 js-tiktoken 得到精确值。
   */
  countTokens?: (s: string) => number;

  /**
   * MMR 多样性阈值 (0.0–1.0)。
   *
   * 按 score 降序遍历候选时，对每个候选与已选集做字符 3-gram Jaccard；
   * 若 max similarity >= threshold，跳过该候选（视为近义重复）。
   *
   * - undefined（默认）：不启用，保持旧行为
   * - 0.5–0.7 推荐：保留核心含义不同的规则，压掉同一话题的多个变体
   * - 1.0：等价于只跳过完全相同字符串（几乎不起作用，dedup 脚本已处理）
   */
  diversityThreshold?: number;

  /**
   * 只编译 source='preset' 的条目（元原则模式）。
   * 启用时输出 "TeamAgent 元原则" 头，忽略 limit/tokenBudget/tierFilter。
   */
  presetOnly?: boolean;
}

/** 字符 3-gram 集合。纯函数。 */
function charNgrams(text: string, n = 3): Set<string> {
  const s = text.replace(/\s+/g, " ").trim().toLowerCase();
  const out = new Set<string>();
  if (s.length < n) {
    if (s.length > 0) out.add(s);
    return out;
  }
  for (let i = 0; i <= s.length - n; i++) out.add(s.slice(i, i + n));
  return out;
}

/** Jaccard 相似度（两个集合交/并）。纯函数。 */
function jaccard(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 && b.size === 0) return 1;
  if (a.size === 0 || b.size === 0) return 0;
  let inter = 0;
  for (const x of a) if (b.has(x)) inter++;
  const union = a.size + b.size - inter;
  return union === 0 ? 0 : inter / union;
}

/**
 * B-062: escape TEAMAGENT block marker sequences in user-supplied entry text.
 * Prevents an entry whose trigger/correct_pattern/reasoning contains
 * "<!-- TEAMAGENT:END -->" from creating a false block-end marker in CLAUDE.md,
 * which would corrupt the document structure on the next compile pass.
 *
 * Uses a zero-width space (U+200B) to break the pattern invisibly.
 */
function sanitizeBlockMarkers(text: string): string {
  return text.replace(/TEAMAGENT:(START|END)/g, "TEAMAGENT​:$1");
}

/**
 * 把一条 KnowledgeEntry 渲染为一行 markdown bullet。纯函数。
 */
function formatEntry(entry: KnowledgeEntry): string {
  const conf = entry.confidence.toFixed(2);
  const hits = entry.hit_count > 0 ? `, ${entry.hit_count}次命中` : "";
  const sourceTag =
    entry.source === "team-shared" ? " [团队]" : entry.source === "preset" ? " [预置]" : "";
  // B-062: sanitize all user-controlled text fields to prevent TEAMAGENT block-marker injection
  const correct = sanitizeBlockMarkers(entry.correct_pattern);
  const wrong = sanitizeBlockMarkers(entry.wrong_pattern ?? "");
  const reason = sanitizeBlockMarkers(entry.reasoning);

  if (entry.type === "avoidance" && wrong) {
    return `- 使用 ${correct} 而非 ${wrong}——${reason} [${conf}${hits}]${sourceTag}`;
  }
  return `- ${correct}——${reason} [${conf}${hits}]${sourceTag}`;
}

/**
 * 把知识条目编译为 CLAUDE.md 区块文本（含 START/END 标记）。纯函数。
 *
 * @param entries - 候选条目（archived 会被过滤掉）
 * @param now - 当前时间（ISO 8601），用于 recency 评分
 */
export function compileMarkdownBlock(
  entries: KnowledgeEntry[],
  now: string,
  options: CompileMarkdownOptions = {},
): string {
  const limit = Math.max(1, options.limit ?? DEFAULT_CONTENT_BUDGET);
  const active = entries.filter((e) => e.status === "active");

  if (options.presetOnly) {
    const presets = active.filter((e) => e.source === "preset");
    if (presets.length === 0) {
      return [BLOCK_START, "## TeamAgent 元原则", "（无元原则）", BLOCK_END].join("\n");
    }
    const lines = presets.map((e) => formatEntry(e));
    return [BLOCK_START, "## TeamAgent 元原则", ...lines, BLOCK_END].join("\n");
  }

  const tierFiltered = options.tierFilter
    ? active.filter((e) => (options.tierFilter as ReadonlyArray<string>).includes(e.current_tier))
    : active;

  if (tierFiltered.length === 0) {
    return [BLOCK_START, "## TeamAgent 经验", "暂无经验，使用过程中会自动积累。", BLOCK_END].join("\n");
  }

  // 按综合分数排序（block 优先通过 enforcement 权重体现）
  const maxHitCount = Math.max(1, ...tierFiltered.map((e) => e.hit_count));
  const sorted = tierFiltered
    .map((e) => ({ entry: e, score: scoreEntry(e, maxHitCount, now) }))
    .sort((a, b) => b.score - a.score);

  const countFn = options.countTokens ?? ((s: string) => Math.ceil(s.length / 3.5));
  let usedTokens = 0;

  const lines: string[] = [];
  let truncatedCount = 0;
  let droppedByDiversity = 0;

  const threshold = options.diversityThreshold;
  const selectedNgrams: Array<Set<string>> = [];
  const entryFingerprint = (e: KnowledgeEntry): string =>
    [e.correct_pattern, e.wrong_pattern, e.reasoning].filter(Boolean).join(" ");

  for (const { entry } of sorted) {
    if (threshold !== undefined) {
      const fp = charNgrams(entryFingerprint(entry));
      let maxSim = 0;
      for (const prev of selectedNgrams) {
        const sim = jaccard(fp, prev);
        if (sim > maxSim) maxSim = sim;
        if (maxSim >= threshold) break;
      }
      if (maxSim >= threshold) {
        droppedByDiversity++;
        continue;
      }
      selectedNgrams.push(fp);
    }

    if (options.tokenBudget !== undefined) {
      const line = formatEntry(entry);
      const lineTokens = countFn(line);
      if (usedTokens + lineTokens > options.tokenBudget) {
        truncatedCount++;
        continue;
      }
      usedTokens += lineTokens;
      lines.push(line);
    } else {
      if (lines.length >= limit) break;
      lines.push(formatEntry(entry));
    }
  }

  const total = active.length;
  const shown = lines.length;

  let header: string;
  if (options.tokenBudget !== undefined) {
    if (truncatedCount > 0) {
      header = `## TeamAgent 经验（${total}条活跃知识，为你编译了 ${shown} 条（token 预算 ${options.tokenBudget}）)`;
    } else {
      header = `## TeamAgent 经验（${total}条活跃知识）`;
    }
  } else {
    header =
      total > shown
        ? `## TeamAgent 经验（${total}条活跃知识，为你编译了Top ${shown}）`
        : `## TeamAgent 经验（${total}条活跃知识）`;
  }

  const parts = [BLOCK_START, header, ...lines];
  if (truncatedCount > 0 && options.tokenBudget !== undefined) {
    parts.push(`> 还有 ${truncatedCount} 条 canonical+ 规则因 token 预算未显示（teamagent compile --dry-run 查看）`);
  }
  if (droppedByDiversity > 0) {
    parts.push(`> 另有 ${droppedByDiversity} 条因与已选条目近义（Jaccard ≥ ${threshold}）被多样性过滤`);
  }
  parts.push(BLOCK_END);
  return parts.join("\n");
}

/**
 * 把 block 注入到已有文档（CLAUDE.md）中。纯函数。
 *
 * - 文档已有 TEAMAGENT 标记（任何变体，只要含 "TEAMAGENT:START" / "TEAMAGENT:END"）：替换其中内容
 * - 文档没有标记：追加到末尾，前加空行分隔
 * - 空文档：只返回 block，末尾保证一个换行
 */
export function injectBlockIntoDoc(existing: string, block: string): string {
  const startTagRegex = /<!--\s*TEAMAGENT:START[^>]*-->/;
  const endTagRegex = /<!--\s*TEAMAGENT:END[^>]*-->/;

  const startMatch = existing.match(startTagRegex);
  const endMatch = existing.match(endTagRegex);

  if (
    startMatch &&
    endMatch &&
    startMatch.index !== undefined &&
    endMatch.index !== undefined &&
    endMatch.index > startMatch.index
  ) {
    const before = existing.slice(0, startMatch.index);
    const after = existing.slice(endMatch.index + endMatch[0].length);
    return before + block + after;
  }

  if (existing === "") {
    return block + "\n";
  }

  const trimmed = existing.replace(/\n+$/, "");
  return trimmed + "\n\n" + block + "\n";
}

/**
 * B-109: strip the legacy TEAMAGENT:START..END managed block from a doc.
 *
 * Background: PR #63 (2026-04-29) replaced the in-file CLAUDE.md rule dump
 * with skills/docs propagation. The new compile path no longer writes the
 * block, but any project that ran `compile` before #63 still has the block
 * sitting in CLAUDE.md, and `teamagent doctor` flags it. There was no
 * migration to remove it. This helper does that.
 *
 * Behavior:
 * - If no TEAMAGENT:START/END markers are present → returns input unchanged.
 * - If a well-formed block is present → removes the block and surrounding
 *   blank-line padding so the doc reads cleanly afterwards.
 * - Multiple blocks are removed (defensive — should not occur in practice).
 */
export function stripLegacyTeamagentBlock(existing: string): string {
  const startTagRegex = /<!--\s*TEAMAGENT:START[^>]*-->/;
  const endTagRegex = /<!--\s*TEAMAGENT:END[^>]*-->/;

  let out = existing;
  // Loop in case there is more than one block (legacy bug).
  // Bound iterations to avoid pathological loops.
  for (let i = 0; i < 8; i++) {
    const startMatch = out.match(startTagRegex);
    const endMatch = out.match(endTagRegex);
    if (
      !startMatch ||
      !endMatch ||
      startMatch.index === undefined ||
      endMatch.index === undefined ||
      endMatch.index <= startMatch.index
    ) {
      break;
    }
    let before = out.slice(0, startMatch.index);
    let after = out.slice(endMatch.index + endMatch[0].length);
    // Trim trailing blank lines on `before` and leading blank lines on
    // `after` so removal does not leave a double-blank gap.
    before = before.replace(/\n{2,}$/, "\n");
    after = after.replace(/^\n{2,}/, "\n");
    out = before + after;
  }
  // If the file is entirely the block (or block + trailing whitespace),
  // collapse to empty string rather than leaving stray newlines.
  if (out.trim() === "") return "";
  return out;
}
