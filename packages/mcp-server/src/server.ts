#!/usr/bin/env node
/**
 * MCP stdio server entry point.
 * Speaks JSON-RPC 2.0 over stdin/stdout (one JSON object per newline).
 *
 * Usage:
 *   node packages/mcp-server/dist/server.js
 *   pnpm teamagent mcp-server
 */

import { createInterface } from "node:readline";
import type { KnowledgeEntry } from "@teamagent/types";
import dispatch, { type JsonRpcRequest, type JsonRpcResponse } from "./dispatch.js";

// ── In-process rule store (injectable for tests) ─────────────────────────────

let _rules: KnowledgeEntry[] = [];

export function setRules(rules: KnowledgeEntry[]): void {
  _rules = rules;
}

export function getRules(): KnowledgeEntry[] {
  return _rules;
}

// ── stdio loop ────────────────────────────────────────────────────────────────

function send(response: JsonRpcResponse): void {
  process.stdout.write(JSON.stringify(response) + "\n");
}

export async function runServer(): Promise<void> {
  const rl = createInterface({ input: process.stdin, crlfDelay: Infinity });

  for await (const line of rl) {
    const trimmed = line.trim();
    if (!trimmed) continue;

    let req: JsonRpcRequest;
    try {
      req = JSON.parse(trimmed) as JsonRpcRequest;
    } catch {
      send({ jsonrpc: "2.0", id: null, error: { code: -32700, message: "Parse error" } });
      continue;
    }

    try {
      const response = await dispatch(req, _rules);
      if (response !== null) {
        send(response);
      }
    } catch (e) {
      send({
        jsonrpc: "2.0",
        id: req.id ?? null,
        error: { code: -32603, message: "Internal error", data: String(e) },
      });
    }
  }
}

// ── Entry point ───────────────────────────────────────────────────────────────

if (import.meta.url === `file://${process.argv[1]}`) {
  runServer().catch((e) => {
    process.stderr.write(String(e) + "\n");
    process.exit(1);
  });
}
