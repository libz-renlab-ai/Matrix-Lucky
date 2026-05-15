import { describe, it, expect } from "vitest";
import { runSkeletonDemo } from "../commands/skeleton-demo.js";

describe("runSkeletonDemo", () => {
  const fixedNow = "2026-04-14T00:00:00Z";

  it("smart mode (default) → includes attribution block header", async () => {
    const out = await runSkeletonDemo({ env: {}, now: fixedNow });
    expect(out).toContain("✨ TeamAgent");
    expect(out).toContain("本次操作归因");
    expect(out).toContain("[skeleton]");
  });

  it("smart mode does NOT include counterfactual line", async () => {
    const out = await runSkeletonDemo({
      env: { TEAMAGENT_VISIBILITY: "smart" },
      now: fixedNow,
    });
    expect(out).not.toContain("如果没有 TeamAgent");
  });

  it("silent mode → empty output", async () => {
    const out = await runSkeletonDemo({
      env: { TEAMAGENT_VISIBILITY: "silent" },
      now: fixedNow,
    });
    expect(out).toBe("");
  });

  it("verbose mode → includes counterfactual + raw JSON", async () => {
    const out = await runSkeletonDemo({
      env: { TEAMAGENT_VISIBILITY: "verbose" },
      now: fixedNow,
    });
    expect(out).toContain("如果没有 TeamAgent");
    expect(out).toContain("Walking Skeleton");
    expect(out).toContain('"source"');
  });

  it("unknown mode falls back to default (verbose)", async () => {
    const out = await runSkeletonDemo({
      env: { TEAMAGENT_VISIBILITY: "dev" },
      now: fixedNow,
    });
    expect(out).toContain("✨ TeamAgent");
    expect(out).toContain("如果没有 TeamAgent");
  });
});
