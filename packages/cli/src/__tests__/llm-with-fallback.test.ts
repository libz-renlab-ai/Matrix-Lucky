import { describe, it, expect } from "vitest";
import { makeFallbackLLMClient } from "../llm-with-fallback.js";
import { LLMClientError, type LLMClient } from "@teamagent/ports";

function makeStub(
  behaviors: Array<{ kind: "ok"; text: string } | { kind: "throw"; err: unknown }>,
): { client: LLMClient; calls: number } {
  let calls = 0;
  const client: LLMClient = {
    async complete(_prompt: string): Promise<string> {
      const b = behaviors[calls++];
      if (!b) throw new Error("stub exhausted");
      if (b.kind === "throw") throw b.err;
      return b.text;
    },
  };
  return { client, calls: 0, get: () => calls } as any;
}

describe("makeFallbackLLMClient", () => {
  it("returns primary result when primary succeeds", async () => {
    const primary = makeStub([{ kind: "ok", text: "hi-haiku" }]);
    const fallback = makeStub([{ kind: "ok", text: "hi-sonnet" }]);
    const client = makeFallbackLLMClient(primary.client, fallback.client);
    expect(await client.complete("q")).toBe("hi-haiku");
  });

  it("falls back when primary throws LLMClientError", async () => {
    const primary = makeStub([
      { kind: "throw", err: new LLMClientError("non-zero-exit", "boom") },
    ]);
    const fallback = makeStub([{ kind: "ok", text: "hi-sonnet" }]);
    const client = makeFallbackLLMClient(primary.client, fallback.client);
    expect(await client.complete("q")).toBe("hi-sonnet");
  });

  it("falls back when primary throws generic Error (parse failure)", async () => {
    const primary = makeStub([{ kind: "throw", err: new Error("parse fail") }]);
    const fallback = makeStub([{ kind: "ok", text: "sonnet-result" }]);
    const client = makeFallbackLLMClient(primary.client, fallback.client);
    expect(await client.complete("q")).toBe("sonnet-result");
  });

  it("propagates fallback error when both fail", async () => {
    const primary = makeStub([{ kind: "throw", err: new Error("haiku fail") }]);
    const fallback = makeStub([{ kind: "throw", err: new Error("sonnet fail") }]);
    const client = makeFallbackLLMClient(primary.client, fallback.client);
    await expect(client.complete("q")).rejects.toThrow("sonnet fail");
  });

  it("only calls fallback once per request (no infinite retry)", async () => {
    let primaryCalls = 0;
    let fallbackCalls = 0;
    const primary: LLMClient = {
      async complete() {
        primaryCalls++;
        throw new Error("primary down");
      },
    };
    const fallback: LLMClient = {
      async complete() {
        fallbackCalls++;
        return "ok";
      },
    };
    const client = makeFallbackLLMClient(primary, fallback);
    await client.complete("q");
    await client.complete("q");
    expect(primaryCalls).toBe(2);
    expect(fallbackCalls).toBe(2);
  });
});
