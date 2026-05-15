import os from "node:os";
import path from "node:path";
import fs from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { formatAsAgentSkill } from "@teamagent/core";
import type { SkillCompiler, SkillArtifact } from "@teamagent/ports";
import type { KnowledgeEntry } from "@teamagent/types";

const DEFAULT_DIR = path.join(os.homedir(), ".claude", "skills", "teamagent");
const STABLE_PLUS = new Set(["stable", "canonical", "enforced"]);

export interface SkillCompilerOptions {
  skillsDir?: string; // 默认读 TEAMAGENT_SKILLS_DIR env，再 fallback DEFAULT_DIR
}

export function makeSkillCompiler(opts: SkillCompilerOptions = {}): SkillCompiler {
  const dir = opts.skillsDir ?? process.env.TEAMAGENT_SKILLS_DIR ?? DEFAULT_DIR;

  return {
    compile(entries: KnowledgeEntry[]): SkillArtifact[] {
      return entries
        .filter((e) => e.status === "active" && STABLE_PLUS.has(e.current_tier))
        .map((e) => ({
          ruleId: e.id,
          dirname: e.id,
          skillMd: formatAsAgentSkill(e),
        }));
    },

    async write(artifacts: SkillArtifact[]): Promise<{ written: string[]; skipped: string[] }> {
      const written: string[] = [];
      const skipped: string[] = [];
      for (const a of artifacts) {
        const ruleDir = path.join(dir, a.dirname);
        await fs.mkdir(ruleDir, { recursive: true });
        const filePath = path.join(ruleDir, "SKILL.md");
        // 原子写（Windows 下 rename 到已存在文件需先 unlink）
        const tmp = `${filePath}.tmp-${process.pid}-${randomUUID()}`;
        await fs.writeFile(tmp, a.skillMd, "utf-8");
        try {
          await fs.rename(tmp, filePath);
        } catch (e: unknown) {
          if ((e as NodeJS.ErrnoException).code === "EPERM") {
            await fs.unlink(filePath).catch(() => {});
            await fs.rename(tmp, filePath);
          } else {
            await fs.unlink(tmp).catch(() => {});
            throw e;
          }
        }
        written.push(a.ruleId);
      }
      return { written, skipped };
    },

    async cleanup(ruleIds: string[]): Promise<{ removed: string[] }> {
      const removed: string[] = [];
      for (const id of ruleIds) {
        const ruleDir = path.join(dir, id);
        try {
          await fs.rm(ruleDir, { recursive: true, force: true });
          removed.push(id);
        } catch {
          // 幂等，忽略
        }
      }
      return { removed };
    },
  };
}
