import type { Scenario } from "../../packages/core/src/index.js";

/**
 * 场景 3: api-hallucination
 *
 * AI 用了一个不存在的方法（如 array.removeAt 这种 .NET 风格但 JS 没有），
 * 用户纠正用 splice。系统学到，下次 Edit 含 removeAt 时拦截。
 */
export const apiHallucinationScenario: Scenario = {
  id: "api-hallucination",
  description: "AI 写了 JS 数组 .removeAt(i) (不存在)，用户纠正用 splice；下次拦截",
  meta: { category: "code" },
  phaseA: {
    session: {
      sessionId: "scenario-api-hallucination",
      startTime: "2026-04-15T00:00:00Z",
      endTime: "2026-04-15T00:10:00Z",
      turns: [
        {
          turnIndex: 0,
          userMessage: "从这个数组里删掉第 3 个元素",
          assistantText: "好，用 array.removeAt(3) 就行",
          toolCalls: [
            {
              id: "t1",
              name: "Edit",
              input: {
                file_path: "src/list.ts",
                old_string: "// remove item",
                new_string: "items.removeAt(3);",
              },
              succeeded: true,
            },
          ],
          timestamp: "2026-04-15T00:01:00Z",
        },
        {
          turnIndex: 1,
          userMessage: "错了，JS 数组没有 removeAt 方法，用 splice(3, 1)",
          assistantText: "对，我搞混了 .NET 和 JS",
          toolCalls: [
            {
              id: "t2",
              name: "Edit",
              input: {
                file_path: "src/list.ts",
                old_string: "items.removeAt(3);",
                new_string: "items.splice(3, 1);",
              },
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
      category: "C",
      tags: ["javascript", "array", "api"],
      type: "avoidance",
      nature: "objective",
      trigger: "需要从 JavaScript 数组中删除元素",
      wrong_pattern: ".removeAt(",
      correct_pattern: ".splice(",
      reasoning: "JavaScript Array 没有 removeAt 方法（这是 .NET 风格）；标准做法是 Array.prototype.splice(index, 1)",
    }),
    expectedRule: {
      categoryEquals: "C",
      typeEquals: "avoidance",
      natureEquals: "objective",
      wrongPatternContains: "removeAt",
      correctPatternContains: "splice",
    },
  },
  phaseC: {
    toolCall: {
      toolName: "Edit",
      input: {
        file_path: "src/another.ts",
        old_string: "// here",
        new_string: "list.removeAt(0);",
      },
    },
    // objective + 0.95 → block
    expectedBehavior: "block",
  },
};
