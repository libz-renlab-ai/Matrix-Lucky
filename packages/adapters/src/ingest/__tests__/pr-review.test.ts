import { describe, it, expect, vi } from "vitest";
import {
  parseGhPrReviews,
  getGhPrReviews,
  isGhAvailable,
} from "../pr-review.js";

describe("parseGhPrReviews", () => {
  it("parses reviews with state + body", () => {
    const raw = JSON.stringify({
      reviews: [
        {
          body: "This is nitpick but prefer fetch over axios.",
          state: "COMMENTED",
        },
        { body: "Why did you use var here?", state: "CHANGES_REQUESTED" },
      ],
    });
    const inputs = parseGhPrReviews(raw);
    expect(inputs).toHaveLength(2);
    expect(inputs[0]!.kind).toBe("pr-review");
    expect(inputs[0]!.context).toContain("COMMENTED");
    expect(inputs[1]!.weight).toBeGreaterThan(inputs[0]!.weight);
  });

  it("drops APPROVED reviews", () => {
    const raw = JSON.stringify({
      reviews: [{ body: "Looks good to me overall", state: "APPROVED" }],
    });
    expect(parseGhPrReviews(raw)).toEqual([]);
  });

  it("drops short bodies (< 10 chars)", () => {
    const raw = JSON.stringify({
      reviews: [
        { body: "lgtm", state: "COMMENTED" },
        { body: "This is longer than ten characters", state: "COMMENTED" },
      ],
    });
    const inputs = parseGhPrReviews(raw);
    expect(inputs).toHaveLength(1);
  });

  it("malformed JSON → empty", () => {
    expect(parseGhPrReviews("nope")).toEqual([]);
  });

  it("missing reviews field → empty", () => {
    expect(parseGhPrReviews(JSON.stringify({ foo: "bar" }))).toEqual([]);
  });
});

describe("getGhPrReviews", () => {
  it("invokes runner with correct gh command", async () => {
    const runner = vi.fn().mockResolvedValue('{"reviews":[]}');
    await getGhPrReviews(42, runner);
    expect(runner).toHaveBeenCalledWith("gh pr view 42 --json reviews");
  });
});

describe("isGhAvailable", () => {
  it("true when gh --version succeeds", async () => {
    const runner = vi.fn().mockResolvedValue("gh version 2.40.0");
    expect(await isGhAvailable(runner)).toBe(true);
  });

  it("false when runner throws (gh not installed)", async () => {
    const runner = vi.fn().mockRejectedValue(new Error("command not found: gh"));
    expect(await isGhAvailable(runner)).toBe(false);
  });
});
