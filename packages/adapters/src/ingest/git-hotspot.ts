import type { CandidateItem } from "./candidate-md.js";

/**
 * git log --numstat 解析出的热点文件。
 *
 * numstat 每个 commit 形如：
 * ```
 * commit <sha>
 * <added> <removed> <path>
 * <added> <removed> <path>
 * ...
 * ```
 *
 * 文件被修改次数越多，越可能隐藏经验/坑。
 */
export interface GitHotspot {
  path: string;
  change_count: number;
}

const NUMSTAT_LINE = /^\s*(\d+|-)\s+(\d+|-)\s+(\S.*)$/;

export function parseGitHotspots(
  logOutput: string,
  opts: { threshold?: number } = {},
): GitHotspot[] {
  const threshold = opts.threshold ?? 3;
  const counts = new Map<string, number>();
  for (const line of logOutput.split(/\r?\n/)) {
    const m = line.match(NUMSTAT_LINE);
    if (!m) continue;
    const filePath = m[3]!;
    counts.set(filePath, (counts.get(filePath) ?? 0) + 1);
  }
  return [...counts.entries()]
    .filter(([, c]) => c >= threshold)
    .map(([path, change_count]) => ({ path, change_count }))
    .sort((a, b) => b.change_count - a.change_count);
}

export function hotspotsToCandidateItems(
  hotspots: GitHotspot[],
): CandidateItem[] {
  return hotspots.map((h) => ({
    label: `${h.path} (changed ${h.change_count} times)`,
  }));
}

export async function getGitNumstat(
  runner: (cmd: string, opts: { cwd?: string }) => Promise<string>,
  opts: { cwd?: string; sinceDays?: number } = {},
): Promise<string> {
  const since = opts.sinceDays
    ? `--since="${opts.sinceDays} days ago"`
    : "";
  const cmd = `git log ${since} --numstat --pretty=format:"commit %H"`;
  return runner(cmd, { cwd: opts.cwd });
}
