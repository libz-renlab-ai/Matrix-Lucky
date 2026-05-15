import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { aggregate, writeJson, writeMarkdown } from "../reporter.js";
import type { TaskResult, BenchmarkConfig } from "../types.js";

const config: BenchmarkConfig = {
  groups: ["baseline", "teamagent"],
  tasks: "*.json",
  runs: 1,
  outputJson: "out.json",
  outputMarkdown: "out.md",
};

function makeResult(group: string, verdict: TaskResult["verdict"], tokens: number, dur: number): TaskResult {
  return {
    group, taskId: `t-${group}-${verdict}`, run: 1, verdict,
    tokensIn: tokens, tokensOut: tokens,
    cacheReadTokens: 0, cacheCreationTokens: 0,
    durationMs: dur, output: "out",
  };
}

describe("aggregate", () => {
  it("computes group summaries", () => {
    const results = [
      makeResult("baseline", "wrong", 100, 1000),
      makeResult("baseline", "correct", 100, 2000),
      makeResult("teamagent", "correct", 110, 1500),
      makeResult("teamagent", "correct", 110, 1500),
    ];
    const report = aggregate(results, config);
    const baseline = report.groups.find((g) => g.group === "baseline")!;
    const teamagent = report.groups.find((g) => g.group === "teamagent")!;
    expect(baseline.wrongCount).toBe(1);
    expect(baseline.correctCount).toBe(1);
    expect(teamagent.wrongCount).toBe(0);
    expect(teamagent.correctCount).toBe(2);
    expect(baseline.avgDurationMs).toBe(1500);
  });

  it("computes PRR = (baseline.wrong - teamagent.wrong) / baseline.wrong", () => {
    const results = [
      makeResult("baseline", "wrong", 100, 1000),
      makeResult("baseline", "wrong", 100, 1000),
      makeResult("teamagent", "correct", 100, 1000),
    ];
    const report = aggregate(results, config);
    expect(report.comparison.prr).toBe(1.0);
  });

  it("returns prr=0 when baseline has no wrong", () => {
    const results = [
      makeResult("baseline", "correct", 100, 1000),
      makeResult("teamagent", "correct", 100, 1000),
    ];
    const report = aggregate(results, config);
    expect(report.comparison.prr).toBe(0);
  });

  it("counts errors separately", () => {
    const results = [
      makeResult("baseline", "error", 0, 0),
      makeResult("baseline", "wrong", 0, 0),
    ];
    const report = aggregate(results, config);
    const g = report.groups.find((x) => x.group === "baseline")!;
    expect(g.errorCount).toBe(1);
    expect(g.wrongCount).toBe(1);
  });

  it("does not crash on empty results", () => {
    const report = aggregate([], config);
    expect(report.groups).toEqual([]);
  });

  it("aggregates cache tokens and uses them in token delta", () => {
    const mk = (group: string, io: number, cr: number, cc: number): TaskResult => ({
      group,
      taskId: `t-${group}`,
      run: 1,
      verdict: "correct",
      tokensIn: io,
      tokensOut: io,
      cacheReadTokens: cr,
      cacheCreationTokens: cc,
      durationMs: 100,
      output: "ok",
    });
    const report = aggregate(
      [mk("baseline", 50, 200, 100), mk("teamagent", 60, 300, 150)],
      config,
    );
    const baseline = report.groups.find((g) => g.group === "baseline")!;
    const teamagent = report.groups.find((g) => g.group === "teamagent")!;
    expect(baseline.totalCacheReadTokens).toBe(200);
    expect(baseline.totalCacheCreationTokens).toBe(100);
    expect(teamagent.totalCacheReadTokens).toBe(300);
    expect(teamagent.totalCacheCreationTokens).toBe(150);
    // baseline total: 50+50+200+100 = 400; teamagent: 60+60+300+150 = 570
    expect(report.comparison.tokenDeltaPercent).toBeCloseTo((570 - 400) / 400, 5);
  });
});

describe("writeJson + writeMarkdown", () => {
  let dir: string;
  beforeEach(() => { dir = mkdtempSync(path.join(tmpdir(), "bench-rep-")); });
  afterEach(() => { rmSync(dir, { recursive: true, force: true }); });

  it("writeJson writes valid JSON", () => {
    const results = [makeResult("baseline", "wrong", 0, 0)];
    const report = aggregate(results, config);
    const out = path.join(dir, "r.json");
    writeJson(report, out);
    const parsed = JSON.parse(readFileSync(out, "utf8"));
    expect(parsed.groups[0].wrongCount).toBe(1);
  });

  it("writeMarkdown writes file with summary table", () => {
    const results = [makeResult("baseline", "wrong", 0, 0)];
    const report = aggregate(results, config);
    const out = path.join(dir, "r.md");
    writeMarkdown(report, out);
    const md = readFileSync(out, "utf8");
    expect(md).toContain("# Benchmark Report");
    expect(md).toContain("baseline");
  });
});
