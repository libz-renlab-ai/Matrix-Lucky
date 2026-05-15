import type { ExtractionInput } from "@teamagent/ports";

/**
 * `gh pr view <n> --json reviews` 的宽松解析。
 *
 * 期望 JSON：
 * ```json
 * {
 *   "reviews": [
 *     { "body": "...", "state": "COMMENTED" | "CHANGES_REQUESTED" | "APPROVED" }
 *   ]
 * }
 * ```
 *
 * - body 太短（<10 字符）丢弃，避免 "lgtm" 类噪声
 * - CHANGES_REQUESTED 权重 0.9；COMMENTED 0.5；APPROVED 不摄入（无信号）
 */
export function parseGhPrReviews(raw: string): ExtractionInput[] {
  let data: unknown;
  try {
    data = JSON.parse(raw);
  } catch {
    return [];
  }
  if (!data || typeof data !== "object") return [];
  const reviews = (data as Record<string, unknown>).reviews;
  if (!Array.isArray(reviews)) return [];

  const out: ExtractionInput[] = [];
  for (const r of reviews) {
    if (!r || typeof r !== "object") continue;
    const body = typeof (r as any).body === "string" ? (r as any).body : "";
    const state = typeof (r as any).state === "string" ? (r as any).state : "";
    if (body.trim().length < 10) continue;
    if (state === "APPROVED") continue;
    const weight = state === "CHANGES_REQUESTED" ? 0.9 : 0.5;
    out.push({
      kind: "pr-review",
      context: `[state=${state || "unknown"}] ${body}`,
      weight,
    });
  }
  return out;
}

/** 调 gh CLI 拿 PR reviews JSON。缺 gh → 抛明确错。 */
export async function getGhPrReviews(
  prNumber: number,
  runner: (cmd: string) => Promise<string>,
): Promise<string> {
  return runner(`gh pr view ${prNumber} --json reviews`);
}

/** 判断 gh CLI 是否可用（hard-fail 前的 precheck）。 */
export async function isGhAvailable(
  runner: (cmd: string) => Promise<string>,
): Promise<boolean> {
  try {
    await runner("gh --version");
    return true;
  } catch {
    return false;
  }
}
