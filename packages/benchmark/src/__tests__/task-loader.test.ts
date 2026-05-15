import { describe, it, expect, beforeEach } from "vitest";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { loadTasks } from "../task-loader.js";

let dir: string;

beforeEach(() => {
  dir = mkdtempSync(path.join(tmpdir(), "bench-loader-"));
});

const validTask = {
  id: "t1",
  name: "test",
  category: "x",
  prompt: "do thing",
  evaluator: {
    type: "pattern",
    wrong_patterns: ["foo"],
    correct_patterns: ["bar"],
  },
};

describe("loadTasks", () => {
  it("loads valid task JSON", async () => {
    writeFileSync(path.join(dir, "t1.json"), JSON.stringify(validTask));
    const tasks = await loadTasks(path.join(dir, "*.json"));
    expect(tasks).toHaveLength(1);
    expect(tasks[0]!.id).toBe("t1");
  });

  it("compiles regex patterns", async () => {
    writeFileSync(path.join(dir, "t1.json"), JSON.stringify(validTask));
    const tasks = await loadTasks(path.join(dir, "*.json"));
    expect(tasks[0]!.compiledWrongRegex[0]!.test("foo bar")).toBe(true);
    expect(tasks[0]!.compiledCorrectRegex[0]!.test("foo bar")).toBe(true);
  });

  it("throws on schema violation (missing field)", async () => {
    const bad = { ...validTask, id: undefined };
    writeFileSync(path.join(dir, "bad.json"), JSON.stringify(bad));
    await expect(loadTasks(path.join(dir, "*.json"))).rejects.toThrow(/id/);
  });

  it("throws on regex compile failure", async () => {
    const bad = { ...validTask, evaluator: { ...validTask.evaluator, wrong_patterns: ["[invalid"] } };
    writeFileSync(path.join(dir, "bad.json"), JSON.stringify(bad));
    await expect(loadTasks(path.join(dir, "*.json"))).rejects.toThrow(/regex|invalid/i);
  });

  it("returns empty array when no files match", async () => {
    const tasks = await loadTasks(path.join(dir, "nope*.json"));
    expect(tasks).toEqual([]);
  });
});
