import { describe, it, expect } from "vitest";
import { createTiktokenCounter } from "../tiktoken.js";

describe("tiktoken counter", () => {
  it("counts ascii reasonably", () => {
    const count = createTiktokenCounter();
    // "hello world" 在 cl100k_base 约 2-3 token
    expect(count("hello world")).toBeGreaterThanOrEqual(2);
    expect(count("hello world")).toBeLessThan(6);
  });

  it("counts chinese characters", () => {
    const count = createTiktokenCounter();
    const s = "使用 fetch 而非 axios";
    expect(count(s)).toBeGreaterThan(0);
  });

  it("returns same number on repeated calls (cache)", () => {
    const count = createTiktokenCounter();
    const a = count("abc");
    const b = count("abc");
    expect(a).toBe(b);
  });

  it("empty string returns 0", () => {
    const count = createTiktokenCounter();
    expect(count("")).toBe(0);
  });
});
