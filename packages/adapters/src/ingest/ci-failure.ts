import type { CandidateItem } from "./candidate-md.js";

/**
 * `gh run list --status=failure --json ...` 输出的失败跑。
 *
 * 期望 JSON（array of runs）：
 * ```json
 * [
 *   {
 *     "databaseId": 123,
 *     "name": "CI",
 *     "conclusion": "failure",
 *     "headBranch": "feat/x",
 *     "createdAt": "2026-04-10T..."
 *   }
 * ]
 * ```
 */
export interface CiFailedRun {
  id: number;
  name: string;
  branch: string;
  createdAt: string;
}

export function parseGhRunList(raw: string): CiFailedRun[] {
  let data: unknown;
  try {
    data = JSON.parse(raw);
  } catch {
    return [];
  }
  if (!Array.isArray(data)) return [];

  const out: CiFailedRun[] = [];
  for (const r of data) {
    if (!r || typeof r !== "object") continue;
    const row = r as Record<string, unknown>;
    if (typeof row.databaseId !== "number") continue;
    out.push({
      id: row.databaseId,
      name: typeof row.name === "string" ? row.name : "",
      branch: typeof row.headBranch === "string" ? row.headBranch : "",
      createdAt: typeof row.createdAt === "string" ? row.createdAt : "",
    });
  }
  return out;
}

export function runsToCandidateItems(runs: CiFailedRun[]): CandidateItem[] {
  return runs.map((r) => ({
    label: `Run #${r.id} (${r.name}, branch ${r.branch}) — ${r.createdAt}`,
  }));
}

export async function getGhRunList(
  runner: (cmd: string) => Promise<string>,
  opts: { sinceDays?: number; limit?: number } = {},
): Promise<string> {
  const limit = opts.limit ?? 30;
  // gh run list 支持 --limit 但没有直接的 --since；sinceDays 由上游进一步过滤
  return runner(
    `gh run list --status=failure --json databaseId,name,headBranch,createdAt,conclusion --limit ${limit}`,
  );
}

export async function getRunFailedLog(
  runId: number,
  runner: (cmd: string) => Promise<string>,
): Promise<string> {
  return runner(`gh run view ${runId} --log-failed`);
}

/** 基于 createdAt 过滤近 N 天 runs。 */
export function filterBySince(
  runs: CiFailedRun[],
  sinceDays: number | undefined,
  now: Date,
): CiFailedRun[] {
  if (!sinceDays || sinceDays <= 0) return runs;
  const cutoff = now.getTime() - sinceDays * 24 * 3600 * 1000;
  return runs.filter((r) => {
    const t = Date.parse(r.createdAt);
    return Number.isNaN(t) ? true : t >= cutoff;
  });
}
