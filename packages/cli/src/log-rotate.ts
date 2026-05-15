/**
 * B-093: simple size-based log rotation. logError variants used to call
 * `appendFileSync` unconditionally, so any high-frequency error source (and
 * historical pollution from B-085-era tests that wrote into ~/.teamagent/
 * before TEAMAGENT_HOME was honored) could grow the file unbounded — tests
 * had already accumulated 613KB / 3479 lines on a real machine.
 *
 * The rotation rule is intentionally simple:
 *   - When the current log exceeds `maxBytes`, rename it to `<path>.1`
 *     (overwriting any prior `.1`).
 *   - Start a fresh empty file at `<path>` for the new append.
 *
 * Single rotation tier is enough for an error log: real prod errors are rare,
 * and the goal is to bound disk usage, not to preserve archaeology.
 */
import { existsSync, renameSync, statSync, unlinkSync } from "node:fs";

export const DEFAULT_MAX_LOG_BYTES = 256 * 1024;

export function rotateIfTooLarge(logPath: string, maxBytes = DEFAULT_MAX_LOG_BYTES): void {
  if (!existsSync(logPath)) return;
  let size: number;
  try {
    size = statSync(logPath).size;
  } catch {
    return;
  }
  if (size <= maxBytes) return;
  const archivePath = `${logPath}.1`;
  try {
    if (existsSync(archivePath)) {
      try { unlinkSync(archivePath); } catch { /* ignore */ }
    }
    renameSync(logPath, archivePath);
  } catch {
    // best-effort: if rename fails (file locked on Windows), the next append
    // continues into the same file — caller stays unblocked.
  }
}
