import type { MarkdownCompilerLike } from "@teamagent/core";
import { MarkdownCompiler } from "./markdown-compiler.js";
import { NestedRuleStoreCompiler } from "./nested-rule-store.js";

/**
 * 共享的规则编译器选择器（issue #42）。
 *
 * - 默认 → `NestedRuleStoreCompiler`（用户级 nested rule store）
 * - `legacy === true` 或 `TEAMAGENT_LEGACY_CLAUDE_MD=1` → 旧 CLAUDE.md 行为
 *
 * 这一层让 `analyze` / `calibrate` / `ingest` / `pitfall` 等命令复用一致的策略，
 * 不必每个 caller 重新实现 env 解析与构造分支。
 */
export interface CreateRuleCompilerOptions {
  /** Explicit override；undefined 时退回 env 检测。 */
  legacy?: boolean;
  /** Legacy 模式下使用的 CLAUDE.md 路径。默认由 caller 传入。 */
  claudeMdPath?: string;
  /** Nested 模式下使用的 rules 根目录。默认 `~/.claude/teamagent/rules`。 */
  rulesDir?: string;
  /** 时间 getter（测试可注入）。 */
  now?: () => string;
}

/**
 * 选择默认 markdown 出口 compiler。
 *
 * Legacy 模式下若 `claudeMdPath` 缺失会抛错——避免静默回退到 cwd。
 */
export function createRuleCompiler(opts: CreateRuleCompilerOptions = {}): MarkdownCompilerLike {
  const legacy = resolveLegacy(opts.legacy);
  if (legacy) {
    if (!opts.claudeMdPath) {
      throw new Error(
        "createRuleCompiler legacy mode 需要 claudeMdPath；nested 模式可省略",
      );
    }
    return new MarkdownCompiler(opts.claudeMdPath, opts.now);
  }
  return new NestedRuleStoreCompiler({
    rulesDir: opts.rulesDir,
    now: opts.now,
  });
}

function resolveLegacy(explicit: boolean | undefined): boolean {
  if (explicit !== undefined) return explicit;
  const env = process.env["TEAMAGENT_LEGACY_CLAUDE_MD"];
  if (env === undefined) return false;
  return env === "1" || env.toLowerCase() === "true" || env.toLowerCase() === "yes";
}
