/**
 * M5 团队病毒式传播 + 规则同步类型定义。
 * 跟随 docs/superpowers/specs/2026-05-06-m5-team-viral-sync-design.md。
 */

/** Hook 类型——与现有 Claude Code hook 对齐。 */
export type HookKind =
  | "UserPromptSubmit"
  | "PreToolUse"
  | "PostToolUse"
  | "Stop"
  | "SessionStart"
  | "SessionEnd"
  | "PreCompact";

/** 项目的 TeamAgent 契约清单。跟随项目 git 走。 */
export interface Manifest {
  /** 契约清单 schema 版本，向前兼容用。当前固定 1。 */
  schema_version: 1;
  /** 项目要求的 TeamAgent 版本（semver；空字符串表示不约束）。 */
  teamagent_version: string;
  /** 必备插件列表（按 name）。 */
  required_plugins: string[];
  /** 必备项目级 Skill 路径（相对项目根）。 */
  required_project_skills: string[];
  /** 必备 hook 锚点。 */
  required_hooks: HookKind[];
  /** 创建该 manifest 的 author。 */
  created_by: string;
  /** ISO 8601 时间戳。 */
  created_at: string;
}

/** 本机 TeamAgent 的当前安装状态。 */
export interface LocalState {
  /** 已装 teamagent 版本；null 表示未装。 */
  teamagent_version: string | null;
  /** 已装插件名集合。 */
  installed_plugins: string[];
  /** 已装项目级 skill 路径集合。 */
  installed_project_skills: string[];
  /** 已装 hook 集合。 */
  installed_hooks: HookKind[];
}

/** 传染器输出：要在项目里写入哪些文件。 */
export interface InfectionPlan {
  /** 是否需要执行（false 表示项目已被传染、不动）。 */
  required: boolean;
  /** 要新建的文件：相对路径 → 内容。 */
  files_to_create: Record<string, string>;
  /** 要新建的目录（若不存在则建）。 */
  dirs_to_create: string[];
}

/** 引导器输出：本机相对 manifest 的差异。 */
export interface BootstrapDiff {
  /** 是否需要做任何动作。 */
  needs_bootstrap: boolean;
  /** 需要装的 TeamAgent 版本（null 表示已达标）。 */
  install_teamagent_version: string | null;
  /** 需要装的插件。 */
  install_plugins: string[];
  /** 需要装的项目级 skill。 */
  install_project_skills: string[];
  /** 需要装的 hook。 */
  install_hooks: HookKind[];
}

/* ===== M5-B/C 团队共享层数据结构 ===== */

/** L2 团队共享层的规则存盘格式：.teamagent/team/<author>/<rule_id>.json */
export interface TeamRuleFile {
  rule_id: string;
  /** 原作者（lineage；首次创建该 rule_id 的人；改写时不变） */
  author: string;
  current: TeamRuleState;
}

export type TeamRuleState = TeamRuleAlive | TeamRuleTombstone;

export interface TeamRuleAlive {
  deleted: false;
  content: string;
  /** 0..1 置信度 */
  confidence: number;
  /** 最后修改者（可能 != author） */
  modified_by: string;
  /** ISO 8601 */
  modified_ts: string;
  scope: "team";
}

export interface TeamRuleTombstone {
  deleted: true;
  deleted_by: string;
  deleted_ts: string;
  reason?: string;
}
