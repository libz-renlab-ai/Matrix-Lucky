import type { ExtractionInput, ExtractionKind } from "@teamagent/ports";

/**
 * 半自动源（git-hotspot / ci-failure）的候选 markdown 格式。
 *
 * 文件形如：
 * ```md
 * # TeamAgent ingest candidates (git-hotspot)
 * <!-- teamagent-candidate-source: git-hotspot -->
 *
 * 勾选 [x] 后运行: teamagent ingest --from-candidates <this-file>
 *
 * - [ ] src/foo.ts (changed 5 times)
 * - [x] src/bar.ts (changed 12 times)
 * ```
 */

export type CandidateSource = "git-hotspot" | "ci-failure";

export interface CandidateItem {
  /** 展示给用户的一行文字（不含 `- [ ]` 前缀） */
  label: string;
  /** 可选额外信息，写在 label 之后的缩进 meta 行 */
  meta?: string;
}

const SOURCE_COMMENT_RE = /<!--\s*teamagent-candidate-source:\s*([\w-]+)\s*-->/;
const CHECKBOX_LINE_RE = /^\s*-\s*\[([ xX])\]\s+(.+?)\s*$/;

export function formatCandidateMd(
  source: CandidateSource,
  items: CandidateItem[],
  opts: { generatedAt?: string } = {},
): string {
  const lines: string[] = [];
  lines.push(`# TeamAgent ingest candidates (${source})`);
  lines.push(`<!-- teamagent-candidate-source: ${source} -->`);
  if (opts.generatedAt) {
    lines.push(`<!-- generated-at: ${opts.generatedAt} -->`);
  }
  lines.push("");
  lines.push("勾选 `[x]` 保留想摄入的候选，然后跑：");
  lines.push("");
  lines.push("```");
  lines.push(`teamagent ingest --from-candidates <this-file>`);
  lines.push("```");
  lines.push("");
  if (items.length === 0) {
    lines.push("_(无候选)_");
  } else {
    for (const item of items) {
      lines.push(`- [ ] ${item.label}`);
      if (item.meta) lines.push(`      ${item.meta}`);
    }
  }
  return lines.join("\n") + "\n";
}

export interface ParsedCandidates {
  source: CandidateSource;
  /** 被用户 [x] 勾选的行（已去 checkbox 前缀） */
  checked: string[];
}

export function parseCandidateMd(md: string): ParsedCandidates {
  const sourceMatch = md.match(SOURCE_COMMENT_RE);
  if (!sourceMatch) {
    throw new Error(
      "candidate md 缺少 <!-- teamagent-candidate-source: ... --> 标记",
    );
  }
  const source = sourceMatch[1] as CandidateSource;
  if (source !== "git-hotspot" && source !== "ci-failure") {
    throw new Error(`未知 candidate source: ${source}`);
  }
  const checked: string[] = [];
  for (const line of md.split(/\r?\n/)) {
    const m = line.match(CHECKBOX_LINE_RE);
    if (!m) continue;
    const mark = m[1]!;
    if (mark !== "x" && mark !== "X") continue;
    checked.push(m[2]!);
  }
  return { source, checked };
}

/** 把 parseCandidateMd 结果转成 ExtractionInput[]。 */
export function candidatesToExtractionInputs(
  parsed: ParsedCandidates,
): ExtractionInput[] {
  const kind: ExtractionKind = parsed.source;
  return parsed.checked.map((label) => ({
    kind,
    context: label,
    weight: 0.5,
  }));
}
