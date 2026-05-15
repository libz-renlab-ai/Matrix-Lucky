import { describe, it, expect, vi } from "vitest";
import {
  parseGhRunList,
  runsToCandidateItems,
  getGhRunList,
  getRunFailedLog,
  filterBySince,
} from "../ci-failure.js";

describe("parseGhRunList", () => {
  it("parses gh run list array", () => {
    const raw = JSON.stringify([
      {
        databaseId: 1,
        name: "CI",
        conclusion: "failure",
        headBranch: "feat/x",
        createdAt: "2026-04-15T00:00:00Z",
      },
      {
        databaseId: 2,
        name: "Docs",
        conclusion: "failure",
        headBranch: "docs/y",
        createdAt: "2026-04-14T00:00:00Z",
      },
    ]);
    const runs = parseGhRunList(raw);
    expect(runs).toHaveLength(2);
    expect(runs[0]!.id).toBe(1);
    expect(runs[0]!.branch).toBe("feat/x");
  });

  it("skips rows missing databaseId", () => {
    const raw = JSON.stringify([{ name: "no-id" }, { databaseId: 5, name: "ok" }]);
    expect(parseGhRunList(raw)).toHaveLength(1);
  });

  it("malformed JSON → empty", () => {
    expect(parseGhRunList("nope")).toEqual([]);
  });
});

describe("runsToCandidateItems", () => {
  it("includes id + branch + createdAt in label", () => {
    const items = runsToCandidateItems([
      {
        id: 42,
        name: "CI",
        branch: "feat/x",
        createdAt: "2026-04-10T00:00:00Z",
      },
    ]);
    expect(items[0]!.label).toContain("#42");
    expect(items[0]!.label).toContain("feat/x");
    expect(items[0]!.label).toContain("CI");
  });
});

describe("getGhRunList / getRunFailedLog", () => {
  it("invokes gh run list with failure + json fields", async () => {
    const runner = vi.fn().mockResolvedValue("[]");
    await getGhRunList(runner, { limit: 20 });
    const cmd = runner.mock.calls[0]![0] as string;
    expect(cmd).toContain("gh run list");
    expect(cmd).toContain("--status=failure");
    expect(cmd).toContain("--limit 20");
  });

  it("invokes gh run view --log-failed", async () => {
    const runner = vi.fn().mockResolvedValue("FAIL details");
    await getRunFailedLog(1, runner);
    expect(runner).toHaveBeenCalledWith("gh run view 1 --log-failed");
  });
});

describe("filterBySince", () => {
  it("keeps runs within the window", () => {
    const now = new Date("2026-04-16T00:00:00Z");
    const runs = [
      {
        id: 1,
        name: "",
        branch: "",
        createdAt: "2026-04-15T00:00:00Z",
      },
      {
        id: 2,
        name: "",
        branch: "",
        createdAt: "2026-02-01T00:00:00Z",
      },
    ];
    const kept = filterBySince(runs, 30, now);
    expect(kept.map((r) => r.id)).toEqual([1]);
  });

  it("no filter when sinceDays falsy", () => {
    const runs = [
      { id: 1, name: "", branch: "", createdAt: "2020-01-01T00:00:00Z" },
    ];
    expect(filterBySince(runs, undefined, new Date())).toHaveLength(1);
  });
});
