import type { CompiledTask, GroupConfig, TaskResult } from "./types.js";
import type { SdkRunner } from "./sdk-runner.js";
import { evaluatePatterns } from "./evaluator.js";
import { scanWorkdirSources } from "./workdir-scanner.js";

export async function runTask(
  task: CompiledTask,
  group: GroupConfig,
  sdk: SdkRunner,
  workdir: string,
  run: number,
): Promise<TaskResult> {
  const start = Date.now();
  const prompt = `${task.prompt}\n\nIMPORTANT: Your working directory is ${workdir}. Create files directly under this directory using the Write tool. If the Write tool returns a permission denial with an alternative (dayjs, AbortController, item.id, etc.), use that alternative immediately on the next attempt — do not ask for confirmation, just write the file with the suggested approach.`;
  try {
    const sdkResult = await sdk.run(prompt, workdir);
    const durationMs = Date.now() - start;
    const workdirSources = await scanWorkdirSources(workdir);
    // If the task produced real source files, evaluate only those — assistant
    // narrative often mentions the wrong pattern when describing what it
    // declined to do, which would falsely flip the verdict to "wrong".
    // When no files were produced, fall back to the assistant text so empty
    // runs still surface as "neither".
    const evalTarget = workdirSources || sdkResult.output;

    if (evalTarget === "") {
      return {
        group: group.name,
        taskId: task.id,
        run,
        verdict: "neither",
        reason: "empty_response",
        tokensIn: sdkResult.tokensIn,
        tokensOut: sdkResult.tokensOut,
        cacheReadTokens: sdkResult.cacheReadTokens,
        cacheCreationTokens: sdkResult.cacheCreationTokens,
        durationMs,
        output: "",
      };
    }

    const { verdict, reason } = evaluatePatterns(evalTarget, task);
    const combined = sdkResult.output + (workdirSources ? `\n${workdirSources}` : "");
    return {
      group: group.name,
      taskId: task.id,
      run,
      verdict,
      reason,
      tokensIn: sdkResult.tokensIn,
      tokensOut: sdkResult.tokensOut,
      cacheReadTokens: sdkResult.cacheReadTokens,
      cacheCreationTokens: sdkResult.cacheCreationTokens,
      durationMs,
      output: combined,
    };
  } catch (e) {
    return {
      group: group.name,
      taskId: task.id,
      run,
      verdict: "error",
      reason: "sdk_error",
      tokensIn: 0,
      tokensOut: 0,
      cacheReadTokens: 0,
      cacheCreationTokens: 0,
      durationMs: Date.now() - start,
      output: "",
      errorMsg: e instanceof Error ? e.message : String(e),
    };
  }
}
