/**
 * Claude Code 会话日志的解析类型。
 *
 * 原始日志位于 ~/.claude/projects/{project-id}/{session-id}.jsonl，
 * 每行一个 JSON 对象，`type` 字段区分消息种类。
 */

/** 一次工具调用的记录。 */
export interface ToolCall {
  id: string;
  name: string;
  input: Record<string, unknown>;
  /** 执行结果，解析时可能没有（工具失败或未结束）。 */
  result?: string;
  /** 工具是否成功执行。undefined 表示未知。 */
  succeeded?: boolean;
}

/** 一次用户→助手的对话回合。 */
export interface SessionTurn {
  /** 回合在会话中的序号，从 0 开始 */
  turnIndex: number;
  /** 用户说的话 */
  userMessage: string;
  /** 助手的文本回复（拼接所有 text 块）*/
  assistantText: string;
  /** 助手在本回合内的所有工具调用 */
  toolCalls: ToolCall[];
  /** ISO 8601 */
  timestamp: string;
}

/** 解析后的完整会话。 */
export interface ParsedSession {
  sessionId: string;
  turns: SessionTurn[];
  /** 会话起始时间 */
  startTime: string;
  /** 会话最后时间 */
  endTime: string;
}

/**
 * 会话日志中的原始消息类型。仅用于 SessionSource adapter 内部，
 * 业务代码应使用 ParsedSession。
 */
export interface RawSessionMessage {
  type: string;
  uuid?: string;
  parentUuid?: string;
  timestamp?: string;
  sessionId?: string;
  message?: RawUserMessage | RawAssistantMessage;
  /** system 消息的附加字段 */
  subtype?: string;
  content?: string;
}

export interface RawUserMessage {
  role: "user";
  content: string;
}

export interface RawAssistantMessage {
  role: "assistant";
  content: RawAssistantContentBlock[];
}

export type RawAssistantContentBlock =
  | { type: "thinking"; thinking: string }
  | { type: "text"; text: string }
  | { type: "tool_use"; id: string; name: string; input: Record<string, unknown> }
  | { type: "tool_result"; tool_use_id: string; content: string };
