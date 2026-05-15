/**
 * Pure JSON-RPC 2.0 dispatcher for the MCP server.
 * Separated from the stdio loop so tests can call it directly without spawning a process.
 */

import type { KnowledgeEntry } from "@teamagent/types";
import { matchRulesAsync } from "@teamagent/core";

// ── Types ────────────────────────────────────────────────────────────────────

export interface JsonRpcRequest {
  jsonrpc: "2.0";
  id: string | number | null;
  method: string;
  params?: unknown;
}

export interface JsonRpcResponse {
  jsonrpc: "2.0";
  id: string | number | null;
  result?: unknown;
  error?: { code: number; message: string; data?: unknown };
}

// ── Tool schema ──────────────────────────────────────────────────────────────

export const CHECK_PITFALL_SCHEMA = {
  name: "check_pitfall",
  description:
    "Query the TeamBrain knowledge base for pitfall rules that match the given description or code snippet.",
  inputSchema: {
    type: "object" as const,
    properties: {
      query: {
        type: "string",
        description:
          "The code snippet, tool input, or description to check against known pitfalls.",
      },
    },
    required: ["query"],
  },
};

// ── Helpers ──────────────────────────────────────────────────────────────────

function ok(id: string | number | null, result: unknown): JsonRpcResponse {
  return { jsonrpc: "2.0", id, result };
}

function rpcErr(
  id: string | number | null,
  code: number,
  message: string,
  data?: unknown,
): JsonRpcResponse {
  return { jsonrpc: "2.0", id, error: { code, message, data } };
}

async function handleCheckPitfall(query: string, rules: KnowledgeEntry[]): Promise<string> {
  const ctx = { content: query };
  const result = await matchRulesAsync(ctx, rules, {});
  const matched = result.matched;

  if (matched.length === 0) {
    return "No pitfalls matched for the given query.";
  }

  return matched
    .map((r) => {
      const lines: string[] = [
        `[${r.enforcement.toUpperCase()}] ${r.trigger}`,
        `  Avoid: ${r.wrong_pattern || "(see reasoning)"}`,
        `  Use instead: ${r.correct_pattern}`,
        `  Reason: ${r.reasoning}`,
      ];
      return lines.join("\n");
    })
    .join("\n\n");
}

// ── Dispatch ─────────────────────────────────────────────────────────────────

/**
 * Handle a single JSON-RPC request.
 * Returns null for notifications (no response expected).
 */
export default async function dispatch(
  req: JsonRpcRequest,
  rules: KnowledgeEntry[],
): Promise<JsonRpcResponse | null> {
  const { id, method, params } = req;

  if (method === "initialize") {
    return ok(id, {
      protocolVersion: "2024-11-05",
      capabilities: { tools: {} },
      serverInfo: { name: "teamagent-mcp-server", version: "0.1.0" },
    });
  }

  if (method === "tools/list") {
    return ok(id, { tools: [CHECK_PITFALL_SCHEMA] });
  }

  if (method === "tools/call") {
    const p = params as
      | { name?: string; arguments?: Record<string, unknown> }
      | undefined;
    if (!p || p.name !== "check_pitfall") {
      return rpcErr(id, -32602, `Unknown tool: ${p?.name}`);
    }
    const query =
      typeof p.arguments?.["query"] === "string" ? p.arguments["query"] : "";
    if (!query) {
      return rpcErr(id, -32602, "Missing required argument: query");
    }
    const text = await handleCheckPitfall(query, rules);
    return ok(id, { content: [{ type: "text", text }] });
  }

  if (method === "notifications/initialized") {
    return null;
  }

  return rpcErr(id, -32601, `Method not found: ${method}`);
}
