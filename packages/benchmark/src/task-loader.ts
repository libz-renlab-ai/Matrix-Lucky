import { readFile, glob } from "node:fs/promises";
import { z } from "zod";
import type { CompiledTask, Task } from "./types.js";

const PatternEvaluatorSchema = z.object({
  type: z.literal("pattern"),
  wrong_patterns: z.array(z.string()),
  correct_patterns: z.array(z.string()),
});

const TaskSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  category: z.string().min(1),
  prompt: z.string().min(1),
  evaluator: PatternEvaluatorSchema,
});

export async function loadTasks(globPattern: string): Promise<CompiledTask[]> {
  const paths: string[] = [];
  for await (const p of glob(globPattern)) paths.push(p);
  paths.sort();

  const tasks: CompiledTask[] = [];
  for (const p of paths) {
    const raw = await readFile(p, "utf8");
    const parsed = JSON.parse(raw) as unknown;
    const task: Task = TaskSchema.parse(parsed);
    const compiledWrongRegex = task.evaluator.wrong_patterns.map((s) => compileOrThrow(s, p));
    const compiledCorrectRegex = task.evaluator.correct_patterns.map((s) => compileOrThrow(s, p));
    tasks.push({ ...task, compiledWrongRegex, compiledCorrectRegex });
  }
  return tasks;
}

function compileOrThrow(pattern: string, file: string): RegExp {
  try {
    return new RegExp(pattern);
  } catch (e) {
    throw new Error(`regex compile failed in ${file}: ${pattern} (${(e as Error).message})`);
  }
}
