import type { KnowledgeEntry } from "@teamagent/types";

/**
 * Compile KnowledgeEntry[] into a `.cursorrules` plain-text string.
 *
 * Format per Cursor spec: one rule per paragraph separated by blank lines.
 * Each rule starts with `# {trigger}` header followed by the rule body.
 *
 * Pure function — no IO. The CLI layer handles file writes.
 */
export function compileCursorRules(entries: KnowledgeEntry[]): string {
  const active = entries.filter((e) => e.status === "active");
  if (active.length === 0) return "";

  const paragraphs = active.map(formatCursorEntry);
  return paragraphs.join("\n\n") + "\n";
}

function formatCursorEntry(entry: KnowledgeEntry): string {
  const header = `# ${entry.trigger || entry.id}`;
  const lines: string[] = [header, ""];

  if (entry.type === "avoidance" && entry.wrong_pattern) {
    lines.push(`Avoid: ${entry.wrong_pattern}`);
    lines.push(`Prefer: ${entry.correct_pattern}`);
  } else {
    lines.push(entry.correct_pattern);
  }

  lines.push(`Reason: ${entry.reasoning}`);
  return lines.join("\n");
}
