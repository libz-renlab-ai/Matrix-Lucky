import type { Scenario } from "../../packages/core/src/index.js";

/**
 * 场景 5: workflow-order（git add 太宽）
 *
 * 用户多次纠正 AI 用 `git add .` 而非具体文件路径。
 * 系统学到，下次 Bash `git add .` → warn (subjective)。
 */
export const workflowOrderScenario: Scenario = {
  id: "workflow-order",
  description: "AI 用 'git add .' 太宽；用户教只 add 具体文件；下次 warn 提醒",
  meta: { category: "strategy" },
  phaseA: {
    session: {
      sessionId: "scenario-workflow-order",
      startTime: "2026-04-15T00:00:00Z",
      endTime: "2026-04-15T00:10:00Z",
      turns: [
        {
          turnIndex: 0,
          userMessage: "把这次的修改提交了",
          assistantText: "好，git add . 然后 commit",
          toolCalls: [
            { id: "t1", name: "Bash", input: { command: "git add ." }, succeeded: true },
          ],
          timestamp: "2026-04-15T00:01:00Z",
        },
        {
          turnIndex: 1,
          userMessage: "不对，git add . 太宽容易把 .env 这种带进去，要 add 具体文件",
          assistantText: "对，应该明确",
          toolCalls: [
            {
              id: "t2",
              name: "Bash",
              input: { command: "git add src/api.ts src/utils.ts" },
              succeeded: true,
            },
          ],
          timestamp: "2026-04-15T00:02:00Z",
        },
      ],
    },
    expectedCorrections: [
      { signal: "explicit_denial", minWeight: 0.9, turnIndex: 1 },
    ],
  },
  phaseB: {
    mockLLMResponse: JSON.stringify({
      category: "S",
      tags: ["git", "workflow", "safety"],
      type: "avoidance",
      nature: "subjective",
      trigger: "git 提交前 staging 文件",
      wrong_pattern: "git add .|git add -A",
      correct_pattern: "git add <具体文件>",
      reasoning: "git add . 容易把 .env / credentials / 大文件等敏感或不该入库的内容带进去；明确加文件更安全",
    }),
    expectedRule: {
      categoryEquals: "S",
      typeEquals: "avoidance",
      natureEquals: "subjective",
      wrongPatternContains: "git add .",
      correctPatternContains: "具体文件",
    },
  },
  phaseC: {
    toolCall: {
      toolName: "Bash",
      input: { command: "git add ." },
    },
    // subjective → max enforcement = warn
    expectedBehavior: "warn",
  },
};
