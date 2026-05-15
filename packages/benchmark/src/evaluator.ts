import type { CompiledTask, Verdict } from "./types.js";

export function evaluatePatterns(
  output: string,
  task: CompiledTask,
): { verdict: Verdict; reason?: string } {
  for (const re of task.compiledWrongRegex) {
    if (re.test(output)) return { verdict: "wrong", reason: `matched wrong: ${re.source}` };
  }
  for (const re of task.compiledCorrectRegex) {
    if (re.test(output)) return { verdict: "correct", reason: `matched correct: ${re.source}` };
  }
  return { verdict: "neither" };
}
