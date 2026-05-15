import type { KnowledgeEntry } from "@teamagent/types";

/** 一条规则编译出的 skill artifact。Adapter 负责写到 skills 目录。 */
export interface SkillArtifact {
  ruleId: string;
  /** 子目录名（如 "my-rule-id"）；adapter 会拼到 SKILLS_DIR 下 */
  dirname: string;
  /** SKILL.md 文件内容（含 YAML frontmatter + body） */
  skillMd: string;
}

export interface SkillCompiler {
  /** 纯：把 entries 过滤 + 编译成 artifacts（空数组合法）。 */
  compile(entries: KnowledgeEntry[]): SkillArtifact[];
  /** IO：把 artifacts 写到 skills 目录。 */
  write(artifacts: SkillArtifact[]): Promise<{ written: string[]; skipped: string[] }>;
  /** IO：删除指定 ruleId 列表的 skill 目录（幂等，ENOENT 静默跳过）。 */
  cleanup(ruleIds: string[]): Promise<{ removed: string[] }>;
}
