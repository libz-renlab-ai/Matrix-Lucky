/**
 * TeamBrain Live Knowledge Portal
 * Minimal Node HTTP server + WebSocket heartbeat
 */
import http from "node:http";
import { EventEmitter } from "node:events";

export interface PortalServer {
  port: number;
  close: () => Promise<void>;
  /**
   * Internal event emitter exposed for tests to wait for WS frames
   * without needing ws/socket.io deps.
   */
  events: EventEmitter;
}

const HTML = `<!DOCTYPE html>
<html lang="en">
<head><meta charset="utf-8"><title>TeamBrain Live Portal</title></head>
<body>
<h1>TeamBrain Live Knowledge Portal</h1>
<p>Real-time knowledge stats stream. Connect via WebSocket at <code>/ws</code>.</p>
<pre id="log"></pre>
<script>
const log = document.getElementById('log');
const ws = new WebSocket('ws://' + location.host + '/ws');
ws.onmessage = e => { log.textContent += e.data + '\\n'; };
</script>
</body>
</html>`;

/**
 * Creates a minimal HTTP + hand-rolled WebSocket upgrade server.
 * No external deps — uses only Node built-ins.
 */
export function createPortalServer(port = 0): Promise<PortalServer> {
  const events = new EventEmitter();

  return new Promise((resolve, reject) => {
    const sockets = new Set<import("node:stream").Duplex>();

    const server = http.createServer((req, res) => {
      if (req.url === "/" || req.url === "") {
        res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
        res.end(HTML);
      } else {
        res.writeHead(404);
        res.end("Not found");
      }
    });

    // Hand-rolled WebSocket upgrade (RFC 6455 opening handshake only)
    server.on("upgrade", (req, socket) => {
      if (req.url !== "/ws") {
        socket.destroy();
        return;
      }

      const key = req.headers["sec-websocket-key"] as string;
      if (!key) {
        socket.destroy();
        return;
      }

      const { createHash } = require("node:crypto") as typeof import("node:crypto");
      const acceptKey = createHash("sha1")
        .update(key + "258EAFA5-E914-47DA-95CA-C5AB0DC85B11")
        .digest("base64");

      socket.write(
        "HTTP/1.1 101 Switching Protocols\r\n" +
          "Upgrade: websocket\r\n" +
          "Connection: Upgrade\r\n" +
          `Sec-WebSocket-Accept: ${acceptKey}\r\n` +
          "\r\n",
      );

      sockets.add(socket);
      socket.once("close", () => sockets.delete(socket));
      socket.once("error", () => sockets.delete(socket));

      // Send WS text frame helper
      function sendWsFrame(sock: import("node:stream").Duplex, text: string) {
        const payload = Buffer.from(text, "utf-8");
        const len = payload.length;
        let header: Buffer;
        if (len <= 125) {
          header = Buffer.alloc(2);
          header[0] = 0x81; // FIN + text opcode
          header[1] = len;
        } else if (len <= 65535) {
          header = Buffer.alloc(4);
          header[0] = 0x81;
          header[1] = 126;
          header.writeUInt16BE(len, 2);
        } else {
          header = Buffer.alloc(10);
          header[0] = 0x81;
          header[1] = 127;
          // Safely encode large payloads (won't be needed here)
          header.writeBigUInt64BE(BigInt(len), 2);
        }
        if (!sock.destroyed) sock.write(Buffer.concat([header, payload]));
      }

      events.emit("ws-connected", socket);

      // Heartbeat every 5 s
      const interval = setInterval(() => {
        const frame = JSON.stringify({ type: "heartbeat", ts: Date.now() });
        sendWsFrame(socket, frame);
        events.emit("heartbeat", frame);
      }, 5000);

      // Send one immediate heartbeat so tests don't have to wait 5 s
      const immediate = JSON.stringify({ type: "heartbeat", ts: Date.now() });
      sendWsFrame(socket, immediate);
      events.emit("heartbeat", immediate);

      socket.once("close", () => clearInterval(interval));
      socket.once("error", () => clearInterval(interval));
    });

    server.on("error", reject);

    server.listen(port, "127.0.0.1", () => {
      const addr = server.address() as { port: number };
      resolve({
        port: addr.port,
        events,
        close: () =>
          new Promise<void>((res) => {
            clearInterval(undefined as unknown as NodeJS.Timeout);
            // Close all open sockets
            for (const s of sockets) s.destroy();
            server.close(() => res());
          }),
      });
    });
  });
}
