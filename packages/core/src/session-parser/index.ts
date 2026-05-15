import type {
  ParsedSession,
  RawAssistantContentBlock,
  RawSessionMessage,
  SessionTurn,
  ToolCall,
} from "@teamagent/types";

/**
 * 把 Claude Code 会话日志文本（jsonl）解析为 ParsedSession。纯函数。
 *
 * 会话文件位置：~/.claude/projects/{project-id}/{session-id}.jsonl
 * 每行一个 JSON，type 区分消息类别（user/assistant/system/tool_result 等）。
 *
 * Claude Code jsonl 关键形态（实测）：
 *  - 用户真·发言：{type:"user", message:{role:"user", content:"文本"}}
 *  - 用户消息里含文本块数组：{type:"user", message:{role:"user", content:[{type:"text", text:"文本"}, ...]}}
 *  - 工具结果冒充 user：{type:"user", message:{role:"user", content:[{type:"tool_result", tool_use_id:"...", content:"..."}]}}
 *  - AI 消息：{type:"assistant", message:{role:"assistant", content:[{type:"text"|"tool_use"|"tool_result", ...}]}}
 *
 * 解析策略：
 * - 按行 parse，跳过坏行
 * - 先扫一遍把所有 tool_result 建映射（无论在 user 还是 assistant 消息里）
 * - 再扫一遍组 turn：
 *   - 只有"有用户文本"的 user 消息才开新 turn
 *   - 仅含 tool_result 的 user 消息挂到当前 turn 的 toolCalls 上（更新 succeeded/result），不新开 turn
 *   - assistant 消息正常追加 text 和 tool_use 到当前 turn
 */

interface ToolResultPayload {
  content: string;
  succeeded: boolean;
}

function extractUserText(content: unknown): string {
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return "";
  const parts: string[] = [];
  for (const b of content) {
    if (!b || typeof b !== "object") continue;
    const block = b as { type?: unknown; text?: unknown };
    if (block.type === "text" && typeof block.text === "string") {
      parts.push(block.text);
    }
  }
  return parts.join("\n");
}

function extractToolResults(
  content: unknown,
): Array<{ id: string; payload: ToolResultPayload }> {
  if (!Array.isArray(content)) return [];
  const out: Array<{ id: string; payload: ToolResultPayload }> = [];
  for (const b of content) {
    if (!b || typeof b !== "object") continue;
    const block = b as { type?: unknown; tool_use_id?: unknown; content?: unknown };
    if (block.type !== "tool_result") continue;
    if (typeof block.tool_use_id !== "string") continue;
    const c = String(block.content ?? "");
    out.push({
      id: block.tool_use_id,
      payload: {
        content: c,
        // B-052: added errno to catch Node.js system error objects like {"errno":-13}
        // Note: closing \b omitted because err! ends in a non-word char and would break matching.
        succeeded: !/\b(error|err!|failed|not found|exit code [1-9]|errno)/i.test(c),
      },
    });
  }
  return out;
}

function hasUserText(content: unknown): boolean {
  return extractUserText(content).trim().length > 0;
}

export function parseSessionFile(raw: string): ParsedSession {
  const messages: RawSessionMessage[] = [];
  for (const line of raw.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    try {
      messages.push(JSON.parse(trimmed) as RawSessionMessage);
    } catch {
      continue;
    }
  }

  // Pass 1: collect tool_result payloads from BOTH assistant and user messages.
  const toolResults = new Map<string, ToolResultPayload>();
  for (const m of messages) {
    if (!m.message) continue;
    const blocks = (m.message as { content?: unknown }).content;
    for (const r of extractToolResults(blocks)) {
      toolResults.set(r.id, r.payload);
    }
  }

  // Pass 2: build turns.
  const turns: SessionTurn[] = [];
  let currentTurn: SessionTurn | null = null;
  let sessionId = "unknown";

  const applyToolResultsToTurn = (
    turn: SessionTurn | null,
    content: unknown,
  ): void => {
    if (!turn) return;
    const results = extractToolResults(content);
    for (const r of results) {
      // Attach result to the matching ToolCall in this turn (or any prior turn).
      const tc = findToolCallById(turns, turn, r.id);
      if (tc) {
        tc.result = r.payload.content;
        tc.succeeded = r.payload.succeeded;
      }
    }
  };

  for (const m of messages) {
    if (m.sessionId) sessionId = m.sessionId;

    if (m.type === "user" && m.message) {
      const content = (m.message as { content?: unknown }).content;
      if (hasUserText(content)) {
        // Real user turn.
        if (currentTurn) turns.push(currentTurn);
        currentTurn = {
          turnIndex: turns.length,
          userMessage: extractUserText(content),
          assistantText: "",
          toolCalls: [],
          timestamp: m.timestamp ?? "",
        };
      } else {
        // tool_result-only user message → update current turn's tool calls.
        applyToolResultsToTurn(currentTurn, content);
      }
    } else if (m.type === "assistant" && m.message) {
      if (!currentTurn) continue;
      const blocks = (m.message as { content?: unknown }).content;
      if (!Array.isArray(blocks)) continue;
      for (const b of blocks as RawAssistantContentBlock[]) {
        if (b.type === "text") {
          if (currentTurn.assistantText) currentTurn.assistantText += "\n";
          currentTurn.assistantText += b.text;
        } else if (b.type === "tool_use") {
          const tc: ToolCall = {
            id: b.id,
            name: b.name,
            input: b.input,
          };
          const tr = toolResults.get(b.id);
          if (tr) {
            tc.result = tr.content;
            tc.succeeded = tr.succeeded;
          }
          currentTurn.toolCalls.push(tc);
        } else if (b.type === "tool_result") {
          // Some clients put tool_result inside assistant messages — handle here too.
          const r = { id: b.tool_use_id, payload: toolResults.get(b.tool_use_id) };
          if (r.payload) {
            const tc = findToolCallById(turns, currentTurn, r.id);
            if (tc) {
              tc.result = r.payload.content;
              tc.succeeded = r.payload.succeeded;
            }
          }
        }
      }
    }
  }
  if (currentTurn) turns.push(currentTurn);

  return {
    sessionId,
    turns,
    startTime: turns[0]?.timestamp ?? "",
    endTime: turns[turns.length - 1]?.timestamp ?? "",
  };
}

function findToolCallById(
  allPriorTurns: SessionTurn[],
  current: SessionTurn,
  id: string,
): ToolCall | undefined {
  for (const tc of current.toolCalls) if (tc.id === id) return tc;
  // Fallback: an earlier turn if the tool_result lands after a turn boundary.
  for (let i = allPriorTurns.length - 1; i >= 0; i--) {
    const t = allPriorTurns[i]!;
    for (const tc of t.toolCalls) if (tc.id === id) return tc;
  }
  return undefined;
}
