import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { runTask } from "../runner.js";
import { FakeSdkRunner, type SdkRunner } from "../sdk-runner.js";
import type { CompiledTask, GroupConfig } from "../types.js";

const task: CompiledTask = {
  id: "t1",
  name: "t",
  category: "x",
  prompt: "make me code",
  evaluator: { type: "pattern", wrong_patterns: ["BAD"], correct_patterns: ["GOOD"] },
  compiledWrongRegex: [/BAD/],
  compiledCorrectRegex: [/GOOD/],
};

const group: GroupConfig = { name: "g1", fixtureDir: "/tmp" };

describe("runTask", () => {
  it("returns correct verdict when SDK output matches correct pattern", async () => {
    const sdk = new FakeSdkRunner();
    sdk.setResponse("make me code", {
      output: "GOOD code",
      tokensIn: 10,
      tokensOut: 20,
      cacheReadTokens: 500,
      cacheCreationTokens: 30,
    });
    const result = await runTask(task, group, sdk, "/tmp/wd", 1);
    expect(result.verdict).toBe("correct");
    expect(result.tokensIn).toBe(10);
    expect(result.tokensOut).toBe(20);
    expect(result.cacheReadTokens).toBe(500);
    expect(result.cacheCreationTokens).toBe(30);
    expect(result.run).toBe(1);
  });

  it("returns wrong verdict when SDK output matches wrong pattern", async () => {
    const sdk = new FakeSdkRunner();
    sdk.setResponse("make me code", { output: "BAD code", tokensIn: 5, tokensOut: 5 });
    const result = await runTask(task, group, sdk, "/tmp/wd", 1);
    expect(result.verdict).toBe("wrong");
  });

  it("returns error verdict when SDK throws", async () => {
    const sdk: SdkRunner = { run: async () => { throw new Error("network down"); } };
    const result = await runTask(task, group, sdk, "/tmp/wd", 1);
    expect(result.verdict).toBe("error");
    expect(result.errorMsg).toContain("network down");
  });

  it("returns neither with reason=empty_response when output empty", async () => {
    const sdk = new FakeSdkRunner();
    sdk.setResponse("make me code", { output: "", tokensIn: 0, tokensOut: 0 });
    const result = await runTask(task, group, sdk, "/tmp/wd", 1);
    expect(result.verdict).toBe("neither");
    expect(result.reason).toBe("empty_response");
  });

  it("populates group, taskId, durationMs", async () => {
    const sdk = new FakeSdkRunner();
    sdk.setResponse("make me code", { output: "GOOD", tokensIn: 1, tokensOut: 1 });
    const result = await runTask(task, group, sdk, "/tmp/wd", 2);
    expect(result.group).toBe("g1");
    expect(result.taskId).toBe("t1");
    expect(result.durationMs).toBeGreaterThanOrEqual(0);
  });
});

describe("runTask — workdir source scanning", () => {
  let wd: string;
  beforeEach(() => {
    wd = mkdtempSync(path.join(tmpdir(), "bench-runner-"));
  });
  afterEach(() => {
    rmSync(wd, { recursive: true, force: true });
  });

  it("detects wrong pattern written to workdir file even when SDK text does not contain it", async () => {
    writeFileSync(path.join(wd, "out.ts"), "import BAD from 'somewhere';");
    const sdk = new FakeSdkRunner();
    sdk.setResponse("make me code", { output: "Done! Created the file.", tokensIn: 5, tokensOut: 5 });
    const result = await runTask(task, group, sdk, wd, 1);
    expect(result.verdict).toBe("wrong");
  });

  it("detects correct pattern written to workdir file", async () => {
    writeFileSync(path.join(wd, "out.ts"), "import { GOOD } from 'lib';");
    const sdk = new FakeSdkRunner();
    sdk.setResponse("make me code", { output: "Wrote the file.", tokensIn: 5, tokensOut: 5 });
    const result = await runTask(task, group, sdk, wd, 1);
    expect(result.verdict).toBe("correct");
  });

  it("returns neither/empty_response when both SDK and workdir empty", async () => {
    const sdk = new FakeSdkRunner();
    sdk.setResponse("make me code", { output: "", tokensIn: 0, tokensOut: 0 });
    const result = await runTask(task, group, sdk, wd, 1);
    expect(result.verdict).toBe("neither");
    expect(result.reason).toBe("empty_response");
  });

  it("does not flag empty_response when SDK text empty but workdir has matching file", async () => {
    writeFileSync(path.join(wd, "out.ts"), "const GOOD_VAR = 1;");
    const sdk = new FakeSdkRunner();
    sdk.setResponse("make me code", { output: "", tokensIn: 0, tokensOut: 0 });
    const result = await runTask(task, group, sdk, wd, 1);
    expect(result.verdict).toBe("correct");
  });
});
