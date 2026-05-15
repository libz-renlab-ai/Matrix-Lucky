import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, rmSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { openDb } from "@teamagent/adapters";
import type { GroupConfig } from "./types.js";

export async function createGroupWorkdir(
  group: GroupConfig,
  hookDir: string,
): Promise<string> {
  const templatePath = path.join(group.fixtureDir, "settings.template.json");
  if (!existsSync(templatePath)) {
    throw new Error(`settings.template.json not found in ${group.fixtureDir}`);
  }

  const wd = mkdtempSync(path.join(tmpdir(), `teamagent-bench-${group.name}-`));
  try {
    mkdirSync(path.join(wd, ".claude"), { recursive: true });
    mkdirSync(path.join(wd, ".teamagent"), { recursive: true });

    const template = readFileSync(templatePath, "utf8");
    const substituted = template.replaceAll("{{HOOK_DIR}}", hookDir.replaceAll("\\", "/"));
    writeFileSync(path.join(wd, ".claude", "settings.local.json"), substituted);

    const dbPath = path.join(wd, ".teamagent", "knowledge.db");
    const db = openDb(dbPath);
    try {
      const seedPath = path.join(group.fixtureDir, "seed.sql");
      if (existsSync(seedPath)) {
        const sql = readFileSync(seedPath, "utf8");
        db.exec(sql);
      }
    } finally {
      db.close();
    }

    return wd;
  } catch (e) {
    cleanupGroupWorkdir(wd);
    throw e;
  }
}

export function cleanupGroupWorkdir(workdir: string): void {
  try {
    rmSync(workdir, { recursive: true, force: true });
  } catch {
    // already gone — ignore
  }
}
