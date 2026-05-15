import type { NarrativeHit } from "./scan.js";

/**
 * M4-A pending warnings — 回合间负反馈的数据模型。
 *
 * Stop hook 扫到 ai-narrative 命中后 → formatPendingRecord → 写入文件
 * UserPromptSubmit hook 读文件 → selectTopForInjection → formatInjectionText → 注入 AI 上下文
 *
 * 本模块全部纯函数，IO (fs 读写) 由调用方承担。
 */

export interface PendingWarning {
  session_id: string;
  turn_index: number;
  knowledge_id: string;
  matched_snippet: string;
  rule_summary: string;
  confidence: number;
  correct_pattern: string;
  reasoning: string;
  at: string;
}

export interface PendingContext {
  session_id: string;
  turn_index: number;
  at: string;
}

export function formatPendingRecord(
  hit: NarrativeHit,
  ctx: PendingContext,
): PendingWarning {
  return {
    session_id: ctx.session_id,
    turn_index: ctx.turn_index,
    knowledge_id: hit.knowledge_id,
    matched_snippet: hit.matched_snippet,
    rule_summary: hit.rule_summary,
    confidence: hit.confidence,
    correct_pattern: hit.correct_pattern,
    reasoning: hit.reasoning,
    at: ctx.at,
  };
}

export function mergePending(
  existing: PendingWarning[],
  incoming: PendingWarning[],
): PendingWarning[] {
  const key = (p: PendingWarning) =>
    `${p.session_id}|${p.turn_index}|${p.knowledge_id}`;
  const seen = new Set(existing.map(key));
  const out = [...existing];
  for (const p of incoming) {
    if (!seen.has(key(p))) {
      out.push(p);
      seen.add(key(p));
    }
  }
  return out;
}

export function selectTopForInjection(
  pending: PendingWarning[],
  max: number,
): PendingWarning[] {
  return [...pending]
    .sort((a, b) => b.confidence - a.confidence)
    .slice(0, max);
}

export function formatInjectionText(warnings: PendingWarning[]): string {
  if (warnings.length === 0) return "";
  const lines = [
    "◈ TeamAgent observation from previous turn",
    "In your previous reply the following patterns triggered team rules:",
  ];
  for (const w of warnings) {
    const hint = w.correct_pattern || w.reasoning || w.rule_summary;
    lines.push(
      `- "${w.matched_snippet.trim()}" (rule ${w.knowledge_id}, conf ${w.confidence.toFixed(2)}): ${hint}`,
    );
  }
  lines.push("Please avoid such phrasing this turn and proceed based on evidence.");
  return lines.join("\n");
}
