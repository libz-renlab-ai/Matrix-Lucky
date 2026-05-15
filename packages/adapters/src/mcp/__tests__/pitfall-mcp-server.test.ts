import { describe, it, expect } from "vitest";
import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SERVER_TS = path.resolve(__dirname, "../pitfall-server.ts");
const FIXTURE_JSON = path.resolve(__dirname, "fixture-rules.json");
// tsx lives at the workspace root. On Windows the .bin/tsx shim is a shell
// script that node can't spawn directly (ENOENT), so target the underlying
// cli.mjs and run it through node — works cross-platform.
const TSX_CLI = path.join(process.cwd(), "node_modules/tsx/dist/cli.mjs");

interface JsonRpcResponse {
  jsonrpc: "2.0";
  id: number;
  result?: unknown;
  error?: { code: number; message: string };
}

/**
 * Minimal stdio MCP client: send a list of JSON-RPC messages and collect
 * responses until we have as many as we sent or the process exits.
 */
function stubMcpClient(
  messages: object[],
  env: NodeJS.ProcessEnv = {},
): Promise<JsonRpcResponse[]> {
  return new Promise((resolve, reject) => {
    const proc = spawn(process.execPath, [TSX_CLI, SERVER_TS], {
      env: { ...process.env, ...env },
      stdio: ["pipe", "pipe", "pipe"],
    });

    // MCP initialize handshake, then our tool calls
    const initialize = {
      jsonrpc: "2.0",
      id: 0,
      method: "initialize",
      params: {
        protocolVersion: "2024-11-05",
        capabilities: {},
        clientInfo: { name: "stub-client", version: "0.0.1" },
      },
    };
    const allMessages = [initialize, ...messages];
    // expect one response per request (notifications have no id and produce no response)
    const expectedCount = allMessages.filter((m) => (m as any).id !== undefined).length;

    const responses: JsonRpcResponse[] = [];
    let buf = "";

    proc.stdout.on("data", (chunk: Buffer) => {
      buf += chunk.toString();
      const lines = buf.split("\n");
      buf = lines.pop() ?? "";
      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed) continue;
        try {
          responses.push(JSON.parse(trimmed) as JsonRpcResponse);
        } catch {
          // non-JSON line — skip
        }
      }
      if (responses.length >= expectedCount) {
        proc.kill();
        resolve(responses);
      }
    });

    proc.stderr.on("data", (_chunk: Buffer) => {
      // suppress server-side stderr unless debugging
    });

    proc.on("error", reject);
    proc.on("close", () => resolve(responses));

    proc.stdin.write(allMessages.map((m) => JSON.stringify(m)).join("\n") + "\n");
  });
}

describe("pitfall MCP server — check_pitfall tool", () => {
  it("returns hit when query matches trigger keyword", async () => {
    const responses = await stubMcpClient(
      [
        {
          jsonrpc: "2.0",
          id: 1,
          method: "tools/call",
          params: { name: "check_pitfall", arguments: { query: "moment" } },
        },
      ],
      { TEAMAGENT_MCP_RULES_FILE: FIXTURE_JSON },
    );

    // find our response (id=1)
    const res = responses.find((r) => r.id === 1);
    expect(res).toBeDefined();
    expect(res!.error).toBeUndefined();

    const content = (res!.result as any).content as Array<{ type: string; text: string }>;
    const payload = JSON.parse(content[0]!.text) as { hit_count: number; hits: unknown[] };
    expect(payload.hit_count).toBeGreaterThan(0);
    expect(payload.hits[0]).toMatchObject({ id: "rule-001", wrong_pattern: "moment" });
  }, 15_000);

  it("returns empty hits for unrecognised query", async () => {
    const responses = await stubMcpClient(
      [
        {
          jsonrpc: "2.0",
          id: 2,
          method: "tools/call",
          params: { name: "check_pitfall", arguments: { query: "this-query-matches-nothing" } },
        },
      ],
      { TEAMAGENT_MCP_RULES_FILE: FIXTURE_JSON },
    );

    const res = responses.find((r) => r.id === 2);
    expect(res).toBeDefined();
    const content = (res!.result as any).content as Array<{ type: string; text: string }>;
    const payload = JSON.parse(content[0]!.text) as { hit_count: number };
    expect(payload.hit_count).toBe(0);
  }, 15_000);

  it("matches by tag keyword", async () => {
    const responses = await stubMcpClient(
      [
        {
          jsonrpc: "2.0",
          id: 3,
          method: "tools/call",
          params: { name: "check_pitfall", arguments: { query: "security" } },
        },
      ],
      { TEAMAGENT_MCP_RULES_FILE: FIXTURE_JSON },
    );

    const res = responses.find((r) => r.id === 3);
    expect(res).toBeDefined();
    const content = (res!.result as any).content as Array<{ type: string; text: string }>;
    const payload = JSON.parse(content[0]!.text) as { hit_count: number; hits: Array<{ id: string }> };
    expect(payload.hit_count).toBeGreaterThan(0);
    expect(payload.hits.map((h) => h.id)).toContain("rule-002");
  }, 15_000);
});
