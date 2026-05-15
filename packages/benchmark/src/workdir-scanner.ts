import { readdir, readFile } from "node:fs/promises";
import path from "node:path";

const SOURCE_EXTS = new Set([".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs"]);
const SKIP_DIRS = new Set([".teamagent", ".claude", "node_modules", ".git", "dist", "build"]);

export async function scanWorkdirSources(workdir: string): Promise<string> {
  const chunks: string[] = [];
  await walk(workdir, chunks);
  return chunks.join("\n");
}

async function walk(dir: string, chunks: string[]): Promise<void> {
  let entries;
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const entry of entries) {
    if (entry.isDirectory()) {
      if (SKIP_DIRS.has(entry.name)) continue;
      await walk(path.join(dir, entry.name), chunks);
      continue;
    }
    if (!entry.isFile()) continue;
    const ext = path.extname(entry.name).toLowerCase();
    if (!SOURCE_EXTS.has(ext)) continue;
    try {
      const content = await readFile(path.join(dir, entry.name), "utf-8");
      chunks.push(`// FILE: ${entry.name}\n${content}`);
    } catch {
      // skip unreadable files
    }
  }
}
