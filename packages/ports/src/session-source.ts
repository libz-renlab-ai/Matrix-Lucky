import type { ParsedSession } from "@teamagent/types";

/** 会话日志的来源。M3 的 ClaudeSessionSource 会实现。 */
export interface SessionSource {
  /** 列出最近的 N 个会话摘要（用于交互选择） */
  listRecent(limit?: number): Promise<Array<{ sessionId: string; startTime: string; turnCount: number }>>;

  /** 按 sessionId 或文件路径加载完整会话 */
  loadById(sessionIdOrPath: string): Promise<ParsedSession>;
}
