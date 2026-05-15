/**
 * Smoke test: Live Knowledge Portal HTTP + WebSocket
 * - Spawns server on random port
 * - Fetches `/` and asserts 200 + body contains "TeamBrain"
 * - Connects raw TCP WebSocket and asserts `heartbeat` message received
 */
import { describe, it, expect, afterAll } from "vitest";
import http from "node:http";
import net from "node:net";
import crypto from "node:crypto";
import { createPortalServer } from "../index.js";
import type { PortalServer } from "../index.js";

let server: PortalServer | null = null;

afterAll(async () => {
  if (server) {
    await server.close();
    server = null;
  }
});

describe("Live Knowledge Portal", () => {
  it("serves GET / with 200 and body containing 'TeamBrain'", async () => {
    server = await createPortalServer(0);

    const body = await new Promise<string>((resolve, reject) => {
      const req = http.get(`http://127.0.0.1:${server!.port}/`, (res) => {
        expect(res.statusCode).toBe(200);
        const chunks: Buffer[] = [];
        res.on("data", (c: Buffer) => chunks.push(c));
        res.on("end", () => resolve(Buffer.concat(chunks).toString("utf-8")));
      });
      req.on("error", reject);
    });

    expect(body).toContain("TeamBrain");
  });

  it("WebSocket /ws receives a heartbeat message", async () => {
    // Re-use the server already started above (it's already running)
    if (!server) server = await createPortalServer(0);

    // We do a raw TCP WebSocket handshake so we don't need the `ws` package
    const heartbeat = await new Promise<string>((resolve, reject) => {
      const wsKey = crypto.randomBytes(16).toString("base64");
      const sock = net.createConnection(server!.port, "127.0.0.1", () => {
        sock.write(
          `GET /ws HTTP/1.1\r\n` +
            `Host: 127.0.0.1:${server!.port}\r\n` +
            `Upgrade: websocket\r\n` +
            `Connection: Upgrade\r\n` +
            `Sec-WebSocket-Key: ${wsKey}\r\n` +
            `Sec-WebSocket-Version: 13\r\n` +
            `\r\n`,
        );
      });

      let upgraded = false;
      const chunks: Buffer[] = [];

      sock.on("data", (data: Buffer) => {
        chunks.push(data);
        const combined = Buffer.concat(chunks);

        if (!upgraded) {
          // Look for the end of HTTP headers
          const headerEnd = combined.indexOf("\r\n\r\n");
          if (headerEnd === -1) return;
          upgraded = true;
          // WS frames start after the headers
          const rest = combined.slice(headerEnd + 4);
          if (rest.length > 0) parseFrames(rest);
        } else {
          parseFrames(combined);
          chunks.length = 0;
        }
      });

      function parseFrames(buf: Buffer) {
        if (buf.length < 2) return;
        // Simple single-frame parser (no masking from server)
        const opcode = (buf[0] ?? 0) & 0x0f;
        if (opcode !== 1) return; // not text frame
        const payloadLen = (buf[1] ?? 0) & 0x7f;
        const payload = buf.slice(2, 2 + payloadLen).toString("utf-8");
        if (payload.includes("heartbeat")) {
          sock.destroy();
          resolve(payload);
        }
      }

      sock.on("error", reject);
      // Timeout safety
      setTimeout(() => { sock.destroy(); reject(new Error("WS heartbeat timeout")); }, 10000);
    });

    const parsed = JSON.parse(heartbeat) as { type: string };
    expect(parsed.type).toBe("heartbeat");
  });
});
