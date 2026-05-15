/**
 * Claude Code Hook 协议类型。
 *
 * 协议来源：M2 Day 1 调查（2026-04-14），基于 Anthropic 官方文档
 * https://docs.claude.com/en/docs/claude-code/hooks
 *
 * 设计决策：见同目录下 hook-protocol.md（如有）或 docs/specs。
 */

/** PreToolUse hook 从 stdin 读到的 JSON 结构。 */
export interface PreToolUseInput {
  session_id: string;
  hook_event_name: "PreToolUse";
  cwd: string;
  permission_mode:
    | "default"
    | "plan"
    | "acceptEdits"
    | "auto"
    | "dontAsk"
    | "bypassPermissions";
  transcript_path: string;
  tool_name: string;
  tool_input: Record<string, unknown>;
  tool_use_id: string;
  /** 仅子 agent 中出现 */
  agent_id?: string;
  /** 仅子 agent 中出现 */
  agent_type?: string;
}

/** PostToolUse hook 从 stdin 读到的 JSON——比 PreToolUse 多 tool_response。 */
export interface PostToolUseInput
  extends Omit<PreToolUseInput, "hook_event_name"> {
  hook_event_name: "PostToolUse";
  tool_response: Record<string, unknown>;
}

/**
 * Hook stdout 返回的 JSON。
 *
 * 关键设计决策：
 * - 拦截（block）：使用 exit 2 + stderr 短文本（最简单可靠）
 *                 或 exit 0 + permissionDecision="deny"
 * - 通过 + 给 AI 反馈：exit 0 + {systemMessage, additionalContext, allow}
 * - 完全通过：exit 0 + 空输出
 *
 * Phase 1 选择 "exit 0 + JSON 决策"（结构化，便于多场景表达）。
 * 失败时（如 store 损坏）退化为 "exit 0 + 空输出"，确保不阻断用户工作流。
 */
export interface HookOutput {
  /** 是否继续后续逻辑。默认 true。 */
  continue?: boolean;
  /** 注入给 AI 的系统消息（在工具调用前/后见到）。 */
  systemMessage?: string;
  hookSpecificOutput?: {
    hookEventName: "PreToolUse" | "PostToolUse";
    /** 决策：deny 拦截 / ask 转人工确认 / allow 通过 */
    permissionDecision?: "deny" | "ask" | "allow";
    /** 拦截原因，配合 deny 使用 */
    permissionDecisionReason?: string;
    /** 给 AI 看的额外上下文（不阻断执行） */
    additionalContext?: string;
    /** 替换原始 tool_input（PreToolUse 才有意义；Phase 2 用） */
    updatedInput?: Record<string, unknown>;
  };
}
