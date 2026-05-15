import { describe, it, expect } from "vitest";
import type { LLMClient } from "../llm-client.js";
import { LLMClientError } from "../llm-client.js";

/**
 * 契约测试套件——任何 LLMClient 实现都应通过。
 *
 * 使用方式：
 *   describe("MyLLMClient", () => {
 *     runLLMClientContract(() => new MyLLMClient(...));
 *   });
 *
 * 注：真实 LLM 调用慢且花钱。实现应提供一个"可测模式"或构造器注入，
 * 让契约跑的是 deterministic 行为而非真 spawn。
 * ClaudeCodeLLMClient 通过注入 spawn 实现这点。
 */
export function runLLMClientContract(
  makeClient: (behavior: LLMBehavior) => LLMClient,
): void {
  describe("LLMClient contract", () => {
    it("returns the completion text on success", async () => {
      const client = makeClient({ kind: "ok", text: "Hello from LLM" });
      const out = await client.complete("any prompt");
      expect(out).toBe("Hello from LLM");
    });

    it("can be called multiple times sequentially", async () => {
      const client = makeClient({ kind: "ok", text: "pong" });
      const a = await client.complete("ping 1");
      const b = await client.complete("ping 2");
      expect(a).toBe("pong");
      expect(b).toBe("pong");
    });

    it("throws LLMClientError(not-installed) when executable missing", async () => {
      const client = makeClient({ kind: "not-installed" });
      await expect(client.complete("x")).rejects.toBeInstanceOf(LLMClientError);
      await expect(client.complete("x")).rejects.toMatchObject({
        kind: "not-installed",
      });
    });

    it("throws LLMClientError(timeout) when process hangs past limit", async () => {
      const client = makeClient({ kind: "timeout" });
      await expect(client.complete("x")).rejects.toMatchObject({
        kind: "timeout",
      });
    });

    it("throws LLMClientError(non-zero-exit) when process exits with error", async () => {
      const client = makeClient({ kind: "non-zero-exit", exitCode: 1 });
      await expect(client.complete("x")).rejects.toMatchObject({
        kind: "non-zero-exit",
      });
    });

    it("throws LLMClientError(unparseable-output) on malformed response", async () => {
      const client = makeClient({ kind: "unparseable-output" });
      await expect(client.complete("x")).rejects.toMatchObject({
        kind: "unparseable-output",
      });
    });
  });
}

/**
 * 测试行为指令。实现方工厂据此构造一个"仿佛发生了这种情况"的 client。
 * ClaudeCodeLLMClient 通过注入 fake spawner 实现；其他实现可类似 mock。
 */
export type LLMBehavior =
  | { kind: "ok"; text: string }
  | { kind: "not-installed" }
  | { kind: "timeout" }
  | { kind: "non-zero-exit"; exitCode: number }
  | { kind: "unparseable-output" };
