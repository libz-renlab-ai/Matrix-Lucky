import fs from "node:fs";
import path from "node:path";

/**
 * B-094: clean up legacy `*.before-*` db backup files.
 *
 * Schema migrations have historically dropped backups next to the live db
 * (e.g. `events.db.before-no-passive-1777451204`). The migration code did
 * not impose a retention policy, so a long-lived `~/.teamagent/` could
 * accumulate one (potentially many MB) backup file per migration forever.
 *
 * Policy: keep the most recent `keep` backups per directory (default 1).
 * Anything older is unlinked. Best-effort — never throws so SessionStart
 * stays unblocked.
 *
 * "Backup" is recognized by the substring `.before-` anywhere in the name
 * (matches `events.db.before-no-passive-1777451204`,
 * `knowledge.db.before-foo-...`, etc.). We do not delete `.bak` files —
 * those belong to other components (e.g. install-hook settings backups).
 */
export function cleanupDbBackups(dir: string, keep = 1): void {
  let entries: fs.Dirent[];
  try {
    if (!fs.existsSync(dir)) return;
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return;
  }

  const candidates: Array<{ name: string; mtimeMs: number }> = [];
  for (const e of entries) {
    if (!e.isFile()) continue;
    if (!e.name.includes(".before-")) continue;
    try {
      const stat = fs.statSync(path.join(dir, e.name));
      candidates.push({ name: e.name, mtimeMs: stat.mtimeMs });
    } catch {
      // ignore unreadable entries
    }
  }

  if (candidates.length <= keep) return;

  candidates.sort((a, b) => b.mtimeMs - a.mtimeMs);
  for (const stale of candidates.slice(keep)) {
    try {
      fs.unlinkSync(path.join(dir, stale.name));
    } catch {
      // best-effort
    }
  }
}
