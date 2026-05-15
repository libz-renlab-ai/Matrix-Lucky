import { describe, it, expect, vi } from "vitest";
import {
  parseGitHotspots,
  hotspotsToCandidateItems,
  getGitNumstat,
} from "../git-hotspot.js";
import {
  formatCandidateMd,
  parseCandidateMd,
  candidatesToExtractionInputs,
} from "../candidate-md.js";

describe("parseGitHotspots", () => {
  it("counts file occurrences and filters by threshold", () => {
    const log = [
      "commit a",
      "2 1 src/utils/path.ts",
      "5 3 src/utils/path.ts",
      "1 0 src/utils/path.ts",
      "commit b",
      "2 1 src/foo.ts",
      "commit c",
      "1 0 src/bar.ts",
    ].join("\n");
    const h = parseGitHotspots(log, { threshold: 2 });
    expect(h).toHaveLength(1);
    expect(h[0]!.path).toBe("src/utils/path.ts");
    expect(h[0]!.change_count).toBe(3);
  });

  it("sorts by change_count descending", () => {
    const log = [
      "commit a",
      "1 1 low.ts",
      "commit b",
      "1 1 low.ts",
      "1 1 high.ts",
      "commit c",
      "1 1 high.ts",
      "1 1 high.ts",
    ].join("\n");
    const h = parseGitHotspots(log, { threshold: 2 });
    expect(h.map((x) => x.path)).toEqual(["high.ts", "low.ts"]);
  });

  it("tolerates numstat '-' markers (binary files)", () => {
    const log = ["commit a", "- - binary.png", "2 1 text.ts"].join("\n");
    const h = parseGitHotspots(log, { threshold: 1 });
    expect(h).toHaveLength(2);
  });

  it("default threshold is 3", () => {
    const log = ["commit a", "1 1 x.ts", "1 1 x.ts"].join("\n");
    expect(parseGitHotspots(log)).toEqual([]);
  });
});

describe("getGitNumstat", () => {
  it("invokes git log --numstat with since filter", async () => {
    const runner = vi.fn().mockResolvedValue("commit a\n1 1 x.ts\n");
    await getGitNumstat(runner, { sinceDays: 30 });
    expect(runner).toHaveBeenCalled();
    const cmd = runner.mock.calls[0]![0] as string;
    expect(cmd).toContain("git log");
    expect(cmd).toContain("30 days ago");
    expect(cmd).toContain("--numstat");
  });
});

describe("candidate-md round-trip", () => {
  it("format → parse preserves checked items", () => {
    const items = hotspotsToCandidateItems([
      { path: "src/a.ts", change_count: 5 },
      { path: "src/b.ts", change_count: 3 },
    ]);
    const md = formatCandidateMd("git-hotspot", items);
    // 默认全部未勾选
    expect(md).toContain("- [ ] src/a.ts");
    expect(md).toContain("teamagent-candidate-source: git-hotspot");
    const parsed = parseCandidateMd(md);
    expect(parsed.source).toBe("git-hotspot");
    expect(parsed.checked).toEqual([]);

    // 模拟用户勾选第一条
    const edited = md.replace("- [ ] src/a.ts", "- [x] src/a.ts");
    const reparsed = parseCandidateMd(edited);
    expect(reparsed.checked).toHaveLength(1);
    expect(reparsed.checked[0]).toBe("src/a.ts (changed 5 times)");
  });

  it("candidatesToExtractionInputs preserves kind", () => {
    const md = [
      "# x",
      "<!-- teamagent-candidate-source: git-hotspot -->",
      "- [x] file.ts (x)",
    ].join("\n");
    const parsed = parseCandidateMd(md);
    const inputs = candidatesToExtractionInputs(parsed);
    expect(inputs).toHaveLength(1);
    expect(inputs[0]!.kind).toBe("git-hotspot");
    expect(inputs[0]!.context).toBe("file.ts (x)");
  });

  it("throws when source marker missing", () => {
    expect(() => parseCandidateMd("- [x] foo")).toThrow(/teamagent-candidate-source/);
  });

  it("rejects unknown source", () => {
    const md = [
      "<!-- teamagent-candidate-source: unknown-kind -->",
      "- [x] a",
    ].join("\n");
    expect(() => parseCandidateMd(md)).toThrow(/未知 candidate source/);
  });

  it("accepts [X] uppercase mark", () => {
    const md = [
      "<!-- teamagent-candidate-source: git-hotspot -->",
      "- [X] upper.ts",
    ].join("\n");
    expect(parseCandidateMd(md).checked).toEqual(["upper.ts"]);
  });
});
