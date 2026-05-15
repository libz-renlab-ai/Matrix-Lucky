import { describe, it, expect } from "vitest";
import { evaluatePatterns } from "../evaluator.js";
import type { CompiledTask } from "../types.js";

function makeTask(wrong: string[], correct: string[]): CompiledTask {
  return {
    id: "t",
    name: "t",
    category: "x",
    prompt: "p",
    evaluator: { type: "pattern", wrong_patterns: wrong, correct_patterns: correct },
    compiledWrongRegex: wrong.map((s) => new RegExp(s)),
    compiledCorrectRegex: correct.map((s) => new RegExp(s)),
  };
}

describe("evaluatePatterns", () => {
  it("returns correct when only correct pattern matches", () => {
    const task = makeTask(["moment"], ["dayjs"]);
    expect(evaluatePatterns("import dayjs from 'dayjs'", task).verdict).toBe("correct");
  });

  it("returns wrong when wrong pattern matches", () => {
    const task = makeTask(["moment"], ["dayjs"]);
    expect(evaluatePatterns("import moment from 'moment'", task).verdict).toBe("wrong");
  });

  it("returns wrong when both match (wrong takes priority)", () => {
    const task = makeTask(["moment"], ["dayjs"]);
    expect(evaluatePatterns("moment + dayjs", task).verdict).toBe("wrong");
  });

  it("returns neither when nothing matches", () => {
    const task = makeTask(["moment"], ["dayjs"]);
    expect(evaluatePatterns("new Date().toISOString()", task).verdict).toBe("neither");
  });

  it("includes matched pattern in reason", () => {
    const task = makeTask(["moment"], ["dayjs"]);
    const r = evaluatePatterns("import moment", task);
    expect(r.reason).toContain("moment");
  });
});
