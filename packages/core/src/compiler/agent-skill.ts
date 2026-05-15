import type { KnowledgeEntry } from "@teamagent/types";

const MAX_DESCRIPTION_LENGTH = 400;

/**
 * 把一条 KnowledgeEntry 渲染为 Claude Code skill 格式的 SKILL.md 字符串。纯函数。
 */
export function formatAsAgentSkill(entry: KnowledgeEntry): string {
  const summary = entry.reasoning.length > MAX_DESCRIPTION_LENGTH
    ? entry.reasoning.slice(0, MAX_DESCRIPTION_LENGTH - 1) + "…"
    : entry.reasoning;

  const frontmatter = [
    "---",
    `name: ${entry.id}`,
    `description: >`,
    `  ${summary}`,
    `  使用场景：${entry.trigger}`,
    `  触发关键词：${entry.trigger}`,
    "---",
  ].join("\n");

  const body: string[] = [
    "## 背景",
    "",
    entry.reasoning,
    "",
    "## 做法",
    "",
    "### ✅ 正确",
    "",
    entry.correct_pattern,
  ];

  if (entry.wrong_pattern) {
    body.push("", "### ❌ 错误", "", entry.wrong_pattern);
  }

  body.push(
    "",
    "## 元信息",
    "",
    `- Rule ID: ${entry.id}`,
    `- Tier: ${entry.current_tier}`,
    `- Confidence: ${entry.confidence.toFixed(2)}`,
    `- Source: ${entry.source}`,
  );

  return frontmatter + "\n\n" + body.join("\n") + "\n";
}
