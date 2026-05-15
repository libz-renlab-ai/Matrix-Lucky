import { z } from "zod";
import type { ExtractionInput } from "@teamagent/ports";

/**
 * Claude Code /insights 报告的宽松解析。
 *
 * 期望 JSON 形状（宽松）：
 * ```json
 * {
 *   "insights": [
 *     { "type": "correction" | "pattern" | ..., "text": "...", "weight": 0-1 }
 *   ]
 * }
 * ```
 *
 * - weight 缺省 0.7
 * - type 作为 prefix 拼入 context（方便 LLM 分辨）
 * - 顶层非对象 / 缺 insights 字段 → 抛错由上游处理
 */
const InsightItemSchema = z.object({
  type: z.string(),
  text: z.string().min(1),
  weight: z.number().min(0).max(1).default(0.7),
});

const InsightsReportSchema = z.object({
  insights: z.array(InsightItemSchema),
});

export function parseInsightsReport(raw: string): ExtractionInput[] {
  const parsed = InsightsReportSchema.parse(JSON.parse(raw));
  return parsed.insights.map((item) => ({
    kind: "insights" as const,
    context: `[type=${item.type}] ${item.text}`,
    weight: item.weight,
  }));
}
