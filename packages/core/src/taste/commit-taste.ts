/**
 * Tech-taste extraction from team commit history.
 * Pure function — no IO, no side-effects.
 */

export type CommitFingerprint = {
  author: string;
  subject: string;
  files: string[];
};

/**
 * Derive top-touched paths and coding style hints from a commit log.
 * - topPaths: up to 5 most-frequently changed file paths
 * - styleHints: detected conventions, e.g. 'conventional-commits'
 */
export function extractTaste(
  commits: CommitFingerprint[],
): { topPaths: string[]; styleHints: string[] } {
  const pathCount: Record<string, number> = {};
  for (const c of commits) {
    for (const f of c.files) {
      pathCount[f] = (pathCount[f] ?? 0) + 1;
    }
  }

  const topPaths = Object.entries(pathCount)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([p]) => p);

  const styleHints: string[] = [];
  const hasFix = commits.some(c => /^fix/i.test(c.subject));
  const hasFeat = commits.some(c => /^feat/i.test(c.subject));
  if (hasFix && hasFeat) {
    styleHints.push('conventional-commits');
  }

  return { topPaths, styleHints };
}
